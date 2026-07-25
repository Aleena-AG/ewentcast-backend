/**
 * Requires an authenticated admin user.
 * Use after requireAuth (or alone — it also checks auth).
 * Sets req.user, req.userId, req.sessionToken when used alone.
 */
const { resolveSession } = require("../services/auth.service");

function isAdmin(user) {
  return user && user.type === "admin";
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
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
    }

    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Admin access required.",
      });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAdmin, isAdmin };
