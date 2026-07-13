const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const { getUsers, getUserById } = require("../controllers/user.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/", getUsers);
router.get("/:id", getUserById);

module.exports = router;
