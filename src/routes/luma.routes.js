const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  createLumaEvent,
  createLumaImageUploadUrl,
  listLumaTicketTypes,
  createLumaTicketType,
  updateLumaTicketType,
} = require("../controllers/luma.controller");

const router = express.Router();

router.use(requireAuth);

router.post("/events", createLumaEvent);
router.post("/images/upload-url", createLumaImageUploadUrl);
router.post("/images/create-upload-url", createLumaImageUploadUrl);

router.get("/ticket-types", listLumaTicketTypes);
router.post("/ticket-types", createLumaTicketType);
router.put("/ticket-types", updateLumaTicketType);

module.exports = router;
