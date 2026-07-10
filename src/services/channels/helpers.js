const CHANNELS = ["luma", "eventbrite", "hightribe"];

const PRISMA_MODEL = {
  luma: "lumaEvent",
  eventbrite: "eventbriteEvent",
  hightribe: "hightribeEvent",
};

function parseChannel(raw) {
  if (CHANNELS.includes(raw)) return raw;
  return null;
}

function toIso(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function htStartAt(raw) {
  const dates = raw.dates;
  if (dates?.starts_at) return dates.starts_at;
  if (dates?.start_date) {
    return dates.start_time ? `${dates.start_date}T${dates.start_time}` : dates.start_date;
  }
  return raw.start_date || raw.start_at || raw.start;
}

function htEndAt(raw) {
  const dates = raw.dates;
  if (dates?.ends_at) return dates.ends_at;
  if (dates?.end_date) {
    return dates.end_time ? `${dates.end_date}T${dates.end_time}` : dates.end_date;
  }
  return raw.end_date || raw.end_at || raw.end;
}

function normalizeEvent(channel, raw) {
  if (channel === "luma") {
    const event = raw.event || raw;
    return {
      externalId: String(event.api_id || event.id || raw.api_id || raw.id || ""),
      title: String(event.name || raw.name || ""),
      startAt: parseDate(event.start_at || raw.start_at),
      endAt: parseDate(event.end_at || raw.end_at),
      timezone: String(event.timezone || raw.timezone || "") || null,
      url: String(event.url || raw.url || "") || null,
      coverUrl: String(event.cover_url || raw.cover_url || "") || null,
      locationJson: event.geo_address_json || raw.geo_address_json || null,
      meetingUrl: String(event.meeting_url || raw.meeting_url || "") || null,
      isFree: null,
      location: null,
      status: String(event.status || raw.status || "") || null,
    };
  }

  if (channel === "eventbrite") {
    const name = raw.name;
    const start = raw.start;
    const end = raw.end;
    const logo = raw.logo;
    return {
      externalId: String(raw.id || ""),
      title: String(name?.text || ""),
      startAt: parseDate(start?.utc),
      endAt: parseDate(end?.utc),
      timezone: null,
      url: String(raw.url || "") || null,
      coverUrl: String(logo?.original?.url || "") || null,
      locationJson: null,
      meetingUrl: null,
      isFree: !!raw.is_free,
      location: null,
      status: String(raw.status || "") || null,
    };
  }

  return {
    externalId: String(raw.id || raw.event_id || ""),
    title: String(raw.title || raw.name || ""),
    startAt: parseDate(htStartAt(raw)),
    endAt: parseDate(htEndAt(raw)),
    timezone: String(raw.timezone || "") || null,
    url: String(raw.url || "") || null,
    coverUrl: String(raw.cover_url || raw.image || "") || null,
    locationJson: null,
    meetingUrl: null,
    isFree: null,
    location: String(
      typeof raw.location === "string"
        ? raw.location
        : raw.location?.venue_name || raw.location?.address || raw.venue || ""
    ) || null,
    status: String(raw.publish_status || raw.status || "") || null,
  };
}

function normalizeBooking(raw) {
  const externalId = String(raw.id || raw.external_id || "").trim();
  const email = String(raw.email || raw.guest_email || "").trim().toLowerCase();
  if (!externalId || !email) return null;

  const registeredAtRaw = raw.registered_at || raw.registeredAt;
  const registeredAt = registeredAtRaw ? new Date(String(registeredAtRaw)) : new Date();
  if (Number.isNaN(registeredAt.getTime())) return null;

  return {
    externalId: externalId.slice(0, 191),
    eventExternalId: raw.event_external_id || raw.eventExternalId
      ? String(raw.event_external_id || raw.eventExternalId).slice(0, 128)
      : null,
    eventTitle: String(raw.event_title || raw.eventTitle || "Untitled").slice(0, 500),
    guestName: String(
      raw.name || raw.guest_name || raw.guestName || email.split("@")[0] || "Guest"
    ).slice(0, 500),
    guestEmail: email.slice(0, 320),
    status: raw.status ? String(raw.status).slice(0, 64) : null,
    ticketCount:
      typeof raw.ticket_count === "number"
        ? raw.ticket_count
        : typeof raw.ticketCount === "number"
          ? raw.ticketCount
          : null,
    registeredAt,
  };
}

function mapStoredEvent(row) {
  return {
    id: Number(row.id),
    user_id: Number(row.userId),
    external_id: row.externalId,
    title: row.title || "",
    start_at: toIso(row.startAt),
    end_at: toIso(row.endAt),
    timezone: row.timezone || null,
    url: row.url || null,
    cover_url: row.coverUrl || null,
    status: row.status || null,
    payload: row.payloadJson || {},
    synced_at: toIso(row.syncedAt) || new Date().toISOString(),
  };
}

function mapStoredBooking(row) {
  return {
    id: Number(row.id),
    user_id: Number(row.userId),
    channel: row.channel,
    external_id: row.externalId,
    event_external_id: row.eventExternalId || null,
    event_title: row.eventTitle || "",
    guest_name: row.guestName || "",
    guest_email: row.guestEmail || "",
    status: row.status || null,
    ticket_count: row.ticketCount != null ? Number(row.ticketCount) : null,
    registered_at: toIso(row.registeredAt) || new Date().toISOString(),
    payload: row.payloadJson || {},
    synced_at: toIso(row.syncedAt) || new Date().toISOString(),
  };
}

module.exports = {
  CHANNELS,
  PRISMA_MODEL,
  parseChannel,
  toIso,
  normalizeEvent,
  normalizeBooking,
  mapStoredEvent,
  mapStoredBooking,
};
