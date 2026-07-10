const prisma = require("../config/db");

async function getMasterEvent(masterId) {
  const row = await prisma.masterEvent.findUnique({
    where: { id: masterId },
    include: {
      channelRefs: true,
      attendees: { orderBy: { registeredAt: "desc" } },
    },
  });
  if (!row) return null;

  const channels = {};
  for (const ref of row.channelRefs) {
    channels[ref.channel] = {
      eventId: ref.eventId,
      ticketId: ref.ticketId,
      url: ref.url,
    };
  }

  return {
    id: row.id,
    title: row.title,
    capacity: row.capacity,
    sold: row.sold,
    userId: row.userId != null ? Number(row.userId) : null,
    channels,
    attendees: row.attendees.map((a) => ({
      email: a.email,
      name: a.name,
      source: a.sourceChannel,
      registeredAt: a.registeredAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findMasterContextByChannelEvent(channel, eventId) {
  const ref = await prisma.channelRef.findFirst({
    where: { channel, eventId: String(eventId) },
    include: { masterEvent: true },
  });
  if (!ref) return null;

  return {
    masterId: ref.masterId,
    title: ref.masterEvent.title,
    userId: ref.masterEvent.userId != null ? Number(ref.masterEvent.userId) : null,
    capacity: ref.masterEvent.capacity,
    sold: ref.masterEvent.sold,
  };
}

async function registerAttendee(masterId, attendee) {
  const exists = await prisma.masterEvent.findUnique({
    where: { id: masterId },
    select: { id: true },
  });
  if (!exists) return null;

  const email = attendee.email.toLowerCase().trim();
  const registeredAt = attendee.registeredAt
    ? new Date(attendee.registeredAt)
    : new Date();

  try {
    await prisma.attendee.create({
      data: {
        masterId,
        email,
        name: attendee.name,
        sourceChannel: attendee.source,
        registeredAt,
      },
    });
    await prisma.masterEvent.update({
      where: { id: masterId },
      data: { sold: { increment: 1 } },
    });
  } catch (err) {
    // unique (masterId, email) — already registered
    if (err.code !== "P2002") throw err;
  }

  return getMasterEvent(masterId);
}

module.exports = {
  getMasterEvent,
  findMasterContextByChannelEvent,
  registerAttendee,
};
