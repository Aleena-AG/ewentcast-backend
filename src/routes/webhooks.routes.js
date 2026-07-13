const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
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

// Public inbound webhooks (channels call these — no user Bearer)
router.post("/luma", lumaWebhook);
router.post("/eventbrite", eventbriteWebhook);
router.post("/hightribe", hightribeWebhook);
router.get("/hightribe", hightribeWebhookInfo);

// Authenticated setup + ops
router.get("/setup", requireAuth, getSetup);
router.post("/setup", requireAuth, postSetup);
router.get("/logs", getLogs);

module.exports = router;
