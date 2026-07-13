const request = require("supertest");
const { createAuthedUser, cleanupUser, app, prisma } = require("../helpers/auth");

let auth;

beforeAll(async () => {
  auth = await createAuthedUser("settings");
});

afterAll(async () => {
  await cleanupUser(auth.email);
  await prisma.$disconnect();
});

describe("Settings API (auth)", () => {
  test("rejects missing Bearer token", async () => {
    const res = await request(app).get("/api/v1/settings");
    expect(res.status).toBe(401);
  });

  test("rejects x-user-id without Bearer", async () => {
    const res = await request(app)
      .get("/api/v1/settings")
      .set("x-user-id", auth.userId);
    expect(res.status).toBe(401);
  });

  test("GET settings for token user", async () => {
    const res = await request(app)
      .get("/api/v1/settings")
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.luma).toBeDefined();
  });

  test("PUT settings saves for token user", async () => {
    const res = await request(app)
      .put("/api/v1/settings")
      .set(auth.authHeader)
      .send({
        luma: { apiKey: "luma_live_secretkey123" },
        hightribe: { webhookSecret: "whsec-test-123" },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.luma.configured).toBe(true);
    expect(res.body.data.luma.apiKey).toContain("*");
  });

  test("DELETE channel settings clears luma", async () => {
    const res = await request(app)
      .delete("/api/v1/settings/luma")
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.luma.configured).toBe(false);
  });
});
