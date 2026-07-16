const prisma = require("../config/db");
const { serialize } = require("../utils/serialize");
const crypto = require("crypto");
const { parseChannel } = require("../services/channels/helpers");
const {
  deleteMasterEvent,
  linkChannel,
  unlinkChannel,
  registerAttendee,
  registerAttendeeByChannel,
  withChannelPublishStatus,
  withChannelPublishStatusMany,
} = require("../services/registry.service");
const { mirrorMasterToChannelEvents } = require("../services/channels/mirror-master.service");

const MASTER_INCLUDE = { channelRefs: true, attendees: true };

/** Shape for frontend: location/details aliases + ISO dates. */
function toPublicMaster(event) {
  if (!event) return event;
  const row = serialize(event);
  return {
    ...row,
    location: row.locationJson ?? row.location ?? null,
    details: row.detailsJson ?? row.details ?? null,
  };
}

function mapChannelRefs(channelRefs) {
  return channelRefs.map((ref) => {
    const channel = parseChannel(ref.channel);
    if (!channel) {
      const err = new Error(`invalid channel: ${ref.channel}`);
      err.statusCode = 400;
      throw err;
    }
    return {
      channel,
      eventId: ref.eventId || "",
      ticketId: ref.ticketId || null,
      url: ref.url || null,
    };
  });
}

function parseOptionalDate(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("invalid date");
    err.statusCode = 400;
    throw err;
  }
  return d;
}

/**
 * Master form fields (event-level — NOT ticket sales window).
 * Ticket start/end belong in detailsJson.tickets[].
 */
function pickMasterFields(body = {}) {
  const data = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      const err = new Error("title cannot be empty");
      err.statusCode = 400;
      throw err;
    }
    data.title = title;
  }

  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    if (Number.isNaN(capacity) || capacity < 0) {
      const err = new Error("capacity must be a non-negative number");
      err.statusCode = 400;
      throw err;
    }
    data.capacity = capacity;
  }

  if (body.category !== undefined) {
    data.category = body.category ? String(body.category).trim() : null;
  }
  if (body.timezone !== undefined) {
    data.timezone = body.timezone ? String(body.timezone).trim() : null;
  }
  if (body.description !== undefined) {
    data.description = body.description != null ? String(body.description) : null;
  }
  if (body.format !== undefined) {
    // in_person | online | hybrid
    data.format = body.format ? String(body.format).trim() : null;
  }

  if (body.startAt !== undefined || body.start_at !== undefined) {
    data.startAt = parseOptionalDate(body.startAt ?? body.start_at);
  }
  if (body.endAt !== undefined || body.end_at !== undefined) {
    data.endAt = parseOptionalDate(body.endAt ?? body.end_at);
  }

  // WHERE: city / venue / country / address / lat-lng
  if (body.locationJson !== undefined || body.location !== undefined) {
    data.locationJson = body.locationJson !== undefined ? body.locationJson : body.location;
  }

  // Extra: tickets (sales window), cover, host — keep separate from event dates
  if (body.detailsJson !== undefined || body.details !== undefined) {
    data.detailsJson = body.detailsJson !== undefined ? body.detailsJson : body.details;
  }

  return data;
}

async function listMasterEvents(req, res, next) {
  try {
    const channel = parseChannel(String(req.query.channel || ""));
    const eventId = String(req.query.eventId || req.query.event_id || "").trim();

    // Frontend: findMasterByChannelEvent → GET /registry?channel=&eventId=
    if (channel && eventId) {
      const ref = await prisma.channelRef.findFirst({
        where: {
          channel,
          eventId,
          masterEvent: { userId: req.userId },
        },
        include: {
          masterEvent: { include: { channelRefs: true } },
        },
      });

      if (!ref) {
        return res.json({
          success: true,
          data: { master: null, links: {} },
        });
      }

      const links = {};
      for (const r of ref.masterEvent.channelRefs) {
        links[r.channel] = {
          eventId: r.eventId,
          ...(r.ticketId ? { ticketId: r.ticketId } : {}),
          ...(r.url ? { url: r.url } : {}),
        };
      }

      return res.json({
        success: true,
        data: {
          master: {
            id: ref.masterEvent.id,
            title: ref.masterEvent.title,
          },
          links,
        },
      });
    }

    const events = await prisma.masterEvent.findMany({
      where: { userId: req.userId },
      include: MASTER_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    const enriched = await withChannelPublishStatusMany(events);
    res.json({ success: true, data: enriched.map(toPublicMaster) });
  } catch (err) {
    next(err);
  }
}

async function getMasterEvent(req, res, next) {
  try {
    const event = await prisma.masterEvent.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: MASTER_INCLUDE,
    });

    if (!event) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }

    const enriched = await withChannelPublishStatus(event);
    res.json({ success: true, data: toPublicMaster(enriched) });
  } catch (err) {
    next(err);
  }
}

