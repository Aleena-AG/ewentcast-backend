const prisma = require("../config/db");

async function getUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { name, email } = req.body;
    const user = await prisma.user.create({ data: { name, email } });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsers, createUser };
