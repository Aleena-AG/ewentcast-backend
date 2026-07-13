const prisma = require("../config/db");
const { serialize } = require("../utils/serialize");

const userSelect = {
  id: true,
  email: true,
  name: true,
  authSource: true,
  htUserId: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
};

/** Returns only the authenticated user. */
async function getUsers(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: userSelect,
    });
    res.json({ success: true, data: serialize(user ? [user] : []) });
  } catch (err) {
    next(err);
  }
}

/** Profile by id — only own account. */
async function getUserById(req, res, next) {
  try {
    if (String(req.params.id) !== String(req.userId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You can only access your own profile.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
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
