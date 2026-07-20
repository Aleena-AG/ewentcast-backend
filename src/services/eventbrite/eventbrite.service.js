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

async function ebRequest(settings, path, query = {}, opts = {}) {
  const token = getToken(settings);
  const method = opts.method || "GET";
  const url = new URL(`https://www.eventbriteapi.com/v3/${path.replace(/^\//, "")}`);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const init = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  };
  if (opts.body != null && method !== "GET" && method !== "HEAD") {
    init.headers["Content-Type"] = "application/json";
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
    throw new EventbriteApiError(
      String(data.error_description || data.error || text || `Eventbrite HTTP ${res.status}`),
      res.status
    );
  }
  return data;
}

async function listOrganizations(settings) {
  return ebRequest(settings, "users/me/organizations");
}

/**
 * Eventbrite rejects create/update when both `summary` and `description`
 * are set ("Summary and Description cannot both be provided.").
 * Prefer `summary` (current EB listing teaser); drop deprecated `description`.
 */
function sanitizeEventbriteEventBody(body) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  const event =
    next.event && typeof next.event === "object" ? { ...next.event } : null;
  const target = event || next;
  const hasSummary =
    target.summary != null && String(target.summary).trim() !== "";
  if (hasSummary && target.description != null) {
    delete target.description;
  }
  if (event) next.event = target;
  return next;
}

function truthyFlag(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function costIsZero(cost) {
  if (cost == null || cost === "") return true;
  if (typeof cost === "number") return !Number.isFinite(cost) || cost <= 0;
  if (typeof cost === "object") {
    const value = Number(cost.value ?? cost.major_value ?? cost.amount);
    return !Number.isFinite(value) || value <= 0;
  }
  const s = String(cost).trim();
  // Formats: "USD,0" | "USD,000" | "0" | "USD,0.00"
  const m = s.match(/^[A-Z]{3},(.+)$/i) || s.match(/^(.+)$/);
  const amount = Number(String(m?.[1] ?? s).replace(/[^\d.-]/g, ""));
  return !Number.isFinite(amount) || amount <= 0;
}

/**
 * Normalize ticket_class cost to Eventbrite string form "USD,1000".
 * Free / zero-cost tickets must omit `cost` entirely ("Free ticket classes should not have a cost.").
 */
function sanitizeTicketClassFields(tc) {
  if (!tc || typeof tc !== "object") return tc;
  const next = { ...tc };

  const isFree =
    truthyFlag(next.free) ||
    truthyFlag(next.is_free) ||
    costIsZero(next.cost);

  if (isFree) {
    next.free = true;
    delete next.cost;
    delete next.is_free;
    // Fees only apply to paid tickets
    delete next.include_fee;
    delete next.fee;
    return next;
  }

  next.free = false;
  if (next.cost != null && typeof next.cost === "object") {
    const currency = String(
      next.cost.currency || next.cost.currency_code || "USD"
    )
      .trim()
      .toUpperCase() || "USD";
    const value = Number(next.cost.value ?? next.cost.major_value ?? 0);
    if (Number.isFinite(value) && value > 0) {
      next.cost = `${currency},${Math.round(value)}`;
    } else {
      next.free = true;
      delete next.cost;
    }
  }

  return next;
}

function sanitizeEventbriteTicketClassBody(body) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  if (next.ticket_class && typeof next.ticket_class === "object") {
    next.ticket_class = sanitizeTicketClassFields(next.ticket_class);
  } else if (
    next.name != null ||
    next.cost != null ||
    next.free != null ||
    next.quantity_total != null
  ) {
    // Bare ticket_class fields at top level
    return sanitizeTicketClassFields(next);
  }
  return next;
}

function extractTicketClasses(body = {}) {
  const raw = body.ticket_classes ?? body.tickets;
  if (Array.isArray(raw)) return raw.filter((t) => t && typeof t === "object");
  return [];
}

function eventBodyWithoutTickets(body = {}) {
  const next = { ...(body || {}) };
  delete next.ticket_classes;
  delete next.tickets;
  return next;
}

