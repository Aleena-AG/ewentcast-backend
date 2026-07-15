const request = require("supertest");
const { createAuthedUser, cleanupUser, app, prisma } = require("../helpers/auth");

let auth;

beforeAll(async () => {
  auth = await createAuthedUser("dashboard");
  const now = new Date();
  await prisma.lumaEvent.create({
    data: {
      userId: BigInt(auth.userId),
      externalId: "dash-luma-1",
      title: "Dashboard Yoga",
      startAt: now,
      status: "approved",
      payloadJson: {},
      syncedAt: now,
    },
  });
  await prisma.channelBooking.create({
    data: {
      userId: BigInt(auth.userId),
      channel: "luma",
      externalId: "dash-bk-1",
      eventExternalId: "dash-luma-1",
      eventTitle: "Dashboard Yoga",
      guestName: "Ada",
      guestEmail: "ada@example.com",
      ticketCount: 2,
      registeredAt: now,
      payloadJson: {},
      syncedAt: now,
    },
  });
}, 30000);

afterAll(async () => {
  if (auth?.email) await cleanupUser(auth.email);
  await prisma.$disconnect();
});

describe("Dashboard API", () => {
  test("rejects without token", async () => {
    const res = await request(app).get("/api/v1/dashboard/stats");
    expect(res.status).toBe(401);
  });

  test("returns stats for authenticated user", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/stats")
      .set(auth.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.channels.luma.events).toBeGreaterThanOrEqual(1);
    expect(data.channels.luma.bookings).toBeGreaterThanOrEqual(1);
    expect(data.totalEvents).toBeGreaterThanOrEqual(1);
    expect(data.totalBookings).toBeGreaterThanOrEqual(1);
    expect(data.unifiedAttendees).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.recent)).toBe(true);
    expect(Array.isArray(data.recentBookings)).toBe(true);
    expect(data.bookingTrend).toHaveLength(7);
    expect(data.revenueCurrency).toBe("USD");
  });
});
