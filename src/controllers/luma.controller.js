const { getUserSettings } = require("../services/settings.service");
const luma = require("../services/luma/luma.service");
const { upsertChannelEvents } = require("../services/channels/events.service");

function sendLumaError(res, err) {
  return res.status(err.statusCode || 400).json({
    success: false,
    status: "error",
    message: err.message,
    errorCode: err.errorCode,
  });
}

function sendLumaOk(res, data, status = 200) {
  res.status(status).json({
    success: true,
    status: "ok",
    ...(data && typeof data === "object" ? data : {}),
    data,
  });
}

async function createLumaEvent(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.createEvent(settings, req.body || {});
    try {
      await upsertChannelEvents("luma", req.userId, [data], { prune: false });
    } catch {
      /* dashboard mirror is best-effort */
    }
    // Spread so FE can read `url` / `api_id` at top level or under `data`
    sendLumaOk(res, data, 201);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function getLumaEvent(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const eventId = String(
      req.query.api_id ||
        req.query.id ||
        req.query.event_id ||
        req.query.event_api_id ||
        ""
    ).trim();
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "api_id or event_id required",
      });
    }
    const data = await luma.getEvent(settings, eventId);
    sendLumaOk(res, data);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function createLumaImageUploadUrl(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.createImageUploadUrl(settings, req.body || {});
    sendLumaOk(res, data);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function listLumaTicketTypes(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.listTicketTypes(settings, req.query || {});
    sendLumaOk(res, data);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function createLumaTicketType(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.createTicketType(settings, req.body || {});
    sendLumaOk(res, data, 201);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function updateLumaTicketType(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.updateTicketType(settings, req.body || {});
    sendLumaOk(res, data);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function applyLumaEventTag(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.applyEventTag(settings, req.body || {});
    sendLumaOk(res, data);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function listLumaGuests(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const eventId = String(
      req.query.event_id ||
        req.query.event_api_id ||
        req.query.api_id ||
        req.query.id ||
        ""
    ).trim();
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "event_id required",
      });
    }
    const data = await luma.listEventGuests(settings, eventId);
    sendLumaOk(res, data);
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

module.exports = {
  createLumaEvent,
  getLumaEvent,
  createLumaImageUploadUrl,
  listLumaTicketTypes,
  createLumaTicketType,
  updateLumaTicketType,
  applyLumaEventTag,
  listLumaGuests,
};
