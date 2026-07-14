const hightribe = require("../services/hightribe/hightribe.service");

async function createHightribeEvent(req, res, next) {
  try {
    const data = await hightribe.createEvent(req.userId, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.name === "HightribeApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

async function createHightribeEventWithTickets(req, res, next) {
  try {
    const data = await hightribe.createEventWithTickets(req.userId, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.name === "HightribeApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

module.exports = { createHightribeEvent, createHightribeEventWithTickets };
