const { getUserSettings } = require("../services/settings.service");
const luma = require("../services/luma/luma.service");

async function createLumaEvent(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.createEvent(settings, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.name === "LumaApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
        errorCode: err.errorCode,
      });
    }
    next(err);
  }
}

module.exports = { createLumaEvent };
