const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/db");

const TEST_EMAIL = "jest-settings@ewentcast.test";
let userId;

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: {
      email: TEST_EMAIL,
      name: "Jest Settings User",
      passwordHash: "test-hash",
    },
    update: { name: "Jest Settings User" },
  });
  userId = user.id.toString();
});

afterAll(async () => {
  await prisma.userSettings.deleteMany({ where: { userId: BigInt(userId) } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("Settings API", () => {
  test("rejects missing x-user-id", async () => {
    const res = await request(app).get("/api/v1/settings");
    expect(res.status).toBe(401);
  });

  test("GET settings returns defaults", async () => {
    const res = await request(app)
      .get("/api/v1/settings")
      .set("x-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.luma).toBeDefined();
    expect(res.body.data.eventbrite).toBeDefined();
    expect(res.body.data.hightribe).toBeDefined();
  });

  test("PUT settings saves and masks secrets", async () => {
    const res = await request(app)
      .put("/api/v1/settings")
      .set("x-user-id", userId)
      .send({
        luma: { apiKey: "luma_live_secretkey123" },
        hightribe: { webhookSecret: "whsec-test-123" },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.luma.configured).toBe(true);
    expect(res.body.data.luma.apiKey).toContain("*");
    expect(res.body.data.luma.apiKey).not.toBe("luma_live_secretkey123");
  });

  test("DELETE channel settings clears luma", async () => {
    const res = await request(app)
      .delete("/api/v1/settings/luma")
      .set("x-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.body.data.luma.configured).toBe(false);
  });
});
