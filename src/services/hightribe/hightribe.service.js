const { getHtConnection, getUserSettings } = require("../settings.service");

class HightribeApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "HightribeApiError";
    this.statusCode = statusCode;
  }
}

async function resolveHtAuth(userId) {
  const settings = await getUserSettings(userId);
  const connection = await getHtConnection(userId);
  const base = (
    settings.hightribe.serviceUrl ||
    process.env.HT_API_BASE ||
    "https://api.hightribe.com"
  ).replace(/\/$/, "");
  const token = connection?.htToken || settings.hightribe.apiKey || "";
  if (!token || String(token).includes("*")) {
    throw new HightribeApiError(
      "Hightribe not connected. Connect Hightribe account or set API token.",
      400
    );
  }
  return { base, token, settings, connection };
}

function normalizeHtTicketFlags(body) {
  if (!body || typeof body !== "object") return body;
  const out = { ...body };
  if (Array.isArray(out.tickets)) {
    out.tickets = out.tickets.map((t) => {
      if (!t || typeof t !== "object") return t;
      const ticket = { ...t };
      if (typeof ticket.show_ticket === "boolean") {
        ticket.show_ticket = ticket.show_ticket ? 1 : 0;
      }
      if (typeof ticket.show_ticket_quantity === "boolean") {
        ticket.show_ticket_quantity = ticket.show_ticket_quantity ? 1 : 0;
      }
      return ticket;
    });
  }
  // Flat multipart keys: tickets[0][show_ticket]=true
  for (const key of Object.keys(out)) {
    if (/^tickets\[\d+]\[show_ticket(_quantity)?]$/.test(key)) {
      const v = out[key];
      if (v === true || v === "true") out[key] = "1";
      if (v === false || v === "false") out[key] = "0";
    }
  }
  return out;
}

function appendFormValue(form, key, value) {
  if (value === undefined || value === null) return;
  if (typeof File !== "undefined" && value instanceof File) {
    form.append(key, value);
    return;
  }
  if (Buffer.isBuffer(value)) {
    form.append(key, new Blob([value]));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => appendFormValue(form, `${key}[${i}]`, item));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      appendFormValue(form, `${key}[${k}]`, v);
    }
    return;
  }
  if (typeof value === "boolean") {
    form.append(key, value ? "1" : "0");
    return;
  }
  form.append(key, String(value));
}

function buildHtOutboundForm(fields, files = []) {
  const form = new FormData();
  const body = normalizeHtTicketFlags(fields || {});
  for (const [key, value] of Object.entries(body)) {
    // Skip empty file placeholders already handled via files[]
    if (key === "cover_image" && (value === "" || value == null)) continue;
    appendFormValue(form, key, value);
  }
  for (const f of files) {
    const blob = new Blob([f.buffer], { type: f.mimetype || "application/octet-stream" });
    form.append(f.fieldname || "cover_image", blob, f.originalname || "cover.jpg");
  }
  return form;
}

function htErrorMessage(data, status, text) {
  if (data?.errors && typeof data.errors === "object") {
    const parts = Object.entries(data.errors).flatMap(([field, msgs]) => {
      const list = Array.isArray(msgs) ? msgs : [msgs];
      return list.map((m) => `${field}: ${m}`);
    });
    if (parts.length) return parts.join("; ");
  }
  return String(data.message || data.error || text || `Hightribe HTTP ${status}`);
}

