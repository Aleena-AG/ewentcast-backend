function requireUserId(req, res, next) {
  const raw =
    req.headers["x-user-id"] ||
    req.query.userId ||
    req.body?.userId;

  if (!raw) {
    return res.status(401).json({
      success: false,
      message: "userId required (header x-user-id, query userId, or body userId)",
    });
  }

  try {
    req.userId = BigInt(raw);
    next();
  } catch {
    return res.status(400).json({ success: false, message: "invalid userId" });
  }
}

module.exports = { requireUserId };
