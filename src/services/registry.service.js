const prisma = require("../config/db");
const { parseChannel } = require("./channels/helpers");

const MASTER_INCLUDE = {
  channelRefs: true,
  attendees: { orderBy: { registeredAt: "desc" } },
};

async function getMasterEvent(masterId) {
  const row = await prisma.masterEvent.findUnique({
    where: { id: masterId },
    include: MASTER_INCLUDE,
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
    channelRefs: row.channelRefs,
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

async function findOwnedMaster(masterId, userId) {
  return prisma.masterEvent.findFirst({
    where: { id: masterId, userId: BigInt(userId) },
    select: { id: true },
  });
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
    if (err.code !== "P2002") throw err;
  }

  return getMasterEvent(masterId);
}

async function deleteMasterEvent(masterId, userId) {
  const owned = await findOwnedMaster(masterId, userId);
  if (!owned) return false;
  await prisma.masterEvent.delete({ where: { id: masterId } });
  return true;
}

async function linkChannel(masterId, userId, ref) {
  const owned = await findOwnedMaster(masterId, userId);
  if (!owned) return null;

  const channel = parseChannel(ref.channel);
  if (!channel) {
    const err = new Error(`invalid channel: ${ref.channel}`);
    err.statusCode = 400;
    throw err;
  }

  await prisma.channelRef.upsert({
    where: {
      masterId_channel: { masterId, channel },
    },
    create: {
      masterId,
      channel,
      eventId: ref.eventId || "",
      ticketId: ref.ticketId || null,
      url: ref.url || null,
    },
    update: {
      eventId: ref.eventId ?? undefined,
      ticketId: ref.ticketId !== undefined ? ref.ticketId : undefined,
      url: ref.url !== undefined ? ref.url : undefined,
    },
  });

  return getMasterEvent(masterId);
}

async function unlinkChannel(masterId, userId, channelRaw) {
  const owned = await findOwnedMaster(masterId, userId);
  if (!owned) return null;

  const channel = parseChannel(channelRaw);
  if (!channel) {
    const err = new Error(`invalid channel: ${channelRaw}`);
    err.statusCode = 400;
    throw err;
  }

  await prisma.channelRef.deleteMany({
    where: { masterId, channel },
  });

  return getMasterEvent(masterId);
}

async function registerAttendeeByChannel({ channel, eventId, email, name, registeredAt, status }) {
  const parsed = parseChannel(channel);
  if (!parsed) {
    const err = new Error(`invalid channel: ${channel}`);
    err.statusCode = 400;
    throw err;
  }

  const ctx = await findMasterContextByChannelEvent(parsed, eventId);
  if (!ctx) return null;

  return registerAttendee(ctx.masterId, {
    email,
    name: name || email.split("@")[0] || "Guest",
    source: parsed,
    registeredAt,
    status,
  });
}

module.exports = {
  getMasterEvent,
  findOwnedMaster,
  findMasterContextByChannelEvent,
  registerAttendee,
  registerAttendeeByChannel,
  deleteMasterEvent,
  linkChannel,
  unlinkChannel,
};
