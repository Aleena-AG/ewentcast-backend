const prisma = require("../config/db");
const { hashPassword, verifyPassword, newToken } = require("../utils/crypto");
const { serialize } = require("../utils/serialize");

const SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);
const RESET_TOKEN_HOURS = Number(process.env.AUTH_RESET_TOKEN_HOURS || 2);
const VERIFY_TOKEN_HOURS = Number(process.env.AUTH_VERIFY_TOKEN_HOURS || 48);
const TRIAL_DAYS = Number(process.env.EWENTCAST_TRIAL_DAYS || 14);
const EXPOSE_TOKENS =
  process.env.AUTH_EXPOSE_RESET_TOKEN === "true" || process.env.NODE_ENV !== "production";
const APP_URL = (process.env.APP_URL || "http://api.ewentcast.test").replace(/\/$/, "");

function sessionExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

function resetExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + RESET_TOKEN_HOURS);
  return d;
}

function verifyExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + VERIFY_TOKEN_HOURS);
  return d;
}

function toUserView(user) {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    authSource: user.authSource,
  };
}

async function getAccountView(userId) {
  const uid = BigInt(userId);
  const user = await prisma.user.findUnique({
    where: { id: uid },
    include: { subscription: true, htConnection: true },
  });
  if (!user) return null;

  const sub = user.subscription;
  const ht = user.htConnection;
  const status = sub?.status || "inactive";
  const trialEndsAt = sub?.trialEndsAt || null;
  const trialStillValid = status === "trialing" && trialEndsAt && trialEndsAt > new Date();
  const trialExpired = status === "trialing" && trialEndsAt && trialEndsAt <= new Date();
  const active = status === "active" || !!trialStillValid;
  const displayStatus = trialExpired ? "expired" : status;
  const daysLeft =
    status === "trialing" && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000))
      : null;

  return {
    auth_source: user.authSource === "hightribe" ? "hightribe_native" : "ewentcast_signup",
    subscription_plan: sub?.plan || "pro_monthly_20",
    subscription_status: displayStatus,
    subscription_active: active,
    trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
    trial_days_remaining: daysLeft,
    current_period_end: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    ht_connected: !!ht?.htUserId,
    linked_ht_user_id: ht?.htUserId || null,
    ht_connected_at: ht?.connectedAt ? ht.connectedAt.toISOString() : null,
    email_verified: !!user.emailVerifiedAt,
  };
}

async function createSession(userId) {
  const token = newToken();
  await prisma.session.create({
    data: {
      userId: BigInt(userId),
      token,
      expiresAt: sessionExpiry(),
    },
  });
  return token;
}

async function deleteSession(token) {
  await prisma.session.deleteMany({ where: { token } });
}

async function resolveSession(rawToken) {
  const token = String(rawToken || "").startsWith("Bearer ")
    ? String(rawToken).slice(7)
    : String(rawToken || "");
  if (!token) return null;

  const row = await prisma.session.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  return row?.user || null;
}

async function createEmailToken(userId, hoursFn) {
  const token = newToken();
  await prisma.passwordResetToken.deleteMany({
    where: { userId: BigInt(userId), usedAt: null },
  });
  await prisma.passwordResetToken.create({
    data: {
      userId: BigInt(userId),
      token,
      expiresAt: hoursFn(),
    },
  });
  return token;
}

async function registerUser({ name, email, password }) {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    const err = new Error("An account with this email already exists");
    err.statusCode = 422;
    throw err;
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  const user = await prisma.user.create({
    data: {
      email: normalized,
      name: name.trim(),
      passwordHash: hashPassword(password),
      authSource: "local",
      subscription: {
        create: {
          plan: "pro_monthly_20",
          status: "trialing",
          trialEndsAt: trialEnd,
        },
      },
    },
  });

  const verifyToken = await createEmailToken(user.id, verifyExpiry);
  const token = await createSession(user.id);
  const account = await getAccountView(user.id);

  const result = {
    token,
    user: toUserView(user),
    ewentcast: account,
  };

  if (EXPOSE_TOKENS) {
    result.verifyToken = verifyToken;
    result.verifyUrl = `${APP_URL}/api/v1/auth/verify-email?token=${verifyToken}`;
  }

  return result;
}

async function loginUser(email, password) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const err = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  const token = await createSession(user.id);
  return {
    token,
    user: toUserView(user),
    ewentcast: await getAccountView(user.id),
  };
}

async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  // Always OK to avoid email enumeration
  if (!user) return { ok: true };

  const resetToken = await createEmailToken(user.id, resetExpiry);
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

  if (EXPOSE_TOKENS) {
    return { ok: true, resetToken, resetUrl };
  }
  return { ok: true };
}

async function resetPassword(token, password) {
  if (password.length < 8) {
    const err = new Error("Password must be at least 8 characters");
    err.statusCode = 400;
    throw err;
  }

  const row = await prisma.passwordResetToken.findFirst({
    where: {
      token,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!row) {
    const err = new Error("Invalid or expired reset link");
    err.statusCode = 400;
    throw err;
  }

  await prisma.user.update({
    where: { id: row.userId },
    data: { passwordHash: hashPassword(password) },
  });
  await prisma.passwordResetToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  await prisma.session.deleteMany({ where: { userId: row.userId } });
}

async function resendVerification(email) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) return { ok: true };
  if (user.emailVerifiedAt) {
    return { ok: true, alreadyVerified: true };
  }

  const verifyToken = await createEmailToken(user.id, verifyExpiry);
  if (EXPOSE_TOKENS) {
    return {
      ok: true,
      verifyToken,
      verifyUrl: `${APP_URL}/api/v1/auth/verify-email?token=${verifyToken}`,
    };
  }
  return { ok: true };
}

async function verifyEmail(token) {
  const row = await prisma.passwordResetToken.findFirst({
    where: {
      token,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!row) {
    const err = new Error("Invalid or expired verification link");
    err.statusCode = 400;
    throw err;
  }

  await prisma.user.update({
    where: { id: row.userId },
    data: { emailVerifiedAt: new Date() },
  });
  await prisma.passwordResetToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  return { user: toUserView(user), ewentcast: await getAccountView(user.id) };
}

async function getMe(token) {
  const user = await resolveSession(token);
  if (!user) return null;

  const ht = await prisma.htConnection.findUnique({
    where: { userId: user.id },
  });

  return {
    user: toUserView(user),
    ewentcast: await getAccountView(user.id),
    ht_link_token: ht?.htToken || null,
  };
}

module.exports = {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
  resendVerification,
  verifyEmail,
  getMe,
  createSession,
  deleteSession,
  resolveSession,
  getAccountView,
  serialize,
};
