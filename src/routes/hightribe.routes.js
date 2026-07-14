const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  createHightribeEvent,
  createHightribeEventWithTickets,
} = require("../controllers/hightribe.controller");

const router = express.Router();

router.use(requireAuth);
router.post("/events/with-tickets", createHightribeEventWithTickets);
router.post("/events", createHightribeEvent);

module.exports = router;
