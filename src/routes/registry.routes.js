const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  listMasterEvents,
  getMasterEvent,
  createMasterEvent,
  listAttendees,
} = require("../controllers/registry.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/", listMasterEvents);
router.post("/", createMasterEvent);
router.get("/:id", getMasterEvent);
router.get("/:id/attendees", listAttendees);

module.exports = router;
