const prisma = require("../config/db");
const { PRISMA_MODEL } = require("./channels/helpers");

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
    include: {
      channelRefs: true,
      attendees: { orderBy: { registeredAt: "desc" } },
    },
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
  toPublishState,
  withChannelPublishStatus,
  withChannelPublishStatusMany,
};
