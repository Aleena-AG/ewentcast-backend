const { resolveSession } = require("../services/auth.service");

/**
 * Requires Authorization: Bearer <token>.
 * Sets req.user, req.userId, req.sessionToken from the session.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !String(header).startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Send Authorization: Bearer <token>",
      });
    }

    const user = await resolveSession(header);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Session expired or invalid token",
      });
    }

    req.user = user;
    req.userId = user.id;
    req.sessionToken = header.slice(7).trim();
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth };
