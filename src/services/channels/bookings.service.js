const prisma = require("../../config/db");
const { normalizeBooking, mapStoredBooking } = require("./helpers");

async function listAllUserBookings(userId) {
  const rows = await prisma.channelBooking.findMany({
    where: { userId: BigInt(userId) },
    orderBy: { registeredAt: "desc" },
  });
  return rows.map(mapStoredBooking);
}

async function listChannelBookings(channel, userId) {
  const rows = await prisma.channelBooking.findMany({
    where: { userId: BigInt(userId), channel },
    orderBy: { registeredAt: "desc" },
  });
  return rows.map(mapStoredBooking);
}

async function upsertChannelBookings(channel, userId, bookings) {
  const now = new Date();
  let upserted = 0;

  for (const raw of bookings) {
    const n = normalizeBooking(raw);
    if (!n) continue;

    const data = {
      userId: BigInt(userId),
      channel,
      externalId: n.externalId,
      eventExternalId: n.eventExternalId,
      eventTitle: n.eventTitle,
      guestName: n.guestName,
      guestEmail: n.guestEmail,
      status: n.status,
      ticketCount: n.ticketCount,
      registeredAt: n.registeredAt,
      payloadJson: raw,
      syncedAt: now,
    };

    const { userId: uid, channel: ch, externalId, ...update } = data;
    await prisma.channelBooking.upsert({
      where: {
        userId_channel_externalId: {
          userId: uid,
          channel: ch,
          externalId,
        },
      },
      create: data,
      update,
    });
    upserted++;
  }

  return { upserted };
}

async function upsertWebhookBooking(input) {
  const now = new Date();
  const payload = {
    _source: "webhook",
    channel: input.channel,
    event_id: input.eventExternalId,
    email: input.guestEmail,
    name: input.guestName,
    registered_at: input.registeredAt.toISOString(),
  };

  const data = {
    userId: BigInt(input.userId),
    channel: input.channel,
    externalId: String(input.externalId).slice(0, 191),
    eventExternalId: String(input.eventExternalId).slice(0, 128),
    eventTitle: String(input.eventTitle).slice(0, 500),
    guestName: String(input.guestName).slice(0, 500),
    guestEmail: String(input.guestEmail).toLowerCase().slice(0, 320),
    status: String(input.status || "confirmed").slice(0, 64),
    ticketCount: 1,
    registeredAt: input.registeredAt,
    payloadJson: payload,
    syncedAt: now,
  };

  await prisma.channelBooking.upsert({
    where: {
      userId_channel_externalId: {
        userId: data.userId,
        channel: data.channel,
        externalId: data.externalId,
      },
    },
    create: data,
    update: {
      eventExternalId: data.eventExternalId,
      eventTitle: data.eventTitle,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      status: data.status,
      ticketCount: data.ticketCount,
      registeredAt: data.registeredAt,
      payloadJson: data.payloadJson,
      syncedAt: data.syncedAt,
    },
  });

  return true;
}

async function deleteAllChannelBookings(userId, channel) {
  const result = await prisma.channelBooking.deleteMany({
    where: { userId: BigInt(userId), channel },
  });
  return result.count;
}

module.exports = {
  listAllUserBookings,
  listChannelBookings,
  upsertChannelBookings,
  upsertWebhookBooking,
  deleteAllChannelBookings,
};
