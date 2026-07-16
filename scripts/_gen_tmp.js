/**
 * Regenerates postman/Ewentcast-API.postman_collection.json from scratch
 * covering every route in the Express API (post-merge).
 *
 * Usage:
 *   node scripts/generate-postman-collection.js
 *   node scripts/generate-postman-collection.js --push
 */
require("dotenv/config");
const fs = require("fs");
const path = require("path");

const COLLECTION_UID = "e0f287ad-1766-4deb-b622-ddfbf6597e8a";
const COLLECTION_API_UID = "17385817-e0f287ad-1766-4deb-b622-ddfbf6597e8a";
const OUT = path.join(__dirname, "..", "postman", "Ewentcast-API.postman_collection.json");

const saveAuthScript = [
  "const j = pm.response.json();",
  "if (pm.response.code === 200 || pm.response.code === 201) {",
  "  if (j.token) {",
  '    pm.collectionVariables.set("authToken", j.token);',
  '    console.log("authToken updated");',
  "  }",
  '  if (j.user && j.user.id) pm.collectionVariables.set("userId", String(j.user.id));',
  '  if (j.verifyToken) pm.collectionVariables.set("verifyToken", j.verifyToken);',
  '  if (j.resetToken) pm.collectionVariables.set("resetToken", j.resetToken);',
  "}",
];

/** Default assertions on every request (fixes Collection Runner "No tests found"). */
const defaultTests = [
  'pm.test("Response received", function () {',
  "  pm.expect(pm.response).to.exist;",
  "  pm.expect(pm.response.code).to.be.a(\"number\");",
  "});",
  "",
  'pm.test("Not a server error (status < 500)", function () {',
  "  pm.expect(pm.response.code).to.be.below(500);",
  "});",
  "",
  'pm.test("Response time under 60s", function () {',
  "  pm.expect(pm.response.responseTime).to.be.below(60000);",
  "});",
  "",
  'pm.test("Body is JSON object or array", function () {',
  "  const text = pm.response.text() || \"\";",
  "  if (!text.trim()) {",
  '    pm.expect.fail("Empty response body");',
  "    return;",
  "  }",
  "  let parsed;",
  "  try { parsed = pm.response.json(); } catch (e) {",
  '    pm.expect.fail("Response is not valid JSON");',
  "    return;",
  "  }",
  '  pm.expect(parsed === null || typeof parsed === "object").to.be.true;',
  "});",
];

/** Stricter check for endpoints that should succeed when auth + data are ready. */
function expectOkTests(codes = [200, 201]) {
  return [
    `pm.test("Status is one of ${codes.join("/")}", function () {`,
    `  pm.expect([${codes.join(", ")}]).to.include(pm.response.code);`,
    "});",
  ];
}

