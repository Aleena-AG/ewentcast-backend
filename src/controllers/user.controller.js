const prisma = require("../config/db");
const { serialize } = require("../utils/serialize");
const { isAdmin } = require("../middlewares/requireAdmin");

const userSelect = {
  id: true,
  email: true,
  name: true,
  type: true,
  authSource: true,
  htUserId: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
};

/** Returns authenticated user, or all users when caller is admin. */
async function getUsers(req, res, next) {
  try {
    if (isAdmin(req.user)) {
      const users = await prisma.user.findMany({
        select: {
          ...userSelect,
          subscription: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ success: true, data: serialize(users) });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: userSelect,
    });
    res.json({ success: true, data: serialize(user ? [user] : []) });
  } catch (err) {
    next(err);
  }
}

/** Profile by id — own account, or any account for admin. */
async function getUserById(req, res, next) {
  try {
    const isOwn = String(req.params.id) === String(req.userId);
    if (!isOwn && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You can only access your own profile.",
      });
    }

    const id = BigInt(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...userSelect,
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
