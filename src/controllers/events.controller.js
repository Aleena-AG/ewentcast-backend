const { parseChannel } = require("../services/channels/helpers");
const {
  listChannelEvents,
  getChannelEvent,
  upsertChannelEvents,
  deleteChannelEvent,
} = require("../services/channels/events.service");
const {
  listAllUserBookings,
  listChannelBookings,
  upsertChannelBookings,
} = require("../services/channels/bookings.service");
const { purgeChannelData } = require("../services/channels/channel-data.service");
const { syncChannelDataToDb } = require("../services/channels/sync.service");
const { serialize } = require("../utils/serialize");

async function listBookings(req, res, next) {
  try {
    const bookings = await listAllUserBookings(req.userId);
    res.json({ success: true, bookings: serialize(bookings) });
  } catch (err) {
    next(err);
  }
}

async function listEvents(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }
    const events = await listChannelEvents(channel, req.userId);
    res.json({ success: true, events: serialize(events) });
  } catch (err) {
    next(err);
  }
}

async function getEvent(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }
    const event = await getChannelEvent(channel, req.userId, req.params.externalId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }
    res.json({ success: true, event: serialize(event) });
  } catch (err) {
    next(err);
  }
}

async function syncEvents(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }
    if (!Array.isArray(req.body?.events)) {
      return res.status(400).json({ success: false, message: "events array required" });
    }

    const result = await upsertChannelEvents(channel, req.userId, req.body.events, {
      prune: req.body.prune !== false,
    });
    const events = await listChannelEvents(channel, req.userId);
    res.json({ success: true, ...serialize(result), events: serialize(events) });
  } catch (err) {
    next(err);
  }
}

async function syncBookings(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }
    if (!Array.isArray(req.body?.bookings)) {
      return res.status(400).json({ success: false, message: "bookings array required" });
    }

    const result = await upsertChannelBookings(channel, req.userId, req.body.bookings);
    const bookings = await listChannelBookings(channel, req.userId);
    res.json({ success: true, ...serialize(result), bookings: serialize(bookings) });
  } catch (err) {
    next(err);
  }
}

async function syncFromApi(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }

    const result = await syncChannelDataToDb(channel, req.userId);
    res.json({
      success: true,
      events: result.events,
      pruned: result.pruned,
      bookings: result.bookings,
      storedEvents: serialize(result.storedEvents),
      storedBookings: serialize(result.storedBookings),
    });
  } catch (err) {
    next(err);
  }
}

async function purgeChannel(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }
    const result = await purgeChannelData(req.userId, channel);
    res.json({ success: true, ok: true, ...serialize(result) });
  } catch (err) {
    next(err);
  }
}

async function removeEvent(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }
    const ok = await deleteChannelEvent(channel, req.userId, req.params.externalId);
    res.json({ success: true, ok });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBookings,
  listEvents,
  getEvent,
  syncEvents,
  syncBookings,
  syncFromApi,
  purgeChannel,
  removeEvent,
};
