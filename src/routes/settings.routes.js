const express = require("express");
const { requireUserId } = require("../middlewares/requireUserId");
const {
  getSettings,
  putSettings,
  deleteChannelSettings,
} = require("../controllers/settings.controller");

const router = express.Router();

router.use(requireUserId);

router.get("/", getSettings);
router.put("/", putSettings);
router.delete("/:channel", deleteChannelSettings);

module.exports = router;
