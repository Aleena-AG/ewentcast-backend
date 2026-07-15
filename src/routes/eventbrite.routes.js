const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  listOrganizations,
  createOrganizationEvent,
  proxyEventbrite,
} = require("../controllers/eventbrite.controller");

const router = express.Router();

router.use(requireAuth);

// Specific helpers (same as proxy, but kept for clarity / create sanitization)
router.get("/organizations", listOrganizations);
router.post("/organizations/:orgId/events", createOrganizationEvent);

// Forward everything else to Eventbrite v3 (structured_content, tickets, publish, …)
router.all("/{*path}", proxyEventbrite);

module.exports = router;
