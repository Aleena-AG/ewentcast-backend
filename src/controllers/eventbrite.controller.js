const { getUserSettings } = require("../services/settings.service");
const eventbrite = require("../services/eventbrite/eventbrite.service");

function sendEbError(res, err) {
  return res.status(err.statusCode || 400).json({
    success: false,
    message: err.message,
    error: err.message,
    error_description: err.message,
  });
}

function sendEbOk(res, data, status = 200) {
  // FE expects native Eventbrite fields at top level (id, page_version_number, …)
  res.status(status).json({
    success: true,
    ...(data && typeof data === "object" ? data : {}),
    data,
  });
}

async function listOrganizations(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await eventbrite.listOrganizations(settings);
    sendEbOk(res, data);
  } catch (err) {
    if (err.name === "EventbriteApiError") return sendEbError(res, err);
    next(err);
  }
}

async function createOrganizationEvent(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await eventbrite.createOrganizationEvent(
      settings,
      req.params.orgId,
      req.body || {}
    );
    sendEbOk(res, data, 201);
  } catch (err) {
    if (err.name === "EventbriteApiError") return sendEbError(res, err);
    next(err);
  }
}

/**
 * Catch-all proxy: /api/v1/eventbrite/* → Eventbrite API v3/*
 * Covers structured_content, ticket_classes, publish, timezones, venues, etc.
 */
async function proxyEventbrite(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);

    // Express 5 splat: /{*path} → params.path; fallback to req.path
    const splat = req.params.path;
    const fromSplat = Array.isArray(splat)
      ? splat.join("/")
      : splat != null
        ? String(splat)
        : "";
    const path = (fromSplat || req.path || "").replace(/^\/+/, "");

    const data = await eventbrite.proxyToEventbrite(
      settings,
      req.method,
      path,
      req.query || {},
      req.body
    );

    const status =
      req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
        ? 200
        : 200;
    sendEbOk(res, data, status);
  } catch (err) {
    if (err.name === "EventbriteApiError") return sendEbError(res, err);
    next(err);
  }
}

module.exports = {
  listOrganizations,
  createOrganizationEvent,
  proxyEventbrite,
};
