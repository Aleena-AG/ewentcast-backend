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
} = require("../services/registry.service");

const MASTER_INCLUDE = { channelRefs: true, attendees: true };

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

async function listMasterEvents(req, res, next) {
  try {
    const events = await prisma.masterEvent.findMany({
      where: { userId: req.userId },
      include: MASTER_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    res.json({ success: true, data: serialize(events) });
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

    res.json({ success: true, data: serialize(event) });
  } catch (err) {
    next(err);
  }
}

async function createMasterEvent(req, res, next) {
  try {
    const { title, capacity = 150, channelRefs = [] } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const event = await prisma.masterEvent.create({
      data: {
        id: crypto.randomUUID().replace(/-/g, "").slice(0, 64),
        title,
        capacity,
        userId: req.userId,
        channelRefs: channelRefs.length
          ? { create: mapChannelRefs(channelRefs) }
          : undefined,
      },
      include: MASTER_INCLUDE,
    });

    res.status(201).json({ success: true, data: serialize(event) });
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

    const { title, capacity, channelRefs } = req.body || {};
    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ success: false, message: "title cannot be empty" });
    }
    if (capacity !== undefined && (Number.isNaN(Number(capacity)) || Number(capacity) < 0)) {
      return res.status(400).json({
        success: false,
        message: "capacity must be a non-negative number",
      });
    }

    const data = {};
    if (title !== undefined) data.title = String(title).trim();
    if (capacity !== undefined) data.capacity = Number(capacity);

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
        message: "Provide title, capacity, and/or channelRefs to update",
      });
    }

    const event = await prisma.masterEvent.findFirst({
      where: { id: existing.id, userId: req.userId },
      include: MASTER_INCLUDE,
    });

    res.json({ success: true, data: serialize(event) });
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
