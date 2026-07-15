/**
 * Regenerates postman/Ewentcast-API.postman_collection.json from scratch
 * covering every route in the Express API.
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

function req(name, method, rawPath, opts = {}) {
  const {
    body,
    description = "",
    auth = "inherit", // inherit | noauth | bearer
    headers = [],
    query = [],
    events = null,
  } = opts;

  const request = {
    method,
    header: [
      { key: "Accept", value: "application/json" },
      ...headers,
    ],
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
  // inherit = omit request.auth

  if (body != null) {
    request.header.push({ key: "Content-Type", value: "application/json" });
    request.body = {
      mode: "raw",
      raw: typeof body === "string" ? body : JSON.stringify(body, null, 2),
    };
  }

  const item = { name, request };
  if (events) item.event = events;
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
    `${channel} events: list / get / sync (create|update upsert) / sync-from-api / delete`,
    [
      req(`List ${channel} events`, "GET", `/api/v1/events/${channel}`, {
        description: "List stored events for this channel (current user).",
      }),
      req(`Get ${channel} event`, "GET", `/api/v1/events/${channel}/{{externalId}}`, {
        description: "Get one stored event by externalId.",
      }),
      req(`Sync ${channel} events (create/update)`, "POST", `/api/v1/events/${channel}/sync`, {
        description:
          "Upsert events into DB (acts as create + edit). Set prune=true to remove missing ones.",
        body: syncBody,
      }),
      req(`Sync ${channel} from API`, "POST", `/api/v1/events/${channel}/sync-from-api`, {
        description:
          "Pull events (and bookings where supported) from the live channel API using Connect Channel credentials.",
        body: {},
      }),
      req(`Sync ${channel} bookings`, "POST", `/api/v1/events/${channel}/sync-bookings`, {
        description: "Upsert bookings for this channel.",
        body: bookingBody,
      }),
      req(`Delete ${channel} event`, "DELETE", `/api/v1/events/${channel}/{{externalId}}`, {
        description: "Delete one stored event by externalId.",
      }),
      req(`Purge all ${channel} events`, "DELETE", `/api/v1/events/${channel}`, {
        description: "Delete all events + bookings + registry links for this channel.",
      }),
    ]
  );
}

const collection = {
  info: {
    _postman_id: COLLECTION_UID,
    name: "Ewentcast API",
    description:
      "Complete Ewentcast backend collection (all routes).\n\n" +
      "Auth: Collection uses Bearer {{authToken}}. Login/Register auto-save the token.\n" +
      "Flow: Auth → Login → Connect Channels (Settings) → Events sync-from-api → Registry / Bookings.\n\n" +
      "Note: There is no /dashboard route. Channel connect = PUT /settings. " +
      "Events have no separate create/edit REST — use Sync (upsert) or Sync from API.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
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
    { key: "webhookLogToken", value: "change-me" },
    { key: "resetToken", value: "" },
    { key: "verifyToken", value: "" },
    { key: "authEmail", value: "demo@ewentcast.test" },
    { key: "authPassword", value: "Password123!" },
  ],
  item: [
    folder("Health", "Public health check", [
      req("Root", "GET", "/", {
        auth: "noauth",
        description: "API root message.",
      }),
      req("Health Check", "GET", "/api/v1/health", {
        auth: "noauth",
        description: "Liveness probe.",
      }),
    ], "noauth"),

    folder(
      "Auth",
      "Register / login / me / password / verify. Login + Register save {{authToken}}.",
      [
        req("Register", "POST", "/api/v1/auth/register", {
          auth: "noauth",
          description: "Creates user + trial + session. Saves authToken.",
          body: {
            name: "Demo User",
            email: "{{authEmail}}",
            password: "{{authPassword}}",
          },
          events: testScript(saveAuthScript),
        }),
        req("Login", "POST", "/api/v1/auth/login", {
          auth: "noauth",
          description: "Login and auto-save Bearer {{authToken}}.",
          body: {
            email: "{{authEmail}}",
            password: "{{authPassword}}",
          },
          events: testScript(saveAuthScript),
        }),
        req("Me", "GET", "/api/v1/auth/me", {
          description: "Current user + subscription (requires Login first).",
        }),
        req("Logout", "POST", "/api/v1/auth/logout", {
          description: "Invalidate current session token.",
        }),
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

    folder("Users", "Authenticated user profile endpoints", [
      req("List me (users)", "GET", "/api/v1/users", {
        description: "Returns array with the authenticated user only.",
      }),
      req("Get user by id", "GET", "/api/v1/users/{{userId}}", {
        description: "Own profile (+ subscription, settings). 403 if id ≠ self.",
      }),
    ]),

    folder(
      "Dashboard",
      "Overview KPIs — ported from eventlifter-core GET /api/dashboard/stats.",
      [
        req("Get dashboard stats", "GET", "/api/v1/dashboard/stats", {
          description:
            "Per-channel events/bookings/tickets/revenue, totals, unifiedAttendees, recent events (60), recent bookings (8), 7-day bookingTrend. Requires Bearer token. Also use Connect Channels (Settings) + Registry for full Overview UI.",
        }),
      ]
    ),

    folder(
      "Connect Channels (Settings)",
      "Connect / update / disconnect channel credentials. This is the connect-channel surface (PUT /settings).",
      [
        req("Get settings (masked)", "GET", "/api/v1/settings", {
          description: "Channel credentials with secrets masked + configured flags.",
        }),
        req("Get settings (full)", "GET", "/api/v1/settings", {
          description: "Unmasked stored JSON. Use carefully.",
          query: [{ key: "full", value: "1" }],
        }),
        req("Connect / update Luma", "PUT", "/api/v1/settings", {
          description: "Save Luma API key + calendarId (partial merge).",
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
          description:
            "Save Eventbrite OAuth app + private token. OAuth callback route is not implemented yet; privateToken is used for API sync.",
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
          description: "Save Hightribe service URL + API key + webhook secret.",
          body: {
            hightribe: {
              serviceUrl: "https://api.hightribe.com",
              apiKey: "YOUR_HT_API_KEY",
              webhookSecret: "YOUR_HT_WEBHOOK_SECRET",
            },
          },
        }),
        req("Disconnect Luma", "DELETE", "/api/v1/settings/luma", {
          description: "Reset Luma settings to defaults.",
        }),
        req("Disconnect Eventbrite", "DELETE", "/api/v1/settings/eventbrite", {
          description: "Reset Eventbrite settings to defaults.",
        }),
        req("Disconnect Hightribe", "DELETE", "/api/v1/settings/hightribe", {
          description: "Reset Hightribe settings to defaults.",
        }),
      ]
    ),

    folder(
      "Events",
      "Per-channel events. Create/edit = Sync upsert or Sync-from-API. Get/list/delete included. channel = luma | eventbrite | hightribe.",
      [
        req("List all bookings", "GET", "/api/v1/events/bookings", {
          description: "All channel bookings for the authenticated user.",
        }),
        req("List events ({{channel}})", "GET", "/api/v1/events/{{channel}}", {
          description: "Generic list using {{channel}} variable.",
        }),
        req("Get event ({{channel}})", "GET", "/api/v1/events/{{channel}}/{{externalId}}", {
          description: "Generic get using {{channel}} + {{externalId}}.",
        }),
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
                cover_url: "https://images.example.com/yoga.jpg",
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
      "Master events linking channel events. List/get include per-channel status + publishState.",
      [
        req("List master events", "GET", "/api/v1/registry", {
          description:
            "List master events for token user. Each channelRef has status + publishState (published|draft).",
          events: testScript([
            "if (pm.response.code === 200) {",
            "  const j = pm.response.json();",
            "  if (j.data && j.data[0] && j.data[0].id) {",
            '    pm.collectionVariables.set("masterId", j.data[0].id);',
            "  }",
            "}",
          ]),
        }),
        req("Create master event", "POST", "/api/v1/registry", {
          description: "Create master event with optional channelRefs.",
          body: {
            title: "Sunset Yoga on the Beach",
            capacity: 50,
            channelRefs: [
              {
                channel: "luma",
                eventId: "evt-sample-001",
                ticketId: "ticket-type-abc",
                url: "https://lu.ma/sunset-yoga",
              },
              {
                channel: "eventbrite",
                eventId: "12345678901",
                ticketId: "tc_111",
                url: "https://www.eventbrite.com/e/tech-conference-12345678901",
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
        req("Get master event", "GET", "/api/v1/registry/{{masterId}}", {
          description: "Single master event with channelRefs (+ publishState) and attendees.",
        }),
        req("List attendees", "GET", "/api/v1/registry/{{masterId}}/attendees", {
          description: "Attendees for a master event.",
        }),
      ]
    ),

    folder("Webhooks", "Inbound channel webhooks + setup + logs", [
      req("Get webhook setup", "GET", "/api/v1/webhooks/setup", {
        description: "Webhook endpoint URLs + Hightribe env hints.",
      }),
      req("Register webhooks (Luma + Eventbrite)", "POST", "/api/v1/webhooks/setup", {
        description: "Register webhooks on Luma + Eventbrite using saved credentials.",
        body: {},
      }),
      req("List webhook logs", "GET", "/api/v1/webhooks/logs", {
        auth: "noauth",
        description: "Requires x-webhook-log-token or ?token= WEBHOOK_LOG_TOKEN.",
        headers: [{ key: "x-webhook-log-token", value: "{{webhookLogToken}}" }],
        query: [
          { key: "limit", value: "50" },
          { key: "token", value: "{{webhookLogToken}}", disabled: true },
        ],
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
              first_name: "EB",
              last_name: "Webhook",
            },
          },
        },
      }),
      req("Hightribe inbound", "POST", "/api/v1/webhooks/hightribe", {
        auth: "noauth",
        description: "If webhookSecret configured, send X-Webhook-Secret header.",
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
        description: "Documents expected Hightribe webhook payload.",
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
