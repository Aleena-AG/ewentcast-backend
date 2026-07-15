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

async function createLumaImageUploadUrl(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.createImageUploadUrl(settings, req.body || {});
    // Frontend expects { data: { upload_url, file_url / public_url } }
    res.json({
      success: true,
      status: "ok",
      data,
    });
  } catch (err) {
    if (err.name === "LumaApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        status: "error",
        message: err.message,
        errorCode: err.errorCode,
      });
    }
    next(err);
  }
}

function sendLumaError(res, err) {
  return res.status(err.statusCode || 400).json({
    success: false,
    status: "error",
    message: err.message,
    errorCode: err.errorCode,
  });
}

async function listLumaTicketTypes(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.listTicketTypes(settings, req.query || {});
    // FE reads ticket_types / entries at top level or under data
    res.json({
      success: true,
      status: "ok",
      ...data,
      data,
    });
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function createLumaTicketType(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.createTicketType(settings, req.body || {});
    res.status(201).json({
      success: true,
      status: "ok",
      ...data,
      data,
    });
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

async function updateLumaTicketType(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await luma.updateTicketType(settings, req.body || {});
    res.json({
      success: true,
      status: "ok",
      ...data,
      data,
    });
  } catch (err) {
    if (err.name === "LumaApiError") return sendLumaError(res, err);
    next(err);
  }
}

module.exports = {
  createLumaEvent,
  createLumaImageUploadUrl,
  listLumaTicketTypes,
  createLumaTicketType,
  updateLumaTicketType,
};
