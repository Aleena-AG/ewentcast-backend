const { resolveSession } = require("../services/auth.service");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const user = await resolveSession(header);
  if (!user) {
    return res.status(401).json({ success: false, message: "Session expired" });
  }

  req.user = user;
  req.userId = user.id;
  req.sessionToken = header.startsWith("Bearer ") ? header.slice(7) : header;
  return next();
}

module.exports = { requireAuth };
