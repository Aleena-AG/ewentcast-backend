const {
  getUserSettings,
  updateUserSettings,
  clearChannelSettings,
  toPublicSettingsView,
} = require("../services/settings.service");
const { parseChannel } = require("../services/channels/helpers");
const { serialize } = require("../utils/serialize");

async function getSettings(req, res, next) {
  try {
    const settings = await getUserSettings(req.userId);
    const full = req.query.full === "1";
    res.json({
      success: true,
      data: full ? serialize(settings) : toPublicSettingsView(settings),
    });
  } catch (err) {
    next(err);
  }
}

async function putSettings(req, res, next) {
  try {
    const settings = await updateUserSettings(req.userId, req.body || {});
    res.json({ success: true, data: toPublicSettingsView(settings) });
  } catch (err) {
    next(err);
  }
}

async function deleteChannelSettings(req, res, next) {
  try {
    const channel = parseChannel(req.params.channel);
    if (!channel) {
      return res.status(400).json({ success: false, message: "invalid channel" });
    }
    const settings = await clearChannelSettings(req.userId, channel);
    res.json({ success: true, data: toPublicSettingsView(settings) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, putSettings, deleteChannelSettings };
