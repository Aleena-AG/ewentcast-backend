const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  createLumaEvent,
  createLumaImageUploadUrl,
} = require("../controllers/luma.controller");

const router = express.Router();

router.use(requireAuth);

router.post("/events", createLumaEvent);
router.post("/images/upload-url", createLumaImageUploadUrl);
router.post("/images/create-upload-url", createLumaImageUploadUrl);

module.exports = router;
