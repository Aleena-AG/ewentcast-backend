const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const { createLumaEvent } = require("../controllers/luma.controller");

const router = express.Router();

router.use(requireAuth);
router.post("/events", createLumaEvent);

module.exports = router;
