const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/config/db");

const TEST_EMAIL = "jest-registry@ewentcast.test";
let userId;
let masterId;

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: {
      email: TEST_EMAIL,
      name: "Jest Registry User",
      passwordHash: "test-hash",
    },
    update: { name: "Jest Registry User" },
  });
  userId = user.id.toString();
});

afterAll(async () => {
  if (masterId) {
    await prisma.attendee.deleteMany({ where: { masterId } });
    await prisma.channelRef.deleteMany({ where: { masterId } });
    await prisma.masterEvent.deleteMany({ where: { id: masterId } });
  }
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("Registry API", () => {
  test("create master event with channel refs", async () => {
    const res = await request(app)
      .post("/api/v1/registry")
      .send({
        title: "Jest Master Event",
        capacity: 40,
        userId,
        channelRefs: [
          {
            channel: "luma",
            eventId: "jest-reg-luma-1",
            url: "https://lu.ma/jest",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Jest Master Event");
    expect(res.body.data.channelRefs.length).toBe(1);
    masterId = res.body.data.id;
  });

  test("list master events includes created one", async () => {
    const res = await request(app).get("/api/v1/registry");
    expect(res.status).toBe(200);
    expect(res.body.data.some((e) => e.id === masterId)).toBe(true);
  });

  test("get master event by id", async () => {
    const res = await request(app).get(`/api/v1/registry/${masterId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(masterId);
  });

  test("list attendees starts empty", async () => {
    const res = await request(app).get(`/api/v1/registry/${masterId}/attendees`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
