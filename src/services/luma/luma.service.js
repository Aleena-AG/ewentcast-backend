class LumaApiError extends Error {
  constructor(message, statusCode = 400, errorCode) {
    super(message);
    this.name = "LumaApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

function isMaskedSecret(s) {
  return !!s && s.includes("*");
}

function getConfig(settings) {
  const apiKey = settings.luma.apiKey?.trim() || "";
  const base = (settings.luma.apiBaseUrl || "https://public-api.luma.com").replace(/\/$/, "");
  if (!apiKey || isMaskedSecret(apiKey)) {
    throw new LumaApiError("Luma API key not configured. Go to Settings → Luma.", 400);
  }
  return { apiKey, base };
}

async function lumaRequest(settings, method, path, opts = {}) {
  const { apiKey, base } = getConfig(settings);
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  const init = {
    method,
    headers: {
      "x-luma-api-key": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (opts.body && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = String(data.message || data.error || text || `Luma HTTP ${res.status}`);
    throw new LumaApiError(msg, res.status, String(data.error || ""));
  }
  return data;
}

async function listHostedEvents(settings, query = {}) {
  const fetchAll = query.fetch_all === "true";
  const upcomingOnly = query.upcoming_only !== "false";

  const params = {
    platforms: "luma",
    status: "approved",
    sort_column: "start_at",
    sort_direction: "asc nulls last",
    ...query,
  };
  delete params.fetch_all;
  delete params.upcoming_only;

  if (upcomingOnly && !params.after) {
    params.after = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  if (!fetchAll) {
    const result = await lumaRequest(settings, "GET", "/v1/calendars/events/list", { query: params });
    return { ...result, source: "luma_calendar_hosted" };
  }

  const allEntries = [];
  let cursor = null;
  do {
    if (cursor) params.pagination_cursor = cursor;
    else delete params.pagination_cursor;
    const page = await lumaRequest(settings, "GET", "/v1/calendars/events/list", { query: params });
    if (Array.isArray(page.entries)) allEntries.push(...page.entries);
    cursor = page.next_cursor ? String(page.next_cursor) : null;
  } while (cursor);

  return {
    entries: allEntries,
    count: allEntries.length,
    has_more: false,
    source: "luma_calendar_hosted",
  };
}

function guestsQueryForEvent(eventId) {
  return { event_id: eventId, event_api_id: eventId };
}

async function listEventGuests(settings, eventId) {
  const id = String(eventId || "").trim();
  if (!id) throw new LumaApiError("event_id required", 400);

  const attempts = [
    { path: "/v1/events/guests/list", baseQuery: guestsQueryForEvent(id) },
    { path: "/v1/event/get-guests", baseQuery: { event_api_id: id } },
  ];

  let lastErr = null;
  for (const { path, baseQuery } of attempts) {
    try {
      const allEntries = [];
      const params = { ...baseQuery };
      let cursor = null;
      let pages = 0;
      do {
        if (cursor) params.pagination_cursor = cursor;
        else delete params.pagination_cursor;
        const page = await lumaRequest(settings, "GET", path, { query: params });
        if (Array.isArray(page.entries)) {
          for (const entry of page.entries) {
            if (entry && typeof entry === "object" && "guest" in entry) {
              allEntries.push(entry.guest);
            } else {
              allEntries.push(entry);
            }
          }
        }
        cursor = page.next_cursor ? String(page.next_cursor) : null;
        if (!page.has_more) cursor = null;
        pages++;
      } while (cursor && pages < 50);

      return { entries: allEntries, count: allEntries.length, total: allEntries.length };
    } catch (e) {
      if (e instanceof LumaApiError) lastErr = e;
    }
  }

  throw lastErr || new LumaApiError(`Could not list guests for event ${id}`, 404);
}

function unwrapLumaEvent(entry) {
  if (!entry || typeof entry !== "object") return {};
  return entry.event || entry;
}

function lumaHostedEventRef(entry) {
  const event = unwrapLumaEvent(entry);
  return {
    id: String(event.api_id || event.id || entry.api_id || entry.id || ""),
    name: String(event.name || entry.name || "Untitled"),
  };
}

function normalizeLumaGuest(raw, eventTitle, eventExternalId) {
  const guest = raw.guest || raw.user;
  const email = String(guest?.email || raw.email || raw.user_email || "").trim();
  if (!email) return null;
  const name =
    String(guest?.name || raw.name || raw.user_name || "").trim() ||
    email.split("@")[0] ||
    "Guest";
  const registeredAt = String(
    raw.registered_at || raw.created_at || raw.approval_status_at || new Date().toISOString()
  );
  return {
    id: `luma-${raw.api_id || raw.id || email}-${registeredAt}`,
    email,
    name,
    guest_name: name,
    guest_email: email,
    event_title: eventTitle,
    event_external_id: eventExternalId,
    registered_at: registeredAt,
    status: raw.approval_status || raw.registration_status || null,
    ticket_count: 1,
    ...raw,
  };
}

async function fetchEventsForSync(settings) {
  const list = await listHostedEvents(settings, {
    upcoming_only: "false",
    fetch_all: "true",
  });
  return Array.isArray(list.entries) ? list.entries : [];
}

async function fetchBookingsForSync(settings, events) {
  const refs = events
    .map((entry) => lumaHostedEventRef(entry))
    .filter((e) => e.id);
  const bookings = [];
  const concurrency = 3;

  for (let i = 0; i < refs.length; i += concurrency) {
    const chunk = refs.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (e) => {
        try {
          const guests = await listEventGuests(settings, e.id);
          for (const entry of guests.entries || []) {
            const item = normalizeLumaGuest(entry, e.name, e.id);
            if (item) bookings.push(item);
          }
        } catch {
          // skip event
        }
      })
    );
  }

  return bookings;
}

async function createEvent(settings, body) {
  // Luma public API create endpoint
  return lumaRequest(settings, "POST", "/v1/event/create", { body });
}

module.exports = {
  LumaApiError,
  lumaRequest,
  createEvent,
  listHostedEvents,
  listEventGuests,
  fetchEventsForSync,
  fetchBookingsForSync,
  lumaHostedEventRef,
};
