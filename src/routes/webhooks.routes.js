const express = require("express");
const { requireUserId } = require("../middlewares/requireUserId");
const {
  lumaWebhook,
  eventbriteWebhook,
  hightribeWebhook,
  hightribeWebhookInfo,
  getSetup,
  postSetup,
  getLogs,
} = require("../controllers/webhooks.controller");

const router = express.Router();

// Public inbound webhooks (no user auth — channels call these)
router.post("/luma", lumaWebhook);
router.post("/eventbrite", eventbriteWebhook);
router.post("/hightribe", hightribeWebhook);
router.get("/hightribe", hightribeWebhookInfo);

// Setup + logs
router.get("/setup", requireUserId, getSetup);
router.post("/setup", requireUserId, postSetup);
router.get("/logs", getLogs);

module.exports = router;
