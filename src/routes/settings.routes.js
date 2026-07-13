const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  getSettings,
  putSettings,
  deleteChannelSettings,
} = require("../controllers/settings.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/", getSettings);
router.put("/", putSettings);
router.delete("/:channel", deleteChannelSettings);

module.exports = router;