function wrapTicketClassBody(ticket) {
  if (!ticket || typeof ticket !== "object") return { ticket_class: {} };
  if (ticket.ticket_class && typeof ticket.ticket_class === "object") {
    return sanitizeEventbriteTicketClassBody(ticket);
  }
  const { id, ...fields } = ticket;
  return sanitizeEventbriteTicketClassBody({ ticket_class: fields });
}

async function createOrganizationEvent(settings, orgId, body) {
  return ebRequest(settings, `organizations/${orgId}/events`, {}, {
    method: "POST",
    body: sanitizeEventbriteEventBody(eventBodyWithoutTickets(body)),
  });
}

async function createTicketClass(settings, eventId, body) {
  const id = String(eventId || "").trim();
  if (!id) throw new EventbriteApiError("event id required", 400);
  return ebRequest(settings, `events/${id}/ticket_classes`, {}, {
    method: "POST",
    body: wrapTicketClassBody(body),
  });
}

async function updateTicketClass(settings, eventId, ticketClassId, body) {
  const eid = String(eventId || "").trim();
  const tid = String(ticketClassId || "").trim();
  if (!eid) throw new EventbriteApiError("event id required", 400);
  if (!tid) throw new EventbriteApiError("ticket class id required", 400);
  return ebRequest(settings, `events/${eid}/ticket_classes/${tid}`, {}, {
    method: "POST",
    body: wrapTicketClassBody(body),
  });
}

/**
 * Create event, then each ticket class (Eventbrite requires separate calls).
 * Body may include `ticket_classes` / `tickets` alongside `event`.
 */
async function createOrganizationEventWithTickets(settings, orgId, body = {}) {
  const tickets = extractTicketClasses(body);
  const event = await createOrganizationEvent(settings, orgId, body);
  const eventId = String(event?.id || "").trim();

  const ticket_classes = [];
  const ticket_errors = [];

  if (eventId && tickets.length) {
    for (let i = 0; i < tickets.length; i++) {
      try {
        const created = await createTicketClass(settings, eventId, tickets[i]);
        ticket_classes.push(created);
      } catch (err) {
        ticket_errors.push({
          index: i,
          name: tickets[i]?.name || tickets[i]?.ticket_class?.name || null,
          error: err instanceof Error ? err.message : String(err),
          statusCode: err.statusCode || 500,
        });
      }
    }
  }

  const result = { ...event, ticket_classes };
  if (ticket_errors.length) result.ticket_errors = ticket_errors;
  return result;
}

/**
 * Update an Eventbrite event (POST /v3/events/:id/).
 * `fields`: { title, description, startAt, endAt, timezone, onlineEvent, listed }
 * Or pass a full `{ event: { ... } }` body (native Eventbrite shape).
 */
async function updateEvent(settings, eventId, fields = {}) {
  const id = String(eventId || "").trim();
  if (!id) throw new EventbriteApiError("event id required", 400);

  // Native Eventbrite body: { event: { name, start, … } }
  if (fields.event && typeof fields.event === "object") {
    return ebRequest(settings, `events/${id}`, {}, {
      method: "POST",
      body: sanitizeEventbriteEventBody({ event: fields.event }),
    });
  }

  const event = {};
  const title = fields.title || fields.name;
  if (title) {
    event.name = { html: typeof title === "object" ? title.html || title.text : String(title) };
  }

  const description = fields.description || fields.description_html;
  if (description != null && String(description).trim() !== "") {
    // Prefer summary for short text; Eventbrite rejects both summary+description
    const text = String(description);
    if (text.length <= 140) {
      event.summary = text;
    } else {
      event.description = { html: text };
    }
  }
  if (fields.summary != null && String(fields.summary).trim() !== "") {
    event.summary = String(fields.summary);
    delete event.description;
  }

  const timezone = fields.timezone || fields.tz || "UTC";
  const startAt = fields.startAt || fields.start_at;
  const endAt = fields.endAt || fields.end_at;
  if (startAt) {
    event.start = {
      timezone,
      utc: String(startAt).replace(/\.\d{3}Z$/, "Z"),
    };
  }
  if (endAt) {
    event.end = {
      timezone,
      utc: String(endAt).replace(/\.\d{3}Z$/, "Z"),
    };
  }

  if (fields.onlineEvent != null || fields.online_event != null) {
    event.online_event = !!(fields.onlineEvent ?? fields.online_event);
  }
  if (fields.listed != null) {
    event.listed = !!fields.listed;
  }
  if (fields.logo_id != null) {
    event.logo_id = String(fields.logo_id);
  }

  if (!Object.keys(event).length) {
    throw new EventbriteApiError("No Eventbrite fields to update", 400);
  }

  return ebRequest(settings, `events/${id}`, {}, {
    method: "POST",
    body: sanitizeEventbriteEventBody({ event }),
  });
}

