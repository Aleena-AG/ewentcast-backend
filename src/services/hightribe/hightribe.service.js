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

async function htRequest(userId, path, query = {}) {
  const { base, token } = await resolveHtAuth(userId);
  const url = new URL(`${base}/api/${path.replace(/^\//, "")}`);
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
    throw new HightribeApiError(
      String(data.message || data.error || text || `Hightribe HTTP ${res.status}`),
      res.status
    );
  }
  return data;
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

module.exports = {
  HightribeApiError,
  htRequest,
  fetchEventsPage,
  fetchBookingsPage,
  fetchEventsForSync,
  fetchBookingsForSync,
  resolveHtAuth,
};
