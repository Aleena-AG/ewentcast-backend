const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const { getStats } = require("../controllers/dashboard.controller");

const router = express.Router();

router.use(requireAuth);
router.get("/stats", getStats);

module.exports = router;
