function getHealth(req, res) {
  res.json({ success: true, message: "API is running" });
}

module.exports = { getHealth };
