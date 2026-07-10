const prisma = require("../config/db");
const { serialize } = require("../utils/serialize");

async function getUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        authSource: true,
        htUserId: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: "desc" },
    });
    res.json({ success: true, data: serialize(users) });
  } catch (err) {
    next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.params.id) },
      select: {
        id: true,
        email: true,
        name: true,
        authSource: true,
        htUserId: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        subscription: true,
        userSettings: true,
        htConnection: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: serialize(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsers, getUserById };
