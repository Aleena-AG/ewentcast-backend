const request = require("supertest");
const { createAuthedUser, cleanupUser, app, prisma } = require("../helpers/auth");

let auth;

beforeAll(async () => {
  auth = await createAuthedUser("webhooks");
  await prisma.lumaEvent.upsert({
    where: {
      userId_externalId: {
        userId: BigInt(auth.userId),
        externalId: "jest-wh-evt-1",
      },
    },
    create: {
      userId: BigInt(auth.userId),
      externalId: "jest-wh-evt-1",
      title: "Webhook Test Event",
      payloadJson: { api_id: "jest-wh-evt-1" },
      syncedAt: new Date(),
    },
    update: { title: "Webhook Test Event" },
  });
});

afterAll(async () => {
  await cleanupUser(auth.email);
  await prisma.$disconnect();
});

describe("Webhooks API", () => {
  test("GET setup requires auth", async () => {
    const res = await request(app).get("/api/v1/webhooks/setup");
    expect(res.status).toBe(401);
  });

  test("GET setup with token", async () => {
    const res = await request(app)
      .get("/api/v1/webhooks/setup")
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.endpoints.luma).toContain("/api/v1/webhooks/luma");
  });

  test("GET hightribe info is public", async () => {
    const res = await request(app).get("/api/v1/webhooks/hightribe");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("POST luma guest.registered saves booking for owner", async () => {
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
        data: { id: "evt-xyz", name: "Something", url: "https://lu.ma/x" },
      });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toMatch(/event webhook/i);
  });

  test("POST eventbrite test action", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/eventbrite")
      .send({ config: { action: "test" } });
    expect(res.status).toBe(200);
  });

  test("POST hightribe unknown event skipped", async () => {
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
