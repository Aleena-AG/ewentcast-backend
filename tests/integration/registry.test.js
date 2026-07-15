const request = require("supertest");
const { createAuthedUser, cleanupUser, app, prisma } = require("../helpers/auth");

let auth;
let masterId;

beforeAll(async () => {
  auth = await createAuthedUser("registry");
});

afterAll(async () => {
  await cleanupUser(auth.email);
  await prisma.$disconnect();
});

describe("Registry API (auth)", () => {
  test("rejects without token", async () => {
    const res = await request(app).get("/api/v1/registry");
    expect(res.status).toBe(401);
  });

  test("create master event owned by token user", async () => {
    const res = await request(app)
      .post("/api/v1/registry")
      .set(auth.authHeader)
      .send({
        title: "Jest Master Event",
        capacity: 40,
        channelRefs: [
          {
            channel: "luma",
            eventId: "jest-reg-luma-1",
            url: "https://lu.ma/jest",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Jest Master Event");
    expect(String(res.body.data.userId)).toBe(auth.userId);
    masterId = res.body.data.id;
  });

  test("list only own master events", async () => {
    const res = await request(app).get("/api/v1/registry").set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.every((e) => String(e.userId) === auth.userId)).toBe(true);
    expect(res.body.data.some((e) => e.id === masterId)).toBe(true);
  });

  test("get master event by id", async () => {
    const res = await request(app)
      .get(`/api/v1/registry/${masterId}`)
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(masterId);
  });

  test("includes per-channel publishState from linked events", async () => {
    const now = new Date();
    await prisma.lumaEvent.upsert({
      where: {
        userId_externalId: {
          userId: BigInt(auth.userId),
          externalId: "jest-reg-luma-1",
        },
      },
      create: {
        userId: BigInt(auth.userId),
        externalId: "jest-reg-luma-1",
        title: "Jest Luma",
        status: "approved",
        payloadJson: {},
        syncedAt: now,
      },
      update: { status: "approved", syncedAt: now },
    });
    await prisma.eventbriteEvent.upsert({
      where: {
        userId_externalId: {
          userId: BigInt(auth.userId),
          externalId: "jest-reg-eb-draft",
        },
      },
      create: {
        userId: BigInt(auth.userId),
        externalId: "jest-reg-eb-draft",
        title: "Jest EB Draft",
        status: "draft",
        payloadJson: {},
        syncedAt: now,
      },
      update: { status: "draft", syncedAt: now },
    });

    const createRes = await request(app)
      .post("/api/v1/registry")
      .set(auth.authHeader)
      .send({
        title: "Multi Channel Status",
        capacity: 20,
        channelRefs: [
          { channel: "luma", eventId: "jest-reg-luma-1" },
          { channel: "eventbrite", eventId: "jest-reg-eb-draft" },
        ],
      });

    expect(createRes.status).toBe(201);
    const refs = createRes.body.data.channelRefs;
    const luma = refs.find((r) => r.channel === "luma");
    const eb = refs.find((r) => r.channel === "eventbrite");
    expect(luma.publishState).toBe("published");
    expect(luma.status).toBe("approved");
    expect(eb.publishState).toBe("draft");
    expect(eb.status).toBe("draft");

    const listRes = await request(app).get("/api/v1/registry").set(auth.authHeader);
    const listed = listRes.body.data.find((e) => e.id === createRes.body.data.id);
    expect(listed.channelRefs.find((r) => r.channel === "luma").publishState).toBe(
      "published"
    );
    expect(
      listed.channelRefs.find((r) => r.channel === "eventbrite").publishState
    ).toBe("draft");
  });

  test("list attendees", async () => {
    const res = await request(app)
      .get(`/api/v1/registry/${masterId}/attendees`)
      .set(auth.authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
