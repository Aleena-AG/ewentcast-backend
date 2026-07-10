const {
  parseChannel,
  normalizeEvent,
  normalizeBooking,
} = require("../../src/services/channels/helpers");

describe("parseChannel", () => {
  test("accepts luma, eventbrite, hightribe", () => {
    expect(parseChannel("luma")).toBe("luma");
    expect(parseChannel("eventbrite")).toBe("eventbrite");
    expect(parseChannel("hightribe")).toBe("hightribe");
  });

  test("rejects invalid channel", () => {
    expect(parseChannel("facebook")).toBeNull();
    expect(parseChannel("")).toBeNull();
  });
});

describe("normalizeEvent", () => {
  test("normalizes luma flat payload", () => {
    const n = normalizeEvent("luma", {
      api_id: "evt-1",
      name: "Yoga",
      start_at: "2026-08-01T17:00:00.000Z",
      timezone: "UTC",
      status: "approved",
    });
    expect(n.externalId).toBe("evt-1");
    expect(n.title).toBe("Yoga");
    expect(n.startAt).toBeInstanceOf(Date);
    expect(n.status).toBe("approved");
  });

  test("normalizes luma nested event payload", () => {
    const n = normalizeEvent("luma", {
      event: { api_id: "evt-2", name: "Meetup" },
    });
    expect(n.externalId).toBe("evt-2");
    expect(n.title).toBe("Meetup");
  });

  test("normalizes eventbrite payload", () => {
    const n = normalizeEvent("eventbrite", {
      id: "12345",
      name: { text: "Tech Conf" },
      start: { utc: "2026-09-15T14:00:00Z" },
      end: { utc: "2026-09-15T22:00:00Z" },
      is_free: true,
      status: "live",
      logo: { original: { url: "https://img.example/cover.jpg" } },
    });
    expect(n.externalId).toBe("12345");
    expect(n.title).toBe("Tech Conf");
    expect(n.isFree).toBe(true);
    expect(n.coverUrl).toBe("https://img.example/cover.jpg");
  });

  test("normalizes hightribe payload with dates object", () => {
    const n = normalizeEvent("hightribe", {
      id: "ht-10",
      title: "Retreat",
      dates: {
        starts_at: "2026-10-01T09:00:00.000Z",
        ends_at: "2026-10-03T18:00:00.000Z",
      },
      location: "Dubai",
      publish_status: "published",
    });
    expect(n.externalId).toBe("ht-10");
    expect(n.title).toBe("Retreat");
    expect(n.location).toBe("Dubai");
    expect(n.status).toBe("published");
    expect(n.startAt).toBeInstanceOf(Date);
  });
});

describe("normalizeBooking", () => {
  test("normalizes valid booking", () => {
    const n = normalizeBooking({
      id: "bk-1",
      email: "Alice@Example.com",
      name: "Alice",
      event_external_id: "evt-1",
      event_title: "Yoga",
      registered_at: "2026-07-01T10:00:00.000Z",
      ticket_count: 2,
    });
    expect(n).not.toBeNull();
    expect(n.externalId).toBe("bk-1");
    expect(n.guestEmail).toBe("alice@example.com");
    expect(n.guestName).toBe("Alice");
    expect(n.ticketCount).toBe(2);
  });

  test("returns null without id or email", () => {
    expect(normalizeBooking({ email: "a@b.com" })).toBeNull();
    expect(normalizeBooking({ id: "x" })).toBeNull();
  });
});
