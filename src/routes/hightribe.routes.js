const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  loginHightribe,
  createHightribeEvent,
  createHightribeEventWithTickets,
} = require("../controllers/hightribe.controller");

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

router.post("/login", loginHightribe);

router.post(
  "/events/with-tickets",
  optionalMultipart,
  createHightribeEventWithTickets
);
router.post("/events", optionalMultipart, createHightribeEvent);

module.exports = router;
