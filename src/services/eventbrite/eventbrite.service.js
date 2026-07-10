class EventbriteApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "EventbriteApiError";
    this.statusCode = statusCode;
  }
}

function getToken(settings) {
  const token = settings.eventbrite.privateToken?.trim() || "";
  if (!token || token.includes("*")) {
    throw new EventbriteApiError(
      "Eventbrite private token not configured. Go to Settings → Eventbrite.",
      400
    );
  }
  return token;
}

async function ebRequest(settings, path, query = {}) {
  const token = getToken(settings);
  const url = new URL(`https://www.eventbriteapi.com/v3/${path.replace(/^\//, "")}`);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new EventbriteApiError(
      String(data.error_description || data.error || text || `Eventbrite HTTP ${res.status}`),
      res.status
    );
  }
  return data;
}

async function fetchEventsForSync(settings) {
  const orgData = await ebRequest(settings, "users/me/organizations");
  const orgId = orgData.organizations?.[0]?.id;
  if (!orgId) return [];

  const evtData = await ebRequest(settings, `organizations/${orgId}/events`, {
    page_size: "50",
  });
  return evtData.events || [];
}

function normalizeEbAttendee(raw, eventTitle) {
  const profile = raw.profile || {};
  const email = String(profile.email || raw.email || "").trim();
  if (!email) return null;
  const first = profile.first_name || "";
  const last = profile.last_name || "";
  const name =
    String(profile.name || "").trim() ||
    [first, last].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    "Guest";
  const registeredAt = String(raw.created || raw.changed || new Date().toISOString());

  return {
    id: `eb-${raw.id ?? email}-${registeredAt}`,
    email,
    name,
    guest_name: name,
    guest_email: email,
    event_title: eventTitle,
    event_external_id: raw.event_id ? String(raw.event_id) : null,
    registered_at: registeredAt,
    status: raw.status || null,
    ticket_count: typeof raw.quantity === "number" ? raw.quantity : null,
    ...raw,
  };
}

async function fetchBookingsForSync(settings, events) {
  const list = [];
  const concurrency = 2;

  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (e) => {
        const eventTitle =
          typeof e.name === "string" ? e.name : e.name?.text || "Untitled";
        try {
          let page = 1;
          let hasMore = true;
          while (hasMore && page <= 5) {
            const data = await ebRequest(settings, `events/${e.id}/attendees`, {
              status: "attending",
              page: String(page),
              page_size: "50",
            });
            for (const raw of data.attendees || []) {
              const item = normalizeEbAttendee(raw, eventTitle);
              if (item) list.push(item);
            }
            hasMore = !!data.pagination?.has_more_items;
            page++;
          }
        } catch {
          // skip event
        }
      })
    );
    if (i + concurrency < events.length) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  return list;
}

module.exports = {
  EventbriteApiError,
  ebRequest,
  fetchEventsForSync,
  fetchBookingsForSync,
};
