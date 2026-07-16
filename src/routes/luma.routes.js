const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  createLumaEvent,
  getLumaEvent,
  createLumaImageUploadUrl,
  listLumaTicketTypes,
  createLumaTicketType,
  updateLumaTicketType,
  applyLumaEventTag,
  listLumaGuests,
} = require("../controllers/luma.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/events", getLumaEvent);
router.get("/guests", listLumaGuests);
router.post("/events", createLumaEvent);
router.post("/images/upload-url", createLumaImageUploadUrl);
router.post("/images/create-upload-url", createLumaImageUploadUrl);

router.get("/ticket-types", listLumaTicketTypes);
router.post("/ticket-types", createLumaTicketType);
router.put("/ticket-types", updateLumaTicketType);

// FE tries both path shapes (calendars vs calendar)
router.post("/calendars/event-tags/apply", applyLumaEventTag);
router.post("/calendar/event-tags/apply", applyLumaEventTag);

module.exports = router;