function url(rawPath, query = []) {
  const parts = rawPath.replace(/^\//, "").split("/");
  return {
    raw: `{{baseUrl}}${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}${
      query.length ? `?${query.map((q) => `${q.key}=${q.value}`).join("&")}` : ""
    }`,
    host: ["{{baseUrl}}"],
    path: parts,
    ...(query.length ? { query } : {}),
  };
}

function mergeTestEvents(extraLines = [], expectOk = null) {
  const lines = [...defaultTests];
  if (expectOk) {
    lines.push("", ...expectOkTests(Array.isArray(expectOk) ? expectOk : [200, 201]));
  }
  if (extraLines.length) {
    lines.push("", "// Request-specific hooks", ...extraLines);
  }
  return [
    {
      listen: "test",
      script: { type: "text/javascript", exec: lines },
    },
  ];
}

function req(name, method, rawPath, opts = {}) {
  const {
    body,
    description = "",
    auth = "inherit",
    headers = [],
    query = [],
    events = null,
    /** @type {number[]|false|null} strict status codes; false = only default tests */
    expectOk = false,
    /** extra test/script lines appended after defaults */
    extraTests = [],
  } = opts;

  const request = {
    method,
    header: [{ key: "Accept", value: "application/json" }, ...headers],
    url: url(rawPath, query),
    description,
  };

  if (auth === "noauth") {
    request.auth = { type: "noauth" };
  } else if (auth === "bearer") {
    request.auth = {
      type: "bearer",
      bearer: [{ key: "token", value: "{{authToken}}", type: "string" }],
    };
  }

  if (body != null) {
    request.header.push({ key: "Content-Type", value: "application/json" });
    request.body = {
      mode: "raw",
      raw: typeof body === "string" ? body : JSON.stringify(body, null, 2),
    };
  }

  // Always attach Tests so Collection Runner never shows "No tests found"
  let extraLines = [...extraTests];
  if (events) {
    for (const ev of events) {
      if (ev.listen === "test" && ev.script?.exec) {
        extraLines = extraLines.concat(ev.script.exec);
      }
    }
  }

  const item = {
    name,
    request,
    event: mergeTestEvents(extraLines, expectOk === false ? null : expectOk || [200, 201]),
  };
  return item;
}

function testScript(lines) {
  return [
    {
      listen: "test",
      script: { type: "text/javascript", exec: lines },
    },
  ];
}

function folder(name, description, items, folderAuth = null) {
  const f = { name, description, item: items };
  if (folderAuth === "noauth") f.auth = { type: "noauth" };
  return f;
}

function channelEventsFolder(channel, syncBody, bookingBody) {
  return folder(
    channel.charAt(0).toUpperCase() + channel.slice(1),
    `${channel}: list / get / sync (upsert) / sync-from-api / delete`,
    [
      req(`List ${channel} events`, "GET", `/api/v1/events/${channel}`, {
        expectOk: [200],
      }),
      req(`Get ${channel} event`, "GET", `/api/v1/events/${channel}/{{externalId}}`, {
        // sample id may 404 — still assert JSON + not 5xx
        expectOk: false,
      }),
      req(`Sync ${channel} events (create/update)`, "POST", `/api/v1/events/${channel}/sync`, {
        body: syncBody,
        expectOk: [200],
      }),
      req(`Sync ${channel} from API`, "POST", `/api/v1/events/${channel}/sync-from-api`, {
        body: {},
        expectOk: false, // needs connected credentials
      }),
      req(`Sync ${channel} bookings`, "POST", `/api/v1/events/${channel}/sync-bookings`, {
        body: bookingBody,
        expectOk: [200],
      }),
      req(`Delete ${channel} event`, "DELETE", `/api/v1/events/${channel}/{{externalId}}`, {
        expectOk: false,
      }),
      req(`Purge all ${channel} events`, "DELETE", `/api/v1/events/${channel}`, {
        expectOk: false, // destructive — skip in runner if needed
      }),
    ]
  );
}

const collection = {
  info: {
    _postman_id: COLLECTION_UID,
    name: "Ewentcast API",
    description:
      "Complete Ewentcast backend (post-merge).\n\n" +
      "Auth: Bearer {{authToken}} — Login/Register auto-save token.\n" +
      "Flow: Login → Connect Channels → Sync/Proxy → Dashboard / Registry / Billing.\n\n" +
      "Every request has Tests (pm.test) for Collection Runner. Soft checks: response + JSON + not 5xx. " +
      "Key happy-path requests also assert 200/201.\n\n" +
      "Tip: Run Auth > Login first. Skip Purge / Delete / Refund in runner if you do not want side effects.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  event: [
    {
      listen: "prerequest",
      script: {
        type: "text/javascript",
        exec: [
          "// Ensure Accept header is present",
          "if (!pm.request.headers.has('Accept')) {",
          "  pm.request.headers.add({ key: 'Accept', value: 'application/json' });",
          "}",
        ],
      },
    },
  ],
  auth: {
    type: "bearer",
    bearer: [{ key: "token", value: "{{authToken}}", type: "string" }],
  },
  variable: [
    { key: "baseUrl", value: "http://api.ewentcast.test" },
    { key: "authToken", value: "" },
    { key: "userId", value: "1" },
    { key: "channel", value: "luma" },
    { key: "externalId", value: "evt-sample-001" },
    { key: "masterId", value: "" },
    { key: "orgId", value: "" },
    { key: "lumaEventId", value: "evt-sample-001" },
    { key: "ticketTypeId", value: "" },
    { key: "sessionId", value: "" },
    { key: "webhookLogToken", value: "change-me" },
    { key: "resetToken", value: "" },
    { key: "verifyToken", value: "" },
    { key: "authEmail", value: "demo@ewentcast.test" },
    { key: "authPassword", value: "Password123!" },
  ],
  item: [
    folder("Health", "Public health check", [
      req("Root", "GET", "/", { auth: "noauth", expectOk: [200] }),
      req("Health Check", "GET", "/api/v1/health", { auth: "noauth", expectOk: [200] }),
    ], "noauth"),

    folder(
      "Auth",
      "Register / login / me / password / verify. Login + Register save {{authToken}}.",
      [
        req("Register", "POST", "/api/v1/auth/register", {
          auth: "noauth",
          expectOk: [200, 201],
          body: {
            name: "Demo User",
            email: "{{authEmail}}",
            password: "{{authPassword}}",
          },
          events: testScript(saveAuthScript),
        }),
        req("Login", "POST", "/api/v1/auth/login", {
          auth: "noauth",
          expectOk: [200],
          body: { email: "{{authEmail}}", password: "{{authPassword}}" },
          events: testScript(saveAuthScript),
        }),
        req("Me", "GET", "/api/v1/auth/me", { expectOk: [200] }),
        req("Logout", "POST", "/api/v1/auth/logout", { expectOk: [200] }),
        req("Forgot Password", "POST", "/api/v1/auth/forgot-password", {
          auth: "noauth",
          body: { email: "{{authEmail}}" },
          events: testScript([
            "if (pm.response.code === 200) {",
            "  const j = pm.response.json();",
            '  if (j.resetToken) pm.collectionVariables.set("resetToken", j.resetToken);',
            "}",
          ]),
        }),
        req("Reset Password", "POST", "/api/v1/auth/reset-password", {
          auth: "noauth",
          body: { token: "{{resetToken}}", password: "{{authPassword}}" },
        }),
        req("Resend Verification Email", "POST", "/api/v1/auth/resend-verification", {
          auth: "noauth",
          body: { email: "{{authEmail}}" },
          events: testScript([
            "if (pm.response.code === 200) {",
            "  const j = pm.response.json();",
            '  if (j.verifyToken) pm.collectionVariables.set("verifyToken", j.verifyToken);',
            "}",
          ]),
        }),
        req("Verify Email (POST)", "POST", "/api/v1/auth/verify-email", {
          auth: "noauth",
          body: { token: "{{verifyToken}}" },
        }),
        req("Verify Email (GET link)", "GET", "/api/v1/auth/verify-email", {
          auth: "noauth",
          query: [{ key: "token", value: "{{verifyToken}}" }],
        }),
      ],
      "noauth"
    ),

    folder("Users", "Authenticated user profile", [
      req("List me (users)", "GET", "/api/v1/users"),
      req("Get user by id", "GET", "/api/v1/users/{{userId}}"),
    ]),

    folder("Dashboard", "Overview KPIs", [
      req("Get dashboard stats", "GET", "/api/v1/dashboard/stats", {
        expectOk: [200],
        description:
          "Per-channel events/bookings/tickets/revenue, totals, unifiedAttendees, recent, recentBookings, bookingTrend.",
      }),
    ]),

    folder(
      "Connect Channels (Settings)",
      "Connect / update / disconnect channel credentials (PUT /settings).",
      [
        req("Get settings (masked)", "GET", "/api/v1/settings"),
        req("Get settings (full)", "GET", "/api/v1/settings", {
          query: [{ key: "full", value: "1" }],
        }),
        req("Connect / update Luma", "PUT", "/api/v1/settings", {
          body: {
            luma: {
              apiKey: "YOUR_LUMA_API_KEY",
              calendarId: "cal-xxxxx",
              apiBaseUrl: "https://public-api.luma.com",
              discoverBaseUrl: "https://api.lu.ma",
            },
          },
        }),
        req("Connect / update Eventbrite", "PUT", "/api/v1/settings", {
          body: {
            eventbrite: {
              clientId: "YOUR_EB_CLIENT_ID",
              clientSecret: "YOUR_EB_CLIENT_SECRET",
              redirectUri: "{{baseUrl}}/api/v1/eventbrite/callback",
              privateToken: "YOUR_EB_PRIVATE_TOKEN",
              publicToken: "",
            },
          },
        }),
        req("Connect / update Hightribe", "PUT", "/api/v1/settings", {
          body: {
            hightribe: {
              serviceUrl: "https://api.hightribe.com",
              apiKey: "YOUR_HT_API_KEY",
              webhookSecret: "YOUR_HT_WEBHOOK_SECRET",
              email: "you@example.com",
            },
          },
        }),
        req("Disconnect Luma", "DELETE", "/api/v1/settings/luma"),
        req("Disconnect Eventbrite", "DELETE", "/api/v1/settings/eventbrite"),
        req("Disconnect Hightribe", "DELETE", "/api/v1/settings/hightribe"),
      ]
    ),

    folder(
      "Events",
      "Cached channel events/bookings. Sync upsert = create/update. sync-all pulls all channels.",
      [
        req("List all bookings", "GET", "/api/v1/events/bookings"),
        req("Sync all channels from API", "POST", "/api/v1/events/sync-all", {
          description: "Pull luma + eventbrite + hightribe from live APIs into DB.",
          body: {},
        }),
        req("List events ({{channel}})", "GET", "/api/v1/events/{{channel}}"),
        req("Get event ({{channel}})", "GET", "/api/v1/events/{{channel}}/{{externalId}}"),
        channelEventsFolder(
          "luma",
          {
            prune: true,
            events: [
              {
                api_id: "evt-sample-001",
                name: "Sunset Yoga on the Beach",
                start_at: "2026-08-01T17:00:00.000Z",
                end_at: "2026-08-01T18:30:00.000Z",
                timezone: "America/Los_Angeles",
                url: "https://lu.ma/sunset-yoga",
                status: "approved",
              },
            ],
          },
          {
            bookings: [
              {
                id: "luma-guest-001",
                email: "alice@example.com",
                name: "Alice Khan",
                event_external_id: "evt-sample-001",
                event_title: "Sunset Yoga on the Beach",
                registered_at: "2026-07-01T10:15:00.000Z",
                status: "approved",
                ticket_count: 1,
              },
            ],
          }
        ),
        channelEventsFolder(
          "eventbrite",
          {
            prune: false,
            events: [
              {
                id: "12345678901",
                name: { text: "Tech Conference 2026" },
                start: { utc: "2026-09-15T14:00:00Z" },
                end: { utc: "2026-09-15T22:00:00Z" },
                url: "https://www.eventbrite.com/e/tech-conference-12345678901",
                is_free: false,
                status: "live",
              },
            ],
          },
          {
            bookings: [
              {
                id: "eb-attendee-555",
                email: "carol@example.com",
                name: "Carol Ahmed",
                event_external_id: "12345678901",
                event_title: "Tech Conference 2026",
                registered_at: "2026-07-05T12:00:00.000Z",
                status: "Attending",
                ticket_count: 1,
              },
            ],
          }
        ),
        channelEventsFolder(
          "hightribe",
          {
            prune: false,
            events: [
              {
                id: "ht-evt-100",
                title: "Desert Retreat Weekend",
                dates: {
                  starts_at: "2026-10-01T09:00:00.000Z",
                  ends_at: "2026-10-03T18:00:00.000Z",
                },
                timezone: "Asia/Dubai",
                url: "https://hightribe.com/events/desert-retreat",
                location: "Al Ain Oasis",
                publish_status: "published",
              },
            ],
          },
          {
            bookings: [
              {
                id: "ht-booking-77",
                email: "dana@example.com",
                name: "Dana Raza",
                event_external_id: "ht-evt-100",
                event_title: "Desert Retreat Weekend",
                registered_at: "2026-07-08T09:30:00.000Z",
                status: "confirmed",
                ticket_count: 2,
              },
            ],
          }
        ),
      ]
    ),

    folder(
      "Registry",
      "Master events CRUD + channel links + attendees. channelRefs include status + publishState.",
      [
        req("List master events", "GET", "/api/v1/registry", {
          events: testScript([
            "if (pm.response.code === 200) {",
            "  const j = pm.response.json();",
            "  if (j.data && j.data[0] && j.data[0].id) {",
            '    pm.collectionVariables.set("masterId", j.data[0].id);',
            "  }",
            "}",
          ]),
        }),
        req("Find master by channel event", "GET", "/api/v1/registry", {
          description: "Lookup: ?channel=&eventId= → { master, links }",
          query: [
            { key: "channel", value: "{{channel}}" },
            { key: "eventId", value: "{{externalId}}" },
          ],
        }),
        req("Create master event", "POST", "/api/v1/registry", {
          body: {
            title: "Sunset Yoga on the Beach",
            capacity: 50,
            category: "wellness",
            timezone: "America/Los_Angeles",
            description: "Morning yoga on the sand.",
            format: "in_person",
            startAt: "2026-08-01T17:00:00.000Z",
            endAt: "2026-08-01T18:30:00.000Z",
            location: { city: "Santa Monica", country: "US", venue: "Beach" },
            details: { coverUrl: "https://images.example.com/yoga.jpg", tickets: [] },
            channelRefs: [
              {
                channel: "luma",
                eventId: "evt-sample-001",
                ticketId: "ticket-type-abc",
                url: "https://lu.ma/sunset-yoga",
              },
            ],
          },
          events: testScript([
            "if (pm.response.code === 201) {",
            "  const j = pm.response.json();",
            '  if (j.data && j.data.id) pm.collectionVariables.set("masterId", j.data.id);',
            "}",
          ]),
        }),
        req("Get master event", "GET", "/api/v1/registry/{{masterId}}"),
        req("Update master event (PATCH)", "PATCH", "/api/v1/registry/{{masterId}}", {
          body: {
            title: "Sunset Yoga (Updated)",
            capacity: 60,
            description: "Updated description",
          },
        }),
        req("Update master event (PUT)", "PUT", "/api/v1/registry/{{masterId}}", {
          body: {
            title: "Sunset Yoga (Updated)",
            capacity: 60,
            channelRefs: [
              { channel: "luma", eventId: "evt-sample-001", url: "https://lu.ma/sunset-yoga" },
              {
                channel: "eventbrite",
                eventId: "12345678901",
                url: "https://www.eventbrite.com/e/tech-conference-12345678901",
              },
            ],
          },
        }),
        req("Delete master event", "DELETE", "/api/v1/registry/{{masterId}}"),
        req("List attendees", "GET", "/api/v1/registry/{{masterId}}/attendees"),
        req("Create attendee", "POST", "/api/v1/registry/{{masterId}}/attendees", {
          body: {
            email: "guest@example.com",
            name: "Guest User",
            source: "luma",
            registeredAt: "2026-07-10T12:00:00.000Z",
          },
        }),
        req("Create attendee by channel", "POST", "/api/v1/registry/attendees/by-channel", {
          body: {
            channel: "luma",
            eventId: "{{externalId}}",
            email: "bychannel@example.com",
            name: "By Channel Guest",
          },
        }),
        req("Link channel", "POST", "/api/v1/registry/{{masterId}}/channels", {
          body: {
            channel: "hightribe",
            eventId: "ht-evt-100",
            url: "https://hightribe.com/events/desert-retreat",
          },
        }),
        req("Unlink channel", "DELETE", "/api/v1/registry/{{masterId}}/channels/{{channel}}"),
      ]
    ),

    folder(
      "Luma Proxy",
      "Live Luma API via connected credentials. Requires Connect Luma first.",
      [
        req("Get Luma event", "GET", "/api/v1/luma/events", {
          query: [{ key: "api_id", value: "{{lumaEventId}}" }],
        }),
        req("List Luma guests", "GET", "/api/v1/luma/guests", {
          query: [{ key: "event_id", value: "{{lumaEventId}}" }],
        }),
        req("Create Luma event", "POST", "/api/v1/luma/events", {
          body: {
            name: "Postman Luma Event",
            start_at: "2026-09-01T18:00:00.000Z",
            timezone: "America/Los_Angeles",
          },
        }),
        req("Create image upload URL", "POST", "/api/v1/luma/images/upload-url", {
          body: { content_type: "image/jpeg" },
        }),
        req("List ticket types", "GET", "/api/v1/luma/ticket-types", {
          query: [{ key: "event_id", value: "{{lumaEventId}}" }],
        }),
        req("Create ticket type", "POST", "/api/v1/luma/ticket-types", {
          body: {
            event_id: "{{lumaEventId}}",
            name: "General Admission",
            cents: 0,
            currency: "USD",
          },
        }),
        req("Update ticket type", "PUT", "/api/v1/luma/ticket-types", {
          body: {
            event_ticket_type_id: "{{ticketTypeId}}",
            name: "General Admission (Updated)",
          },
        }),
        req("Apply event tag", "POST", "/api/v1/luma/calendars/event-tags/apply", {
          body: { tag: "featured", event_ids: ["{{lumaEventId}}"] },
        }),
      ]
    ),

    folder(
      "Hightribe Proxy",
      "Live Hightribe API. Login saves token into settings.",
      [
        req("Login Hightribe", "POST", "/api/v1/hightribe/login", {
          body: {
            email: "you@example.com",
            password: "YOUR_HT_PASSWORD",
            serviceUrl: "https://api.hightribe.com",
          },
        }),
        req("List Hightribe events", "GET", "/api/v1/hightribe/events", {
          query: [
            { key: "page", value: "1" },
            { key: "per_page", value: "50" },
          ],
        }),
        req("List Hightribe bookings", "GET", "/api/v1/hightribe/events/bookings", {
          query: [
            { key: "page", value: "1" },
            { key: "per_page", value: "50" },
          ],
        }),
        req("Create Hightribe event", "POST", "/api/v1/hightribe/events", {
          description: "JSON body. Also accepts multipart for cover images.",
          body: {
            title: "Postman HT Event",
            dates: {
              starts_at: "2026-10-01T09:00:00.000Z",
              ends_at: "2026-10-01T12:00:00.000Z",
            },
            timezone: "Asia/Dubai",
            location: "Dubai",
          },
        }),
        req("Create Hightribe event with tickets", "POST", "/api/v1/hightribe/events/with-tickets", {
          body: {
            title: "Postman HT Event + Tickets",
            dates: {
              starts_at: "2026-10-05T09:00:00.000Z",
              ends_at: "2026-10-05T17:00:00.000Z",
            },
            tickets: [{ name: "GA", price: 20, currency: "USD", quantity: 100 }],
          },
        }),
      ]
    ),

    folder(
      "Eventbrite Proxy",
      "Live Eventbrite v3 via privateToken. Catch-all proxies any EB path.",
      [
        req("List organizations", "GET", "/api/v1/eventbrite/organizations", {
          events: testScript([
            "if (pm.response.code === 200) {",
            "  const j = pm.response.json();",
            "  const orgs = j.data?.organizations || j.organizations || [];",
            "  if (orgs[0] && orgs[0].id) {",
            '    pm.collectionVariables.set("orgId", String(orgs[0].id));',
            "  }",
            "}",
          ]),
        }),
        req("Create organization event", "POST", "/api/v1/eventbrite/organizations/{{orgId}}/events", {
          body: {
            event: {
              name: { html: "Postman EB Event" },
              start: {
                timezone: "America/Los_Angeles",
                utc: "2026-11-01T18:00:00Z",
              },
              end: {
                timezone: "America/Los_Angeles",
                utc: "2026-11-01T21:00:00Z",
              },
              currency: "USD",
            },
          },
        }),
        req("Proxy: get event", "GET", "/api/v1/eventbrite/events/{{externalId}}/", {
          description: "Catch-all proxy → Eventbrite GET /v3/events/:id/",
        }),
        req("Proxy: publish event", "POST", "/api/v1/eventbrite/events/{{externalId}}/publish/", {
          description: "Catch-all proxy → Eventbrite publish",
          body: {},
        }),
        req("Proxy: ticket classes", "GET", "/api/v1/eventbrite/events/{{externalId}}/ticket_classes/", {
          description: "Catch-all proxy → ticket_classes",
        }),
      ]
    ),

    folder(
      "Billing",
      "Stripe checkout / portal / transactions / refund. Stripe webhook uses raw body + signature.",
      [
        req("Create checkout session", "POST", "/api/v1/billing/checkout", {
          body: {
            success_url: "{{baseUrl}}/billing/success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url: "{{baseUrl}}/billing/cancel",
          },
          events: testScript([
            "if (pm.response.code === 200) {",
            "  const j = pm.response.json();",
            '  if (j.session_id) pm.collectionVariables.set("sessionId", j.session_id);',
            "}",
          ]),
        }),
        req("Confirm checkout", "POST", "/api/v1/billing/confirm", {
          body: { session_id: "{{sessionId}}" },
        }),
        req("Customer portal", "POST", "/api/v1/billing/portal", {
          body: { return_url: "{{baseUrl}}/billing" },
        }),
        req("List transactions", "GET", "/api/v1/billing/transactions"),
        req("Refund eligibility", "GET", "/api/v1/billing/refund"),
        req("Request refund", "POST", "/api/v1/billing/refund", { body: {} }),
        req("Stripe webhook", "POST", "/api/v1/webhooks/stripe", {
          auth: "noauth",
          description:
            "Requires raw body + stripe-signature header. Use Stripe CLI for real tests.",
          headers: [{ key: "stripe-signature", value: "t=…,v1=…" }],
          body: { type: "checkout.session.completed", data: { object: {} } },
        }),
      ]
    ),

    folder("Webhooks", "Inbound channel webhooks + setup + logs", [
      req("Get webhook setup", "GET", "/api/v1/webhooks/setup"),
      req("Register webhooks (Luma + Eventbrite)", "POST", "/api/v1/webhooks/setup", {
        body: {},
      }),
      req("List webhook logs", "GET", "/api/v1/webhooks/logs", {
        auth: "noauth",
        headers: [{ key: "x-webhook-log-token", value: "{{webhookLogToken}}" }],
        query: [{ key: "limit", value: "50" }],
      }),
      req("Luma inbound", "POST", "/api/v1/webhooks/luma", {
        auth: "noauth",
        body: {
          type: "guest.registered",
          guest: {
            api_id: "gst-abc123",
            event_api_id: "evt-sample-001",
            email: "webhook.guest@example.com",
            name: "Webhook Guest",
            approval_status: "approved",
            registered_at: "2026-07-10T12:00:00.000Z",
          },
        },
      }),
      req("Eventbrite inbound", "POST", "/api/v1/webhooks/eventbrite", {
        auth: "noauth",
        body: {
          config: { action: "attendee.updated" },
          api_url: "https://www.eventbriteapi.com/v3/events/12345678901/attendees/999/",
          attendee: {
            id: "999",
            event_id: "12345678901",
            status: "Attending",
            profile: {
              name: "EB Webhook User",
              email: "eb.webhook@example.com",
            },
          },
        },
      }),
      req("Hightribe inbound", "POST", "/api/v1/webhooks/hightribe", {
        auth: "noauth",
        headers: [{ key: "X-Webhook-Secret", value: "YOUR_HT_WEBHOOK_SECRET" }],
        body: {
          event_id: "ht-evt-100",
          email: "ht.webhook@example.com",
          name: "HT Webhook Guest",
          booking_id: "ht-bk-501",
          registered_at: "2026-07-10T14:30:00.000Z",
          status: "confirmed",
        },
      }),
      req("Hightribe webhook docs", "GET", "/api/v1/webhooks/hightribe", {
        auth: "noauth",
      }),
    ]),
  ],
};

fs.writeFileSync(OUT, JSON.stringify(collection, null, 2));

function countRequests(items) {
  let n = 0;
  for (const it of items) {
    if (it.item) n += countRequests(it.item);
    else if (it.request) n += 1;
  }
  return n;
}

const folders = collection.item.map((f) => f.name);
const total = countRequests(collection.item);
console.log("Wrote", OUT);
console.log("Folders:", folders.join(" | "));
console.log("Requests:", total);

async function push() {
  const apiKey = process.env.POSTMAN_API_KEY;
  if (!apiKey) {
    console.error("POSTMAN_API_KEY missing — skip cloud push");
    process.exit(1);
  }
  const body = JSON.parse(JSON.stringify(collection));
  body.info._postman_id = COLLECTION_UID;
  body.info.name = "Ewentcast API";

  const put = await fetch(`https://api.getpostman.com/collections/${COLLECTION_API_UID}`, {
    method: "PUT",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ collection: body }),
  });
  console.log("Postman PUT", put.status);
  if (!put.ok) {
    console.error(await put.text());
    process.exit(1);
  }

  const get = await fetch(`https://api.getpostman.com/collections/${COLLECTION_API_UID}`, {
    headers: { "X-Api-Key": apiKey },
  });
  const data = await get.json();
  const names = (data.collection?.item || []).map((i) => i.name);
  console.log("Cloud folders:", names.join(" | "));
  console.log("Cloud requests:", countRequests(data.collection?.item || []));
}

if (process.argv.includes("--push")) {
  push().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.log("Local only. Re-run with --push to update Postman cloud.");
}
