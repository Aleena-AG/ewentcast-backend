const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  listBookings,
  listEvents,
  getEvent,
  syncEvents,
  syncBookings,
  syncFromApi,
  syncAllFromApi,
  purgeChannel,
  removeEvent,
} = require("../controllers/events.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/bookings", listBookings);
router.post("/sync-all", syncAllFromApi);
router.post("/:channel/sync", syncEvents);
router.post("/:channel/sync-bookings", syncBookings);
router.post("/:channel/sync-from-api", syncFromApi);
router.get("/:channel", listEvents);
router.get("/:channel/:externalId", getEvent);
router.delete("/:channel", purgeChannel);
router.delete("/:channel/:externalId", removeEvent);

module.exports = router;
