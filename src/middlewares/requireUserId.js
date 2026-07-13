const { resolveSession } = require("../services/auth.service");

async function requireUserId(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (header) {
      const user = await resolveSession(header);
      if (user) {
        req.user = user;
        req.userId = user.id;
        req.sessionToken = header.startsWith("Bearer ") ? header.slice(7) : header;
        return next();
      }
    }

    const raw = req.headers["x-user-id"] || req.query.userId || req.body?.userId;
    if (!raw) {
      return res.status(401).json({
        success: false,
        message:
          "Auth required (Authorization: Bearer <token> or header x-user-id)",
      });
    }

    req.userId = BigInt(raw);
    return next();
  } catch {
    return res.status(400).json({ success: false, message: "invalid auth / userId" });
  }
}

module.exports = { requireUserId };
