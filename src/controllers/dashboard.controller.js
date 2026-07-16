const { getDashboardStats } = require("../services/dashboard.service");

async function getStats(req, res, next) {
  try {
    const data = await getDashboardStats(req.userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
