const request = require("supertest");
const { createAuthedUser, cleanupUser, app, prisma } = require("../helpers/auth");

let auth;

beforeAll(async () => {
  auth = await createAuthedUser("events");
});

afterAll(async () => {
  await cleanupUser(auth.email);
  await prisma.$disconnect();
});

describe("Events API (auth)", () => {
  test("rejects missing token", async () => {
    const res = await request(app).get("/api/v1/events/luma");
    expect(res.status).toBe(401);
  });

  test("rejects invalid channel", async () => {
    const res = await request(app)
      .get("/api/v1/events/facebook")
      .set(auth.authHeader);
    expect(res.status).toBe(400);
  });

  test("sync luma events for token user only", async () => {
    const res = await request(app)
      .post("/api/v1/events/luma/sync")
      .set(auth.authHeader)
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
    expect(res.body.upserted).toBe(1);
    expect(res.body.events.some((e) => e.external_id === "jest-evt-luma-1")).toBe(true);
  });

  test("list luma events", async () => {
    const res = await request(app)
      .get("/api/v1/events/luma")
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.events.some((e) => e.external_id === "jest-evt-luma-1")).toBe(true);
  });

  test("get event by external id", async () => {
    const res = await request(app)
      .get("/api/v1/events/luma/jest-evt-luma-1")
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.event.external_id).toBe("jest-evt-luma-1");
  });

  test("sync bookings", async () => {
    const res = await request(app)
      .post("/api/v1/events/luma/sync-bookings")
      .set(auth.authHeader)
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

  test("list bookings", async () => {
    const res = await request(app)
      .get("/api/v1/events/bookings")
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.bookings.some((b) => b.external_id === "jest-bk-1")).toBe(true);
  });

  test("sync-from-api without credentials returns 400", async () => {
    const res = await request(app)
      .post("/api/v1/events/luma/sync-from-api")
      .set(auth.authHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  test("delete one event", async () => {
    await request(app)
      .post("/api/v1/events/luma/sync")
      .set(auth.authHeader)
      .send({
        prune: false,
        events: [{ api_id: "jest-evt-delete-me", name: "Temp" }],
      });

    const res = await request(app)
      .delete("/api/v1/events/luma/jest-evt-delete-me")
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