async function createMasterEvent(req, res, next) {
  try {
    const body = req.body || {};
    const { channelRefs = [] } = body;

    if (!body.title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const fields = pickMasterFields({ ...body, title: body.title, capacity: body.capacity ?? 150 });

    const event = await prisma.masterEvent.create({
      data: {
        id: crypto.randomUUID().replace(/-/g, "").slice(0, 64),
        userId: req.userId,
        ...fields,
        channelRefs: channelRefs.length
          ? { create: mapChannelRefs(channelRefs) }
          : undefined,
      },
      include: MASTER_INCLUDE,
    });

    await mirrorMasterToChannelEvents(req.userId, event);

    const enriched = await withChannelPublishStatus(event);
    res.status(201).json({ success: true, data: toPublicMaster(enriched) });
  } catch (err) {
    next(err);
  }
}

async function updateMasterEvent(req, res, next) {
  try {
    const existing = await prisma.masterEvent.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }

    const body = req.body || {};
    const data = pickMasterFields(body);
    const { channelRefs } = body;

    if (Array.isArray(channelRefs)) {
      const refs = mapChannelRefs(channelRefs);
      await prisma.$transaction([
        prisma.channelRef.deleteMany({ where: { masterId: existing.id } }),
        prisma.masterEvent.update({
          where: { id: existing.id },
          data: {
            ...data,
            channelRefs: { create: refs },
          },
        }),
      ]);
    } else if (Object.keys(data).length > 0) {
      await prisma.masterEvent.update({
        where: { id: existing.id },
        data,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Provide fields to update (title, category, timezone, location, …)",
      });
    }

    const event = await prisma.masterEvent.findFirst({
      where: { id: existing.id, userId: req.userId },
      include: MASTER_INCLUDE,
    });

    await mirrorMasterToChannelEvents(req.userId, event);

    const enriched = await withChannelPublishStatus(event);
    res.json({ success: true, data: toPublicMaster(enriched) });
  } catch (err) {
    next(err);
  }
}

async function removeMasterEvent(req, res, next) {
  try {
    const ok = await deleteMasterEvent(req.params.id, req.userId);
    if (!ok) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }
    res.json({ success: true, message: "Master event deleted" });
  } catch (err) {
    next(err);
  }
}

async function linkChannelRef(req, res, next) {
  try {
    const body = req.body || {};
    const channel = body.channel;
    const ref = body.ref || body;
    if (!channel && !ref.channel) {
      return res.status(400).json({ success: false, message: "channel is required" });
    }

    const master = await linkChannel(req.params.id, req.userId, {
      channel: channel || ref.channel,
      eventId: ref.eventId ?? body.eventId,
      ticketId: ref.ticketId ?? body.ticketId,
      url: ref.url ?? body.url,
    });

    if (!master) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }

    res.status(201).json({ success: true, data: serialize(master) });
  } catch (err) {
    next(err);
  }
}

async function unlinkChannelRef(req, res, next) {
  try {
    const master = await unlinkChannel(req.params.id, req.userId, req.params.channel);
    if (!master) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }
    res.json({ success: true, data: serialize(master) });
  } catch (err) {
    next(err);
  }
}

async function listAttendees(req, res, next) {
  try {
    const master = await prisma.masterEvent.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { id: true },
    });
    if (!master) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }

    const attendees = await prisma.attendee.findMany({
      where: { masterId: req.params.id },
      orderBy: { registeredAt: "desc" },
    });
    res.json({ success: true, data: serialize(attendees) });
  } catch (err) {
    next(err);
  }
}

async function createAttendee(req, res, next) {
  try {
    const master = await prisma.masterEvent.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { id: true },
    });
    if (!master) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }

    const { email, name, source, registeredAt } = req.body || {};
    if (!email || !name || !source) {
      return res.status(422).json({
        success: false,
        message: "email, name, and source are required",
      });
    }
    if (!parseChannel(source)) {
      return res.status(400).json({ success: false, message: "invalid source channel" });
    }

    const data = await registerAttendee(req.params.id, {
      email,
      name,
      source,
      registeredAt,
    });
    res.status(201).json({ success: true, data: serialize(data) });
  } catch (err) {
    next(err);
  }
}

async function createAttendeeByChannel(req, res, next) {
  try {
    const { channel, eventId, email, name, registeredAt, status } = req.body || {};
    if (!channel || !eventId || !email) {
      return res.status(422).json({
        success: false,
        message: "channel, eventId, and email are required",
      });
    }

    const data = await registerAttendeeByChannel({
      channel,
      eventId,
      email,
      name,
      registeredAt,
      status,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "No master event linked to this channel event",
      });
    }

    res.status(201).json({ success: true, data: serialize(data) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMasterEvents,
  getMasterEvent,
  createMasterEvent,
  updateMasterEvent,
  removeMasterEvent,
  linkChannelRef,
  unlinkChannelRef,
  listAttendees,
  createAttendee,
  createAttendeeByChannel,
};
