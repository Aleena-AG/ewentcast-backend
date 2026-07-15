const { getDashboardStatsForUser } = require("../services/dashboard.service");

async function getStats(req, res, next) {
  try {
    const data = await getDashboardStatsForUser(req.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
