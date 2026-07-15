const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  loginHightribe,
  createHightribeEvent,
  createHightribeEventWithTickets,
} = require("../controllers/hightribe.controller");

const router = express.Router();

router.use(requireAuth);

// Connect: email/password → HT API login → save token in settings
router.post("/login", loginHightribe);

router.post("/events/with-tickets", createHightribeEventWithTickets);
router.post("/events", createHightribeEvent);

module.exports = router;
