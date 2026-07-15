const express = require("express");
const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const registryRoutes = require("./registry.routes");
const eventsRoutes = require("./events.routes");
const settingsRoutes = require("./settings.routes");
const webhooksRoutes = require("./webhooks.routes");
const lumaRoutes = require("./luma.routes");
const hightribeRoutes = require("./hightribe.routes");
const eventbriteRoutes = require("./eventbrite.routes");
const dashboardRoutes = require("./dashboard.routes");
const billingRoutes = require("./billing.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/registry", registryRoutes);
router.use("/events", eventsRoutes);
router.use("/settings", settingsRoutes);
router.use("/webhooks", webhooksRoutes);
router.use("/luma", lumaRoutes);
router.use("/hightribe", hightribeRoutes);
router.use("/eventbrite", eventbriteRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/billing", billingRoutes);

module.exports = router;
