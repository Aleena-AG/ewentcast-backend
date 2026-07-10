const prisma = require("../../config/db");
const { PRISMA_MODEL } = require("./helpers");
const { deleteAllChannelEvents } = require("./events.service");
const { deleteAllChannelBookings } = require("./bookings.service");

async function purgeRegistryForChannel(userId, channel, externalEventIds) {
  let linksRemoved = 0;

  const masterRows = await prisma.masterEvent.findMany({
    where: {
      OR: [{ userId: BigInt(userId) }, { userId: null }],
      channelRefs: { some: { channel } },
    },
    select: { id: true },
  });
  const masterIds = masterRows.map((r) => r.id);

  if (masterIds.length > 0) {
    await prisma.attendee.deleteMany({
      where: {
        sourceChannel: channel,
        masterId: { in: masterIds },
      },
    });
  }

  if (externalEventIds.length > 0) {
    const result = await prisma.channelRef.deleteMany({
      where: {
        channel,
        eventId: { in: externalEventIds },
      },
    });
    linksRemoved = result.count;
  } else {
    const result = await prisma.channelRef.deleteMany({
      where: {
        channel,
        masterEvent: { userId: BigInt(userId) },
      },
    });
    linksRemoved = result.count;
  }

  await prisma.masterEvent.deleteMany({
    where: {
      userId: BigInt(userId),
      channelRefs: { none: {} },
    },
  });

  return linksRemoved;
}

async function purgeChannelData(userId, channel) {
  const model = PRISMA_MODEL[channel];
  const eventRows = await prisma[model].findMany({
    where: { userId: BigInt(userId) },
    select: { externalId: true },
  });
  const externalIds = eventRows.map((r) => r.externalId);

  const registryLinksRemoved = await purgeRegistryForChannel(userId, channel, externalIds);
  const eventsDeleted = await deleteAllChannelEvents(channel, userId);
  const bookingsDeleted = await deleteAllChannelBookings(userId, channel);

  return { eventsDeleted, bookingsDeleted, registryLinksRemoved };
}

module.exports = { purgeChannelData };
