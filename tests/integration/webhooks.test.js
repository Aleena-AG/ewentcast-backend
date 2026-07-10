const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/db");

const TEST_EMAIL = "jest-webhooks@ewentcast.test";
let userId;

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: {
      email: TEST_EMAIL,
      name: "Jest Webhooks User",
      passwordHash: "test-hash",
    },
    update: { name: "Jest Webhooks User" },
  });
  userId = user.id.toString();

  await prisma.lumaEvent.upsert({
    where: {
      userId_externalId: {
        userId: BigInt(userId),
        externalId: "jest-wh-evt-1",
      },
    },
    create: {
      userId: BigInt(userId),
      externalId: "jest-wh-evt-1",
      title: "Webhook Test Event",
      payloadJson: { api_id: "jest-wh-evt-1" },
      syncedAt: new Date(),
    },
    update: { title: "Webhook Test Event" },
  });
});

afterAll(async () => {
  await prisma.webhookLog.deleteMany({
    where: { channel: { in: ["luma", "eventbrite", "hightribe"] } },
  });
  await prisma.channelBooking.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.lumaEvent.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.userSettings.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("Webhooks API", () => {
  test("GET setup returns endpoint URLs", async () => {
    const res = await request(app)
      .get("/api/v1/webhooks/setup")
      .set("x-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.body.endpoints.luma).toContain("/api/v1/webhooks/luma");
    expect(res.body.endpoints.eventbrite).toContain("/api/v1/webhooks/eventbrite");
    expect(res.body.endpoints.hightribe).toContain("/api/v1/webhooks/hightribe");
  });

  test("GET hightribe info", async () => {
    const res = await request(app).get("/api/v1/webhooks/hightribe");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.method).toBe("POST");
  });

  test("POST luma guest.registered saves booking", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/luma")
      .send({
        type: "guest.registered",
        guest: {
          event_api_id: "jest-wh-evt-1",
          email: "wh.guest@example.com",
          name: "WH Guest",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.bookingSaved).toBe(true);
  });

  test("POST luma event.updated is skipped", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/luma")
      .send({
        type: "event.updated",
        data: {
          id: "evt-xyz",
          name: "Something",
          url: "https://lu.ma/x",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toMatch(/event webhook/i);
  });

  test("POST eventbrite test action", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/eventbrite")
      .send({ config: { action: "test" } });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/test/i);
  });

  test("POST hightribe booking for unknown event is skipped", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/hightribe")
      .send({
        event_id: "ht-unknown-999",
        email: "ht@example.com",
        name: "HT Guest",
      });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBeDefined();
  });

  test("webhook logs require token", async () => {
    const res = await request(app).get("/api/v1/webhooks/logs");
    expect(res.status).toBe(401);
  });
});
