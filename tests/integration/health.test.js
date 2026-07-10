const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/db");

describe("Health API", () => {
  test("GET /api/v1/health returns ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "API is running",
    });
  });

  test("unknown route returns 404", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
