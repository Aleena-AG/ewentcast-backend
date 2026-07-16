const { parseChannel } = require("./helpers");
const { upsertChannelEvents } = require("./events.service");

function coverFromDetails(details) {
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

function locationLabel(location) {
  if (!location) return null;
  if (typeof location === "string") return location;
  return (
    location.venue_name ||
    location.venueName ||
    location.address ||
    location.city ||
    location.name ||
    null
  );
}

function startIso(master) {
  if (!master.startAt) return null;
  return master.startAt instanceof Date
    ? master.startAt.toISOString()
    : String(master.startAt);
}

function endIso(master) {
  if (!master.endAt) return null;
  return master.endAt instanceof Date
    ? master.endAt.toISOString()
    : String(master.endAt);
}

function buildRawForChannel(channel, master, ref) {
  const eventId = String(ref.eventId || "").trim();
  if (!eventId) return null;

  const title = master.title || "Untitled";
  const start = startIso(master);
  const end = endIso(master);
  const timezone = master.timezone || null;
  const url = ref.url || null;
  const coverUrl = coverFromDetails(master.detailsJson || master.details);
  const location = master.locationJson || master.location;

  if (channel === "luma") {
    return {
      api_id: eventId,
      name: title,
      start_at: start,
      end_at: end,
      timezone,
      url,
      cover_url: coverUrl,
      status: "published",
      geo_address_json: location || null,
    };
  }

  if (channel === "eventbrite") {
    return {
      id: eventId,
      name: { text: title },
      start: start ? { utc: start } : undefined,
      end: end ? { utc: end } : undefined,
      url,
      logo: coverUrl ? { original: { url: coverUrl } } : undefined,
      status: "live",
    };
  }

  return {
    id: eventId,
    title,
    start_at: start,
    end_at: end,
    timezone,
    url,
    cover_url: coverUrl,
    location: locationLabel(location),
    status: "published",
  };
}

/**
 * Persist master + channelRefs into per-channel event tables so the dashboard
 * (which reads those tables) shows newly created/published events immediately.
 */
async function mirrorMasterToChannelEvents(userId, master) {
  if (!userId || !master) return { mirrored: 0 };

  const refs = master.channelRefs || [];
  let mirrored = 0;

  for (const ref of refs) {
    const channel = parseChannel(ref.channel);
    if (!channel) continue;

    const raw = buildRawForChannel(channel, master, ref);
    if (!raw) continue;

    await upsertChannelEvents(channel, userId, [raw], { prune: false });
    mirrored += 1;
  }

  return { mirrored };
}

module.exports = {
  mirrorMasterToChannelEvents,
  buildRawForChannel,
};
