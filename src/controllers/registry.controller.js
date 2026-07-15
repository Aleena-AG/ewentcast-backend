const prisma = require("../config/db");
const { serialize } = require("../utils/serialize");
const crypto = require("crypto");
const {
  withChannelPublishStatus,
  withChannelPublishStatusMany,
} = require("../services/registry.service");

async function listMasterEvents(req, res, next) {
  try {
    const events = await prisma.masterEvent.findMany({
      where: { userId: req.userId },
      include: { channelRefs: true, attendees: true },
      orderBy: { updatedAt: "desc" },
    });
    const enriched = await withChannelPublishStatusMany(events);
    res.json({ success: true, data: serialize(enriched) });
  } catch (err) {
    next(err);
  }
}

async function getMasterEvent(req, res, next) {
  try {
    const event = await prisma.masterEvent.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { channelRefs: true, attendees: true },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: "Master event not found" });
    }

    const enriched = await withChannelPublishStatus(event);
    res.json({ success: true, data: serialize(enriched) });
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
          ? {
              create: channelRefs.map((ref) => ({
                channel: ref.channel,
                eventId: ref.eventId || "",
                ticketId: ref.ticketId || null,
                url: ref.url || null,
              })),
            }
          : undefined,
      },
      include: { channelRefs: true, attendees: true },
    });

    const enriched = await withChannelPublishStatus(event);
    res.status(201).json({ success: true, data: serialize(enriched) });
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
  listAttendees,
};
