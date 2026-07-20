const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  listOrganizations,
  createOrganizationEvent,
  updateOrganizationEvent,
  proxyEventbrite,
} = require("../controllers/eventbrite.controller");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 5 },
});

function optionalMultipart(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return upload.any()(req, res, next);
  }
  return next();
}

router.use(requireAuth);

// Specific helpers (create/update with optional ticket_classes)
router.get("/organizations", listOrganizations);
router.post(
  "/organizations/:orgId/events",
  optionalMultipart,
  createOrganizationEvent
);
router.post("/events/:eventId", optionalMultipart, updateOrganizationEvent);
router.put("/events/:eventId", optionalMultipart, updateOrganizationEvent);
router.patch("/events/:eventId", optionalMultipart, updateOrganizationEvent);

// Forward everything else to Eventbrite v3 (structured_content, tickets, publish, …)
router.all("/{*path}", optionalMultipart, proxyEventbrite);

module.exports = router;
