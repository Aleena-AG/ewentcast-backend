const prisma = require("../config/db");
const { serialize } = require("../utils/serialize");

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

/** GET /admin/users — all users with subscription. */
async function listUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: {
        ...userSelect,
        subscription: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: serialize(users) });
  } catch (err) {
    next(err);
  }
}

/** GET /admin/users/:id — any user profile. */
async function getUser(req, res, next) {
  try {
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
    if (err?.name === "SyntaxError" || String(err.message || "").includes("BigInt")) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    next(err);
  }
}

/** GET /admin/subscriptions — all subscriptions with user. */
async function listSubscriptions(req, res, next) {
  try {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            type: true,
            authSource: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: serialize(subscriptions) });
  } catch (err) {
    next(err);
  }
}

/** PATCH /admin/users/:id/type — set user|admin. */
async function updateUserType(req, res, next) {
  try {
    const type = String(req.body?.type || "").trim().toLowerCase();
    if (type !== "user" && type !== "admin") {
      return res.status(422).json({
        success: false,
        message: "type must be 'user' or 'admin'",
      });
    }

    const id = BigInt(req.params.id);

    if (type === "user" && String(id) === String(req.userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot demote your own admin account.",
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { type },
      select: userSelect,
    });

    res.json({ success: true, data: serialize(user) });
  } catch (err) {
    if (err?.name === "SyntaxError" || String(err.message || "").includes("BigInt")) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    next(err);
  }
}

module.exports = {
  listUsers,
  getUser,
  listSubscriptions,
  updateUserType,
};
