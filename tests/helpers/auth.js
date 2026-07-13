const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/db");

async function createAuthedUser(prefix = "jest") {
  const email = `${prefix}.${Date.now()}.${Math.floor(Math.random() * 9999)}@ewentcast.test`;
  const password = "Password123!";
  const res = await request(app).post("/api/v1/auth/register").send({
    name: "Jest User",
    email,
    password,
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    email,
    password,
    token: res.body.token,
    userId: String(res.body.user.id),
    authHeader: { Authorization: `Bearer ${res.body.token}` },
  };
}

async function cleanupUser(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const uid = user.id;
  await prisma.channelBooking.deleteMany({ where: { userId: uid } });
  await prisma.lumaEvent.deleteMany({ where: { userId: uid } });
  await prisma.eventbriteEvent.deleteMany({ where: { userId: uid } });
  await prisma.hightribeEvent.deleteMany({ where: { userId: uid } });
  await prisma.userSettings.deleteMany({ where: { userId: uid } });
  await prisma.session.deleteMany({ where: { userId: uid } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: uid } });
  await prisma.subscription.deleteMany({ where: { userId: uid } });
  await prisma.htConnection.deleteMany({ where: { userId: uid } });
  const masters = await prisma.masterEvent.findMany({
    where: { userId: uid },
    select: { id: true },
  });
  const masterIds = masters.map((m) => m.id);
  if (masterIds.length) {
    await prisma.attendee.deleteMany({ where: { masterId: { in: masterIds } } });
    await prisma.channelRef.deleteMany({ where: { masterId: { in: masterIds } } });
    await prisma.masterEvent.deleteMany({ where: { id: { in: masterIds } } });
  }
  await prisma.user.delete({ where: { id: uid } });
}

module.exports = { createAuthedUser, cleanupUser, app, prisma };
