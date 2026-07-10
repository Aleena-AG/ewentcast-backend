const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/db");

const TEST_EMAIL = "jest-events@ewentcast.test";
let userId;

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: {
      email: TEST_EMAIL,
      name: "Jest Events User",
      passwordHash: "test-hash",
    },
    update: { name: "Jest Events User" },
  });
  userId = user.id.toString();
});

afterAll(async () => {
  await prisma.channelBooking.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.lumaEvent.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.eventbriteEvent.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.hightribeEvent.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.userSettings.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("Events API", () => {
  test("rejects missing user id", async () => {
    const res = await request(app).get("/api/v1/events/luma");
    expect(res.status).toBe(401);
  });

  test("rejects invalid channel", async () => {
    const res = await request(app)
      .get("/api/v1/events/facebook")
      .set("x-user-id", userId);
    expect(res.status).toBe(400);
  });

  test("sync luma events upserts sample data", async () => {
    const res = await request(app)
      .post("/api/v1/events/luma/sync")
      .set("x-user-id", userId)
      .send({
        prune: false,
        events: [
          {
            api_id: "jest-evt-luma-1",
            name: "Jest Yoga",
            start_at: "2026-08-01T17:00:00.000Z",
            status: "approved",
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.upserted).toBe(1);
    expect(res.body.events.length).toBeGreaterThanOrEqual(1);
    expect(res.body.events.some((e) => e.external_id === "jest-evt-luma-1")).toBe(true);
  });

  test("list luma events returns synced event", async () => {
    const res = await request(app)
      .get("/api/v1/events/luma")
      .set("x-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.body.events.some((e) => e.external_id === "jest-evt-luma-1")).toBe(true);
  });

  test("get event by external id", async () => {
    const res = await request(app)
      .get("/api/v1/events/luma/jest-evt-luma-1")
      .set("x-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.body.event.external_id).toBe("jest-evt-luma-1");
    expect(res.body.event.title).toBe("Jest Yoga");
  });

  test("sync bookings upserts guests", async () => {
    const res = await request(app)
      .post("/api/v1/events/luma/sync-bookings")
      .set("x-user-id", userId)
      .send({
        bookings: [
          {
            id: "jest-bk-1",
            email: "guest@example.com",
            name: "Guest One",
            event_external_id: "jest-evt-luma-1",
            event_title: "Jest Yoga",
            registered_at: "2026-07-01T10:00:00.000Z",
            ticket_count: 1,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.upserted).toBe(1);
  });

  test("list bookings returns synced booking", async () => {
    const res = await request(app)
      .get("/api/v1/events/bookings")
      .set("x-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.body.bookings.some((b) => b.external_id === "jest-bk-1")).toBe(true);
  });

  test("sync-from-api without credentials returns 400", async () => {
    const res = await request(app)
      .post("/api/v1/events/luma/sync-from-api")
      .set("x-user-id", userId)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("delete one event", async () => {
    await request(app)
      .post("/api/v1/events/luma/sync")
      .set("x-user-id", userId)
      .send({
        prune: false,
        events: [{ api_id: "jest-evt-delete-me", name: "Temp" }],
      });

    const res = await request(app)
      .delete("/api/v1/events/luma/jest-evt-delete-me")
      .set("x-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