/**
 * Update event fields and/or ticket classes in one request.
 * Ticket with `id` → update; without → create.
 */
async function updateEventWithTickets(settings, eventId, body = {}) {
  const id = String(eventId || "").trim();
  if (!id) throw new EventbriteApiError("event id required", 400);

  const tickets = extractTicketClasses(body);
  const clean = eventBodyWithoutTickets(body);
  const hasEventPayload =
    (clean.event && typeof clean.event === "object" && Object.keys(clean.event).length > 0) ||
    clean.title != null ||
    clean.name != null ||
    clean.description != null ||
    clean.summary != null ||
    clean.startAt != null ||
    clean.start_at != null ||
    clean.endAt != null ||
    clean.end_at != null ||
    clean.timezone != null ||
    clean.logo_id != null;

  let event = null;
  if (hasEventPayload) {
    event = await updateEvent(settings, id, clean);
  }

  const ticket_classes = [];
  const ticket_errors = [];

  for (let i = 0; i < tickets.length; i++) {
    const tc = tickets[i];
    const tcId = String(tc.id || tc.ticket_class_id || tc.ticket_class?.id || "").trim();
    try {
      const result = tcId
        ? await updateTicketClass(settings, id, tcId, tc)
        : await createTicketClass(settings, id, tc);
      ticket_classes.push(result);
    } catch (err) {
      ticket_errors.push({
        index: i,
        id: tcId || null,
        name: tc?.name || tc?.ticket_class?.name || null,
        error: err instanceof Error ? err.message : String(err),
        statusCode: err.statusCode || 500,
      });
    }
  }

  const result = {
    ...(event && typeof event === "object" ? event : { id }),
    ticket_classes,
  };
  if (ticket_errors.length) result.ticket_errors = ticket_errors;
  return result;
}

/**
 * Forward any remaining /eventbrite/* path to Eventbrite v3.
 * Path is relative (e.g. events/123/structured_content/).
 */
/**
 * Attendees list rejects `page_size` (fixed at 50). Events list still accepts it.
 */
function sanitizeEbQuery(path, query = {}) {
  const next = { ...query };
  if (/(^|\/)attendees(\/|$)/i.test(path) && next.page_size != null) {
    delete next.page_size;
  }
  return next;
}

async function proxyToEventbrite(settings, method, path, query = {}, body) {
  const clean = String(path || "")
    .replace(/^\/+/, "")
    .replace(/\?.*$/, "");
  if (!clean) {
    throw new EventbriteApiError("Eventbrite path required", 400);
  }

  const upper = String(method || "GET").toUpperCase();
  let outboundBody = body;
  if (outboundBody && upper !== "GET" && upper !== "HEAD") {
    if (/(^|\/)ticket_classes(\/|$)/i.test(clean)) {
      outboundBody = sanitizeEventbriteTicketClassBody(outboundBody);
    } else if (/(^|\/)events(\/|$)/.test(clean) && outboundBody.event) {
      outboundBody = sanitizeEventbriteEventBody(outboundBody);
    }
  }

  return ebRequest(settings, clean, sanitizeEbQuery(clean, query), {
    method: upper,
    body: upper === "GET" || upper === "HEAD" ? undefined : outboundBody,
  });
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
  listOrganizations,
  createOrganizationEvent,
  createOrganizationEventWithTickets,
  createTicketClass,
  updateTicketClass,
  updateEvent,
  updateEventWithTickets,
  proxyToEventbrite,
  sanitizeEventbriteEventBody,
  sanitizeEventbriteTicketClassBody,
  fetchEventsForSync,
  fetchBookingsForSync,
};
