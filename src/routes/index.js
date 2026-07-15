const express = require("express");
const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const registryRoutes = require("./registry.routes");
const eventsRoutes = require("./events.routes");
const settingsRoutes = require("./settings.routes");
const webhooksRoutes = require("./webhooks.routes");
const dashboardRoutes = require("./dashboard.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/registry", registryRoutes);
router.use("/events", eventsRoutes);
router.use("/settings", settingsRoutes);
router.use("/webhooks", webhooksRoutes);

module.exports = router;
