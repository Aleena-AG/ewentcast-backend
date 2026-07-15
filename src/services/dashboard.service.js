const prisma = require("../config/db");

const CHANNELS = ["hightribe", "luma", "eventbrite"];

function priceLabelFor(channel, isFree) {
  if (channel === "hightribe") return "Hightribe";
  if (channel === "luma") return "Luma";
  return isFree ? "Free" : "Eventbrite";
}

function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function parseMoney(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseEbCost(raw) {
  if (raw == null) return 0;
  const str = String(raw);
  const minorMatch = str.match(/(\d+)\s*$/);
  if (minorMatch && /[A-Z]{3}/i.test(str)) {
    return parseInt(minorMatch[1], 10) / 100;
  }
  const major = parseMoney(raw);
  if (major == null) return 0;
  return major > 1000 ? major / 100 : major;
}

function revenueFromBookingPayload(channel, payload) {
  if (channel === "hightribe") {
    const amount = parseMoney(payload.total_price ?? payload.totalPrice ?? payload.amount) ?? 0;
    const currency = payload.currency != null ? String(payload.currency) : null;
    return { amount: Math.max(0, amount), currency };
  }

  if (channel === "eventbrite") {
    const costs = asRecord(payload.costs);
    const gross = asRecord(costs?.gross);
    const major = parseMoney(gross?.major_value ?? costs?.gross);
    if (major != null) {
      return {
        amount: Math.max(0, major),
        currency: String(gross?.currency || payload.currency || "USD"),
      };
    }
    const barcodes = Array.isArray(payload.barcodes) ? payload.barcodes : null;
    const order = asRecord(payload.order) || asRecord(barcodes?.[0]);
    const orderCosts = asRecord(order?.costs);
    const orderGross = asRecord(orderCosts?.gross);
    const orderMajor = parseMoney(orderGross?.major_value);
    if (orderMajor != null) {
      return {
        amount: Math.max(0, orderMajor),
        currency: String(orderGross?.currency || "USD"),
      };
    }
    return { amount: 0, currency: payload.currency != null ? String(payload.currency) : null };
  }

  if (channel === "luma") {
    const cents = parseMoney(
      payload.amount_cents ??
        payload.price_cents ??
        payload.cents ??
        asRecord(payload.payment)?.amount_cents
    );
    if (cents != null) {
      return {
        amount: Math.max(0, cents / 100),
        currency: String(payload.currency || asRecord(payload.payment)?.currency || "USD"),
      };
    }
    const major = parseMoney(payload.amount ?? payload.price ?? payload.total_price);
    return {
      amount: Math.max(0, major ?? 0),
      currency: payload.currency != null ? String(payload.currency) : null,
    };
  }

  return { amount: 0, currency: null };
}

function unitPriceFromEventPayload(channel, payload) {
  if (channel === "hightribe") {
    const root = asRecord(payload.data) || payload;
    const tickets = Array.isArray(root.tickets)
      ? root.tickets
      : Array.isArray(payload.tickets)
        ? payload.tickets
        : [];
    const ticket = asRecord(tickets[0]);
    const price = Math.max(0, parseMoney(ticket?.price) ?? 0);
    return {
      price,
      currency: String(ticket?.currency || root.currency || "USD"),
      isFree: price <= 0,
    };
  }

  if (channel === "eventbrite") {
    const currency = String(payload.currency || "USD").toUpperCase();
    if (payload.is_free === true) return { price: 0, currency, isFree: true };
    const ticketClasses = Array.isArray(payload.ticket_classes)
      ? payload.ticket_classes
      : Array.isArray(payload.ticket_class)
        ? payload.ticket_class
        : [];
    const paid = ticketClasses
      .map((t) => asRecord(t))
      .find((t) => t && !t.free && (t.cost != null || t.actual_cost != null));
    if (paid) {
      const price = parseEbCost(paid.cost ?? paid.actual_cost);
      return { price: Math.max(0, price), currency, isFree: price <= 0 };
    }
    return { price: 0, currency, isFree: !!payload.is_free };
  }

  if (channel === "luma") {
    const event = asRecord(payload.event) || payload;
    const ticketTypes = Array.isArray(event.ticket_types)
      ? event.ticket_types
      : Array.isArray(payload.ticket_types)
        ? payload.ticket_types
        : [];
    const first = asRecord(ticketTypes[0]);
    const cents = parseMoney(first?.cents ?? first?.price_cents ?? first?.amount_cents);
    const major = parseMoney(first?.price ?? first?.amount);
    let price = 0;
    if (cents != null) price = cents / 100;
    else if (major != null) price = major;
    const isFree =
      price <= 0 || !!first?.is_free || String(first?.type || "").toLowerCase() === "free";
    return {
      price: isFree ? 0 : Math.max(0, price),
      currency: String(first?.currency || event.currency || "USD"),
      isFree,
    };
  }

  return { price: 0, currency: "USD", isFree: false };
}

function emptyChannelStats() {
  return { events: 0, bookings: 0, tickets: 0, revenue: 0, currency: "USD" };
}

function emptyChannelDayCounts() {
  return { hightribe: 0, luma: 0, eventbrite: 0 };
}

function mapEventRow(row) {
  return {
    id: String(row.externalId),
    title: String(row.title || "Untitled"),
    startUtc: row.startAt ? new Date(row.startAt).toISOString() : new Date().toISOString(),
    endUtc: row.endAt ? new Date(row.endAt).toISOString() : null,
    coverUrl: row.coverUrl ? String(row.coverUrl) : null,
    status: row.status ? String(row.status) : null,
    channel: row.channel,
    priceLabel: priceLabelFor(row.channel, row.isFree),
  };
}

function summarizeTotals(channels) {
  const totalEvents = CHANNELS.reduce((sum, ch) => sum + channels[ch].events, 0);
  const totalBookings = CHANNELS.reduce((sum, ch) => sum + channels[ch].bookings, 0);
  const totalTickets = CHANNELS.reduce((sum, ch) => sum + channels[ch].tickets, 0);
  const totalRevenue =
    Math.round(CHANNELS.reduce((sum, ch) => sum + channels[ch].revenue, 0) * 100) / 100;
  return { totalEvents, totalBookings, totalTickets, totalRevenue, revenueCurrency: "USD" };
}

function applyBookingRevenue(
  channels,
  channel,
  ticketCount,
  payload,
  eventPriceByKey,
  eventExternalId,
  eventTitle
) {
  channels[channel].bookings += 1;
  channels[channel].tickets += ticketCount;

  const fromPayload = revenueFromBookingPayload(channel, payload);
  let amount = fromPayload.amount;
  let currency = fromPayload.currency;

  if (amount <= 0) {
    const byId = eventExternalId
      ? eventPriceByKey.get(`${channel}:id:${eventExternalId}`)
      : undefined;
    const byTitle = eventPriceByKey.get(
      `${channel}:title:${String(eventTitle || "").trim().toLowerCase()}`
    );
    const pricing = byId || byTitle;
    if (pricing && !pricing.isFree && pricing.price > 0) {
      amount = pricing.price * ticketCount;
      currency = pricing.currency;
    }
  }

  if (currency) channels[channel].currency = currency.toUpperCase();
  channels[channel].revenue =
    Math.round((channels[channel].revenue + Math.max(0, amount)) * 100) / 100;
}

function asPayload(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

async function getDashboardStatsForUser(userId) {
  const uid = BigInt(userId);
  const channels = {
    hightribe: emptyChannelStats(),
    luma: emptyChannelStats(),
    eventbrite: emptyChannelStats(),
  };
  const eventPriceByKey = new Map();

  const [htEvents, lumaEvents, ebEvents, bookingRows] = await Promise.all([
    prisma.hightribeEvent.findMany({
      where: { userId: uid },
      select: {
        externalId: true,
        title: true,
        startAt: true,
        endAt: true,
        coverUrl: true,
        status: true,
        payloadJson: true,
      },
    }),
    prisma.lumaEvent.findMany({
      where: { userId: uid },
      select: {
        externalId: true,
        title: true,
        startAt: true,
        endAt: true,
        coverUrl: true,
        status: true,
        payloadJson: true,
      },
    }),
    prisma.eventbriteEvent.findMany({
      where: { userId: uid },
      select: {
        externalId: true,
        title: true,
        startAt: true,
        endAt: true,
        coverUrl: true,
        status: true,
        isFree: true,
        payloadJson: true,
      },
    }),
    prisma.channelBooking.findMany({
      where: { userId: uid },
      select: {
        channel: true,
        eventExternalId: true,
        eventTitle: true,
        ticketCount: true,
        payloadJson: true,
        guestEmail: true,
        guestName: true,
        registeredAt: true,
      },
      orderBy: { registeredAt: "desc" },
    }),
  ]);

  const byChannelEvents = {
    hightribe: htEvents,
    luma: lumaEvents,
    eventbrite: ebEvents,
  };

  for (const ch of CHANNELS) {
    const rows = byChannelEvents[ch];
    channels[ch].events = rows.length;
    for (const row of rows) {
      const payload = asPayload(row.payloadJson);
      const pricing = unitPriceFromEventPayload(ch, payload);
      eventPriceByKey.set(`${ch}:id:${row.externalId}`, pricing);
      eventPriceByKey.set(
        `${ch}:title:${String(row.title || "").trim().toLowerCase()}`,
        pricing
      );
      if (pricing.currency) channels[ch].currency = pricing.currency;
    }
  }

  const emails = new Set();
  for (const row of bookingRows) {
    const ch = row.channel;
    if (!channels[ch]) continue;
    applyBookingRevenue(
      channels,
      ch,
      row.ticketCount != null ? Number(row.ticketCount) : 1,
      asPayload(row.payloadJson),
      eventPriceByKey,
      row.eventExternalId ? String(row.eventExternalId) : null,
      String(row.eventTitle || "")
    );
    const email = String(row.guestEmail || "")
      .toLowerCase()
      .trim();
    if (email) emails.add(email);
  }

  const recent = [
    ...htEvents.map((row) => mapEventRow({ ...row, channel: "hightribe", isFree: null })),
    ...lumaEvents.map((row) => mapEventRow({ ...row, channel: "luma", isFree: null })),
    ...ebEvents.map((row) =>
      mapEventRow({ ...row, channel: "eventbrite", isFree: row.isFree })
    ),
  ]
    .sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())
    .slice(0, 60);

  const recentBookings = bookingRows.slice(0, 8).map((row) => ({
    name: String(row.guestName || ""),
    email: String(row.guestEmail || ""),
    channel: row.channel,
    eventTitle: String(row.eventTitle || ""),
    registeredAt: row.registeredAt
      ? new Date(row.registeredAt).toISOString()
      : new Date().toISOString(),
  }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byDay = new Map();
  for (const row of bookingRows) {
    const d = new Date(row.registeredAt);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const bucket = byDay.get(key) || emptyChannelDayCounts();
    if (CHANNELS.includes(row.channel)) bucket[row.channel] += 1;
    byDay.set(key, bucket);
  }

  const bookingTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const byChannel = byDay.get(key) || emptyChannelDayCounts();
    const count = CHANNELS.reduce((sum, ch) => sum + byChannel[ch], 0);
    bookingTrend.push({ date: key, count, byChannel });
  }

  return {
    channels,
    ...summarizeTotals(channels),
    unifiedAttendees: emails.size,
    recent,
    recentBookings,
    bookingTrend,
  };
}

module.exports = { getDashboardStatsForUser };