async function htRequest(userId, path, query = {}, opts = {}) {
  const { base, token } = await resolveHtAuth(userId);
  const method = opts.method || "GET";
  const url = new URL(`${base}/api/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let body;
  if (opts.formData) {
    body = opts.formData;
    // Let fetch set multipart boundary — do not set Content-Type
  } else if (opts.body != null && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), { method, headers, body });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new HightribeApiError(htErrorMessage(data, res.status, text), res.status);
  }
  return data;
}

async function createEvent(userId, body, files = []) {
  const hasMultipart =
    files.length > 0 ||
    Object.keys(body || {}).some((k) => k.includes("["));

  if (hasMultipart) {
    return htRequest(userId, "events", {}, {
      method: "POST",
      formData: buildHtOutboundForm(body, files),
    });
  }
  return htRequest(userId, "events", {}, {
    method: "POST",
    body: normalizeHtTicketFlags(body),
  });
}

async function createEventWithTickets(userId, body, files = []) {
  const hasMultipart =
    files.length > 0 ||
    // Flat bracket keys mean the client used FormData
    Object.keys(body || {}).some((k) => k.includes("["));

  if (hasMultipart || files.length > 0) {
    return htRequest(userId, "events/with-tickets", {}, {
      method: "POST",
      formData: buildHtOutboundForm(body, files),
    });
  }

  return htRequest(userId, "events/with-tickets", {}, {
    method: "POST",
    body: normalizeHtTicketFlags(body),
  });
}

async function updateEvent(userId, eventId, body, files = []) {
  const id = String(eventId || "").trim();
  if (!id) throw new HightribeApiError("event id required", 400);

  const hasMultipart =
    files.length > 0 ||
    Object.keys(body || {}).some((k) => k.includes("["));

  if (hasMultipart || files.length > 0) {
    return htRequest(userId, `events/${id}`, {}, {
      method: "POST",
      formData: buildHtOutboundForm(body, files),
    });
  }

  return htRequest(userId, `events/${id}`, {}, {
    method: "PUT",
    body: normalizeHtTicketFlags(body),
  });
}

async function fetchEventsPage(userId, page = 1, perPage = 50) {
  const data = await htRequest(userId, "events", {
    page: String(page),
    per_page: String(perPage),
  });
  const events = data.data || [];
  const meta = data.meta || {};
  return {
    events,
    currentPage: meta.current_page ?? data.current_page ?? page,
    lastPage: meta.last_page ?? data.last_page ?? 1,
    total: meta.total ?? data.total ?? events.length,
  };
}

async function fetchBookingsPage(userId, page = 1, perPage = 50) {
  const data = await htRequest(userId, "events/bookings", {
    page: String(page),
    per_page: String(perPage),
  });
  return {
    bookings: data.data || [],
    total: data.total ?? (data.data?.length ?? 0),
    currentPage: data.current_page ?? page,
    lastPage: data.last_page ?? 1,
  };
}

async function fetchEventsForSync(userId) {
  const all = [];
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage && page <= 20) {
    const res = await fetchEventsPage(userId, page, 50);
    all.push(...res.events);
    lastPage = res.lastPage;
    page++;
  }
  return all;
}

function normalizeHtBooking(raw) {
  const user = raw.user || {};
  const phone = raw.phone ? String(raw.phone).trim() : "";
  const email = String(user.email || raw.email || phone || "").trim() || "—";
  const registeredAt = String(raw.booking_date || raw.created_at || new Date().toISOString());
  const name = String(raw.guest_name || user.name || "Guest");

  return {
    id: `ht-${raw.id ?? registeredAt}`,
    email,
    name,
    guest_name: name,
    guest_email: email,
    event_title: String(raw.title || "Event"),
    event_external_id: raw.event_id ? String(raw.event_id) : null,
    registered_at: registeredAt,
    status: raw.status ? String(raw.status) : null,
    ticket_count: typeof raw.ticket_count === "number" ? raw.ticket_count : null,
    ...raw,
  };
}

async function fetchBookingsForSync(userId) {
  const list = [];
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage && page <= 20) {
    const res = await fetchBookingsPage(userId, page, 50);
    for (const raw of res.bookings) {
      if (raw && typeof raw === "object") {
        list.push(normalizeHtBooking(raw));
      }
    }
    lastPage = res.lastPage;
    page++;
  }
  return list;
}

async function loginWithPassword({ email, password, serviceUrl }) {
  const base = (
    serviceUrl ||
    process.env.HT_API_BASE ||
    "https://api.hightribe.com"
  ).replace(/\/$/, "");

  const emailTrim = String(email || "").trim();
  const pass = String(password || "");
  if (!emailTrim || !pass) {
    throw new HightribeApiError("Email and password are required", 422);
  }

  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: emailTrim, password: pass }),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new HightribeApiError(
      String(data.message || data.error || text || `Hightribe login HTTP ${res.status}`),
      res.status >= 400 && res.status < 600 ? res.status : 400
    );
  }

  const nested = data.data && typeof data.data === "object" ? data.data : null;
  const tokenRaw =
    data.token ||
    data.access_token ||
    data.apiKey ||
    data.api_key ||
    nested?.token ||
    nested?.access_token ||
    nested?.apiKey ||
    nested?.api_key ||
    "";

  const token = String(tokenRaw || "").trim().replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new HightribeApiError("Hightribe login succeeded but no token was returned", 502);
  }

  const user =
    data.user ||
    nested?.user ||
    (data.data && typeof data.data === "object" && !Array.isArray(data.data) ? data.data : null);

  return {
    success: true,
    status: true,
    token,
    access_token: token,
    apiKey: token,
    user: user || undefined,
    serviceUrl: base,
    message: data.message || "Login successful",
  };
}

module.exports = {
  HightribeApiError,
  htRequest,
  loginWithPassword,
  createEvent,
  createEventWithTickets,
  updateEvent,
  fetchEventsPage,
  fetchBookingsPage,
  fetchEventsForSync,
  fetchBookingsForSync,
  resolveHtAuth,
};
