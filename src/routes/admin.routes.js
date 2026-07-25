const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const { requireAdmin } = require("../middlewares/requireAdmin");
const {
  listUsers,
  getUser,
  listSubscriptions,
  updateUserType,
} = require("../controllers/admin.controller");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/users", listUsers);
router.get("/users/:id", getUser);
router.patch("/users/:id/type", updateUserType);
router.get("/subscriptions", listSubscriptions);

module.exports = router;
