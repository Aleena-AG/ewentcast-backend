const prisma = require("../../config/db");
const {
  PRISMA_MODEL,
  normalizeEvent,
  mapStoredEvent,
} = require("./helpers");

async function listChannelEvents(channel, userId) {
  const model = PRISMA_MODEL[channel];
  const rows = await prisma[model].findMany({
    where: { userId: BigInt(userId) },
    orderBy: [{ startAt: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(mapStoredEvent);
}

async function getChannelEvent(channel, userId, externalId) {
  const model = PRISMA_MODEL[channel];
  const row = await prisma[model].findUnique({
    where: {
      userId_externalId: {
        userId: BigInt(userId),
        externalId: String(externalId),
      },
    },
  });
  return row ? mapStoredEvent(row) : null;
}

async function resolveUserIdFromChannelEvent(channel, eventId) {
  const model = PRISMA_MODEL[channel];
  const row = await prisma[model].findFirst({
    where: { externalId: String(eventId) },
    select: { userId: true },
  });
  return row ? Number(row.userId) : null;
}

async function pruneChannelEvents(channel, userId, keepExternalIds) {
  const model = PRISMA_MODEL[channel];
  const where = { userId: BigInt(userId) };
  if (keepExternalIds.length > 0) {
    where.externalId = { notIn: keepExternalIds };
  }
  const result = await prisma[model].deleteMany({ where });
  return result.count;
}

function buildUpsertData(channel, userId, raw, now) {
  const n = normalizeEvent(channel, raw);
  if (!n.externalId) return null;

  const base = {
    userId: BigInt(userId),
    externalId: n.externalId,
    title: n.title,
    startAt: n.startAt,
    endAt: n.endAt,
    timezone: n.timezone,
    url: n.url,
    coverUrl: n.coverUrl,
    status: n.status,
    payloadJson: raw,
    syncedAt: now,
  };

  if (channel === "luma") {
    return { ...base, locationJson: n.locationJson, meetingUrl: n.meetingUrl };
  }
  if (channel === "eventbrite") {
    return { ...base, isFree: n.isFree };
  }
  return { ...base, location: n.location };
}

async function upsertChannelEvents(channel, userId, events, options = {}) {
  const shouldPrune = options.prune === true;
  const model = PRISMA_MODEL[channel];
  const now = new Date();
  const keepExternalIds = [];
  let upserted = 0;

  for (const raw of events) {
    const data = buildUpsertData(channel, userId, raw, now);
    if (!data) continue;
    keepExternalIds.push(data.externalId);

    const { userId: uid, externalId, ...update } = data;
    await prisma[model].upsert({
      where: {
        userId_externalId: { userId: uid, externalId },
      },
      create: data,
      update,
    });
    upserted++;
  }

  const pruned = shouldPrune
    ? await pruneChannelEvents(channel, userId, keepExternalIds)
    : 0;

  return { upserted, pruned };
}

async function deleteChannelEvent(channel, userId, externalId) {
  const model = PRISMA_MODEL[channel];
  try {
    await prisma[model].delete({
      where: {
        userId_externalId: {
          userId: BigInt(userId),
          externalId: String(externalId),
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function deleteAllChannelEvents(channel, userId) {
  const model = PRISMA_MODEL[channel];
  const result = await prisma[model].deleteMany({
    where: { userId: BigInt(userId) },
  });
  return result.count;
}

module.exports = {
  listChannelEvents,
  getChannelEvent,
  resolveUserIdFromChannelEvent,
  upsertChannelEvents,
  deleteChannelEvent,
  deleteAllChannelEvents,
};
