const express = require("express");
const healthRoutes = require("./health.routes");
const userRoutes = require("./user.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/users", userRoutes);

module.exports = router;
