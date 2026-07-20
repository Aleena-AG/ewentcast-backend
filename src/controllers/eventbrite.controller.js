const { getUserSettings } = require("../services/settings.service");
const eventbrite = require("../services/eventbrite/eventbrite.service");
const { upsertChannelEvents } = require("../services/channels/events.service");

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

function parseJsonField(value) {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

/** Normalize multipart FormData (JSON-as-string fields) into a plain body. */
function normalizeBody(raw = {}) {
  const body = { ...(raw || {}) };
  for (const key of ["event", "ticket_classes", "tickets", "crop_mask"]) {
    if (body[key] != null) body[key] = parseJsonField(body[key]);
  }
  return body;
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
    const body = normalizeBody(req.body || {});
    const file = eventbrite.pickLogoFile(req.files);
    const data = await eventbrite.createOrganizationEventWithTickets(
      settings,
      req.params.orgId,
      body,
      file
    );
    try {
      await upsertChannelEvents("eventbrite", req.userId, [data], { prune: false });
    } catch {
      /* dashboard mirror is best-effort */
    }
    sendEbOk(res, data, 201);
  } catch (err) {
    if (err.name === "EventbriteApiError") return sendEbError(res, err);
    next(err);
  }
}

async function updateOrganizationEvent(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const body = normalizeBody(req.body || {});
    const file = eventbrite.pickLogoFile(req.files);
    const data = await eventbrite.updateEventWithTickets(
      settings,
      req.params.eventId,
      body,
      file
    );
    try {
      await upsertChannelEvents("eventbrite", req.userId, [data], { prune: false });
    } catch {
      /* dashboard mirror is best-effort */
    }
    sendEbOk(res, data);
  } catch (err) {
    if (err.name === "EventbriteApiError") return sendEbError(res, err);
    next(err);
  }
}

async function getOrganizationEvent(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await eventbrite.getEvent(
      settings,
      req.params.eventId,
      req.query || {}
    );
    sendEbOk(res, data);
  } catch (err) {
    if (err.name === "EventbriteApiError") return sendEbError(res, err);
    next(err);
  }
}

/** Standalone logo upload — returns Eventbrite media object (id, url, …). */
async function uploadMedia(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const file = eventbrite.pickLogoFile(req.files);
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "image file is required (field: logo, image, cover, or file)",
      });
    }
    const body = normalizeBody(req.body || {});
    const data = await eventbrite.uploadEventLogo(settings, file, body.crop_mask);
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

    // If proxying a single event GET without expand, enrich with logo when present
    if (
      req.method === "GET" &&
      /^events\/[^/]+\/?$/i.test(path) &&
      data &&
      typeof data === "object" &&
      data.logo
    ) {
      data.image = data.logo;
      data.image_url = data.logo.url || data.logo.original?.url || null;
    }

    sendEbOk(res, data, 200);
  } catch (err) {
    if (err.name === "EventbriteApiError") return sendEbError(res, err);
    next(err);
  }
}

module.exports = {
  listOrganizations,
  createOrganizationEvent,
  updateOrganizationEvent,
  getOrganizationEvent,
  uploadMedia,
  proxyEventbrite,
};
