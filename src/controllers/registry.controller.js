const prisma = require("../config/db");
const { serialize } = require("../utils/serialize");
const crypto = require("crypto");
const { parseChannel } = require("../services/channels/helpers");

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
      return res.status(400).json({ success: false, message: "capacity must be a non-negative number" });
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

module.exports = {
  listMasterEvents,
  getMasterEvent,
  createMasterEvent,
  updateMasterEvent,
  listAttendees,
};
