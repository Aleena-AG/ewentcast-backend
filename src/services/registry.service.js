const prisma = require("../config/db");
const { parseChannel, PRISMA_MODEL } = require("./channels/helpers");
const { mirrorMasterToChannelEvents } = require("./channels/mirror-master.service");

const MASTER_INCLUDE = {
  channelRefs: true,
  attendees: { orderBy: { registeredAt: "desc" } },
};

/** Map channel-native status → published | draft | null */
function toPublishState(status) {
  if (!status) return null;
  const s = String(status).toLowerCase().trim();
  if (["draft", "unpublished", "private", "not_published"].includes(s)) {
    return "draft";
  }
  if (
    [
      "published",
      "live",
      "started",
      "ended",
      "completed",
      "approved",
      "public",
      "active",
    ].includes(s)
  ) {
    return "published";
  }
  return null;
}

/**
 * Load status for channel refs from luma/eventbrite/hightribe event tables.
 * Returns Map `"channel:eventId"` → `{ status, publishState }`
 */
async function loadChannelPublishStatuses(userId, channelRefs) {
  const map = new Map();
  if (userId == null || !channelRefs?.length) return map;

  const byChannel = { luma: [], eventbrite: [], hightribe: [] };
  for (const ref of channelRefs) {
    if (!ref.eventId || !byChannel[ref.channel]) continue;
    byChannel[ref.channel].push(String(ref.eventId));
  }

  const uid = BigInt(userId);
  await Promise.all(
    Object.entries(byChannel).map(async ([channel, ids]) => {
      const unique = [...new Set(ids)];
      if (!unique.length) return;
      const model = PRISMA_MODEL[channel];
      const rows = await prisma[model].findMany({
        where: { userId: uid, externalId: { in: unique } },
        select: { externalId: true, status: true },
      });
      for (const row of rows) {
        map.set(`${channel}:${row.externalId}`, {
          status: row.status || null,
          publishState: toPublishState(row.status),
        });
      }
    })
  );

  return map;
}

function enrichChannelRefs(channelRefs, statusMap) {
  return (channelRefs || []).map((ref) => {
    const info = statusMap.get(`${ref.channel}:${ref.eventId}`) || {
      status: null,
      publishState: null,
    };
    return {
      ...ref,
      status: info.status,
      publishState: info.publishState,
    };
  });
}

/** Attach per-channel status + publishState onto a master event (Prisma shape). */
async function withChannelPublishStatus(event) {
  if (!event) return event;
  const statusMap = await loadChannelPublishStatuses(event.userId, event.channelRefs);
  return {
    ...event,
    channelRefs: enrichChannelRefs(event.channelRefs, statusMap),
  };
}

async function withChannelPublishStatusMany(events) {
  return Promise.all(events.map((e) => withChannelPublishStatus(e)));
}

async function getMasterEvent(masterId) {
  const row = await prisma.masterEvent.findUnique({
    where: { id: masterId },
    include: MASTER_INCLUDE,
  });
  if (!row) return null;

  const statusMap = await loadChannelPublishStatuses(row.userId, row.channelRefs);

  const channels = {};
  for (const ref of row.channelRefs) {
    const info = statusMap.get(`${ref.channel}:${ref.eventId}`) || {
      status: null,
      publishState: null,
    };
    channels[ref.channel] = {
      eventId: ref.eventId,
      ticketId: ref.ticketId,
      url: ref.url,
      status: info.status,
      publishState: info.publishState,
    };
  }

  return {
    id: row.id,
    title: row.title,
    capacity: row.capacity,
    sold: row.sold,
    category: row.category || null,
    timezone: row.timezone || null,
    description: row.description || null,
    format: row.format || null,
    startAt: row.startAt ? row.startAt.toISOString() : null,
    endAt: row.endAt ? row.endAt.toISOString() : null,
    locationJson: row.locationJson || null,
    detailsJson: row.detailsJson || null,
    location: row.locationJson || null,
    details: row.detailsJson || null,
    userId: row.userId != null ? Number(row.userId) : null,
    channels,
    channelRefs: enrichChannelRefs(row.channelRefs, statusMap),
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

  const master = await prisma.masterEvent.findUnique({
    where: { id: masterId },
    include: { channelRefs: true },
  });
  await mirrorMasterToChannelEvents(userId, master);

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
  toPublishState,
  withChannelPublishStatus,
  withChannelPublishStatusMany,
};
