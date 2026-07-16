const prisma = require("../../config/db");
const { parseChannel } = require("./helpers");
const { getUserSettings } = require("../settings.service");
const { mirrorMasterToChannelEvents } = require("./mirror-master.service");
const luma = require("../luma/luma.service");
const eventbrite = require("../eventbrite/eventbrite.service");
const hightribe = require("../hightribe/hightribe.service");

function toIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function locationForLuma(location) {
  if (!location) return undefined;
  if (typeof location === "string") {
    return { address: location };
  }
  return location;
}

function descriptionMd(master) {
  if (master.description) return String(master.description);
  const details = master.detailsJson || master.details;
  if (details && typeof details === "object") {
    return (
      details.description_md ||
      details.descriptionMd ||
      details.description ||
      null
    );
  }
  return null;
}

function coverUrl(master) {
  const details = master.detailsJson || master.details;
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

/**
 * Push master event fields to each linked channel's remote API.
 * Partial failures are collected — one channel failing does not stop others.
 *
 * @param {string|number} userId
 * @param {object} master — MasterEvent row with channelRefs
 * @param {{ excludeChannel?: string }} [opts]
 */
async function propagateMasterToChannels(userId, master, opts = {}) {
  const exclude = opts.excludeChannel
    ? parseChannel(opts.excludeChannel)
    : null;
  const settings = await getUserSettings(userId);
  const results = {
    hightribe: { skipped: true },
    luma: { skipped: true },
    eventbrite: { skipped: true },
  };

  const refs = Array.isArray(master?.channelRefs) ? master.channelRefs : [];
  const title = master.title || "Untitled";
  const startAt = toIso(master.startAt);
  const endAt = toIso(master.endAt);
  const timezone = master.timezone || "UTC";
  const description = descriptionMd(master);
  const capacity =
    master.capacity != null && Number.isFinite(Number(master.capacity))
      ? Number(master.capacity)
      : null;
  const location = master.locationJson || master.location;
  const cover = coverUrl(master);

  for (const ref of refs) {
    const channel = parseChannel(ref.channel);
    const eventId = String(ref.eventId || "").trim();
    if (!channel || !eventId) continue;
    if (exclude && channel === exclude) {
      results[channel] = { skipped: true, reason: "excludeChannel" };
      continue;
    }

    try {
      if (channel === "luma") {
        const payload = {
          name: title,
          start_at: startAt || undefined,
          end_at: endAt || undefined,
          timezone,
          suppress_notifications: true,
        };
        if (description) payload.description_md = description;
        if (capacity != null) payload.max_capacity = capacity;
        if (location) payload.geo_address_json = locationForLuma(location);
        if (cover) payload.cover_url = cover;

        const data = await luma.updateEvent(settings, eventId, payload);
        results.luma = { ok: true, eventId, data };
      } else if (channel === "eventbrite") {
        const data = await eventbrite.updateEvent(settings, eventId, {
          title,
          description,
          startAt,
          endAt,
          timezone,
        });
        results.eventbrite = { ok: true, eventId, data };
      } else if (channel === "hightribe") {
        const body = {
          title,
          timezone,
        };
        if (startAt) body.start_at = startAt;
        if (endAt) body.end_at = endAt;
        if (description) body.description = description;
        if (capacity != null) body.capacity = capacity;

        const data = await hightribe.updateEvent(userId, eventId, body, []);
        results.hightribe = { ok: true, eventId, data };
      }
    } catch (err) {
      results[channel] = {
        ok: false,
        eventId,
        error: err instanceof Error ? err.message : String(err),
        statusCode: err.statusCode || 500,
      };
    }
  }

  // Keep local channel tables in sync with master
  try {
    await mirrorMasterToChannelEvents(userId, master);
  } catch {
    /* best-effort */
  }

  return results;
}

/**
 * Load master by id (owned) and propagate to all linked channels.
 */
async function propagateOwnedMaster(masterId, userId, opts = {}) {
  const master = await prisma.masterEvent.findFirst({
    where: { id: masterId, userId: BigInt(userId) },
    include: { channelRefs: true },
  });
  if (!master) return null;
  const channels = await propagateMasterToChannels(userId, master, opts);
  return { master, channels };
}

/**
 * Find master linked to a channel event and propagate to the other channels.
 */
async function propagateFromChannelEvent(channel, eventId, userId, opts = {}) {
  const ch = parseChannel(channel);
  if (!ch) return null;

  const ref = await prisma.channelRef.findFirst({
    where: { channel: ch, eventId: String(eventId) },
    include: { masterEvent: { include: { channelRefs: true } } },
  });
  if (!ref?.masterEvent) return null;
  if (Number(ref.masterEvent.userId) !== Number(userId)) return null;

  const channels = await propagateMasterToChannels(userId, ref.masterEvent, {
    excludeChannel: ch,
    ...opts,
  });
  return { master: ref.masterEvent, channels };
}

module.exports = {
  propagateMasterToChannels,
  propagateOwnedMaster,
  propagateFromChannelEvent,
};
