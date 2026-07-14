const { getUserSettings } = require("../services/settings.service");
const eventbrite = require("../services/eventbrite/eventbrite.service");

async function listOrganizations(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const data = await eventbrite.listOrganizations(settings);
    res.json({ success: true, data });
  } catch (err) {
    if (err.name === "EventbriteApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }
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
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.name === "EventbriteApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

module.exports = { listOrganizations, createOrganizationEvent };
