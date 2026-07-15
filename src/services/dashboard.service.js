const prisma = require("../config/db");
const { listAllUserBookings } = require("./channels/bookings.service");
const { listChannelEvents } = require("./channels/events.service");
const { getUserSettings, toPublicSettingsView } = require("./settings.service");
const { CHANNELS } = require("./channels/helpers");

function emptyDayCounts() {
  return { hightribe: 0, luma: 0, eventbrite: 0 };
}

function emptyTrend(days = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    points.push({
      date: d.toISOString().slice(0, 10),
      count: 0,
      byChannel: emptyDayCounts(),
    });
  }
  return points;
}

function ticketCount(b) {
  if (typeof b.ticket_count === "number" && b.ticket_count > 0) return b.ticket_count;
  const payloadTickets = b.payload?.tickets;
  if (Array.isArray(payloadTickets) && payloadTickets.length) {
    return (
      payloadTickets.reduce((s, t) => {
        const q = t && typeof t === "object" ? Number(t.quantity) : 1;
        return s + (Number.isFinite(q) && q > 0 ? q : 1);
      }, 0) || 1
    );
  }
  return 1;
}

function bookingPrice(b) {
  if (typeof b.total_price === "number") return b.total_price;
  if (typeof b.payload?.total_price === "number") return Number(b.payload.total_price);
  return 0;
}

function coverFromMasterDetails(details) {
  if (!details || typeof details !== "object") return null;
  return (
    details.coverUrl ||
    details.cover_url ||
    details.image ||
    details.imageUrl ||
    details.image_url ||
    null
  );
}

async function getDashboardStats(userId) {
  const [bookings, settingsRaw, masters, ...channelEventsLists] = await Promise.all([
    listAllUserBookings(userId),
    getUserSettings(userId).then(toPublicSettingsView),
    prisma.masterEvent.findMany({
      where: { userId: BigInt(userId) },
      include: { channelRefs: true },
    }),
    ...CHANNELS.map((ch) => listChannelEvents(ch, userId)),
  ]);

  const configured = {
    hightribe: settingsRaw.hightribe?.configured === true,
    luma: settingsRaw.luma?.configured === true,
    eventbrite: settingsRaw.eventbrite?.configured === true,
  };

  const byCh = { hightribe: [], luma: [], eventbrite: [] };
  for (const b of bookings) {
    if (byCh[b.channel]) byCh[b.channel].push(b);
  }

  const registrySold = masters.reduce((s, m) => s + (Number(m.sold) || 0), 0);
  const ticketsFromBookings = bookings.reduce((s, b) => s + ticketCount(b), 0);
  const totalTickets = registrySold > 0 ? registrySold : ticketsFromBookings;

  let totalRevenue = 0;
  const revenueByChannel = emptyDayCounts();
  for (const b of bookings) {
    const price = bookingPrice(b);
    if (price <= 0) continue;
    totalRevenue += price;
    if (revenueByChannel[b.channel] != null) revenueByChannel[b.channel] += price;
  }

  const uniqueEmails = new Set(
    bookings
      .map((b) => String(b.guest_email || "").trim().toLowerCase())
      .filter((e) => e && e !== "—")
  );

  // Merge channel-table events + registry channelRefs so published masters show
  // even before a manual sync-from-api.
  const seenByChannel = { hightribe: new Set(), luma: new Set(), eventbrite: new Set() };
  const recent = [];

  CHANNELS.forEach((channel, i) => {
    for (const row of channelEventsLists[i] || []) {
      const id = String(row.external_id || "");
      if (!id) continue;
      seenByChannel[channel].add(id);
      recent.push({
        id,
        title: row.title || "Untitled",
        startUtc: row.start_at || new Date().toISOString(),
        endUtc: row.end_at,
        coverUrl: row.cover_url,
        status: row.status,
        channel,
        priceLabel: "",
      });
    }
  });

  for (const master of masters) {
    const coverUrl = coverFromMasterDetails(master.detailsJson);
    const startUtc = master.startAt
      ? master.startAt.toISOString()
      : master.createdAt?.toISOString() || new Date().toISOString();
    const endUtc = master.endAt ? master.endAt.toISOString() : null;

    let linkedAny = false;
    for (const ref of master.channelRefs || []) {
      const channel = ref.channel;
      const id = String(ref.eventId || "").trim();
      if (!id || !seenByChannel[channel]) continue;
      linkedAny = true;
      if (seenByChannel[channel].has(id)) continue;
      seenByChannel[channel].add(id);
      recent.push({
        id,
        title: master.title || "Untitled",
        startUtc,
        endUtc,
        coverUrl,
        status: "published",
        channel,
        priceLabel: "",
      });
    }

    // Master created but channels not linked yet — still show once on dashboard
    if (!linkedAny) {
      recent.push({
        id: master.id,
        title: master.title || "Untitled",
        startUtc,
        endUtc,
        coverUrl,
        status: "draft",
        channel: "hightribe",
        priceLabel: "",
      });
    }
  }

  recent.sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime());
  const recentSlice = recent.slice(0, 60);

  const channels = {};
  CHANNELS.forEach((channel, i) => {
    const stored = channelEventsLists[i] || [];
    const eventCount = Math.max(stored.length, seenByChannel[channel].size);
    const chBookings = byCh[channel] || [];
    channels[channel] = {
      events: eventCount,
      bookings: chBookings.length,
      tickets: chBookings.reduce((s, b) => s + ticketCount(b), 0),
      revenue: Math.round(revenueByChannel[channel] * 100) / 100,
      currency: "USD",
      configured: configured[channel],
    };
  });

  const recentBookings = [...bookings].slice(0, 20).map((b) => ({
    name: String(b.guest_name || "Guest"),
    email: String(b.guest_email || ""),
    channel: b.channel || "hightribe",
    eventTitle: String(b.event_title || "Event"),
    registeredAt: String(b.registered_at || new Date().toISOString()),
  }));

  const bookingTrend = emptyTrend(7);
  const byDate = new Map(bookingTrend.map((p) => [p.date, p]));
  for (const b of bookings) {
    const day = String(b.registered_at || "").slice(0, 10);
    const point = byDate.get(day);
    if (!point) continue;
    point.count += 1;
    if (point.byChannel[b.channel] != null) point.byChannel[b.channel] += 1;
  }

  const totalEvents = Math.max(
    CHANNELS.reduce((s, ch) => s + channels[ch].events, 0),
    masters.length
  );

  return {
    success: true,
    derived: false,
    channels,
    totalEvents,
    totalTickets,
    totalBookings: bookings.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    revenueCurrency: "USD",
    unifiedAttendees: uniqueEmails.size,
    recent: recentSlice,
    recentBookings,
    bookingTrend,
  };
}

module.exports = { getDashboardStats };
