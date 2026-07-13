const {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
  resendVerification,
  verifyEmail,
  getMe,
  deleteSession,
} = require("../services/auth.service");
const { serialize } = require("../utils/serialize");

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(422).json({ success: false, message: "All fields are required" });
    }
    if (String(password).length < 8) {
      return res.status(422).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const result = await registerUser({ name, email, password });
    res.status(201).json({ success: true, ...serialize(result) });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(422).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await loginUser(email, password);
    res.json({ success: true, ...serialize(result) });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.sessionToken) await deleteSession(req.sessionToken);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const data = await getMe(req.sessionToken);
    if (!data) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    res.json({ success: true, ...serialize(data) });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(422).json({ success: false, message: "Email is required" });
    }
    const result = await requestPasswordReset(email);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function resetPasswordHandler(req, res, next) {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(422).json({
        success: false,
        message: "Token and password are required",
      });
    }
    await resetPassword(token, password);
    res.json({
      success: true,
      message: "Password updated. You can sign in now.",
    });
  } catch (err) {
    next(err);
  }
}

async function resendVerificationHandler(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(422).json({ success: false, message: "Email is required" });
    }
    const result = await resendVerification(email);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function verifyEmailHandler(req, res, next) {
  try {
    const token = req.body?.token || req.query?.token;
    if (!token) {
      return res.status(422).json({ success: false, message: "Token is required" });
    }
    const result = await verifyEmail(String(token));
    res.json({
      success: true,
      message: "Email verified successfully.",
      ...serialize(result),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPasswordHandler,
  resendVerificationHandler,
  verifyEmailHandler,
};
