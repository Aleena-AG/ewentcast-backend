const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPasswordHandler,
  resendVerificationHandler,
  verifyEmailHandler,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPasswordHandler);
router.post("/resend-verification", resendVerificationHandler);
router.post("/verify-email", verifyEmailHandler);
router.get("/verify-email", verifyEmailHandler);

module.exports = router;
