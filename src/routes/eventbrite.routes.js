const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  listOrganizations,
  createOrganizationEvent,
} = require("../controllers/eventbrite.controller");

const router = express.Router();

router.use(requireAuth);
router.get("/organizations", listOrganizations);
router.post("/organizations/:orgId/events", createOrganizationEvent);

module.exports = router;
