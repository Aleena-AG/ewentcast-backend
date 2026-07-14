const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  listMasterEvents,
  getMasterEvent,
  createMasterEvent,
  updateMasterEvent,
  removeMasterEvent,
  linkChannelRef,
  unlinkChannelRef,
  listAttendees,
  createAttendee,
  createAttendeeByChannel,
} = require("../controllers/registry.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/", listMasterEvents);
router.post("/", createMasterEvent);

// Must be before /:id
router.post("/attendees/by-channel", createAttendeeByChannel);

router.get("/:id", getMasterEvent);
router.patch("/:id", updateMasterEvent);
router.put("/:id", updateMasterEvent);
router.delete("/:id", removeMasterEvent);

router.get("/:id/attendees", listAttendees);
router.post("/:id/attendees", createAttendee);

router.post("/:id/channels", linkChannelRef);
router.delete("/:id/channels/:channel", unlinkChannelRef);

module.exports = router;
