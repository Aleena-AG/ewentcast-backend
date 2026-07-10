const { getUserSettings } = require("../settings.service");
const { lumaRequest } = require("../luma/luma.service");
const prisma = require("../../config/db");

const EVENTBRITE_WEBHOOK_ACTIONS = [
  "attendee.updated",
  "attendee.checked_in",
  "attendee.checked_out",
  "event.created",
  "event.published",
  "event.unpublished",
  "event.updated",
  "order.placed",
  "order.refunded",
  "order.updated",
  "organizer.updated",
  "ticket_class.created",
  "ticket_class.deleted",
  "ticket_class.updated",
].join(",");

function webhookBase(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (host) {
    const proto =
      req.headers["x-forwarded-proto"] ||
      (String(host).includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
}

async function readJsonSafe(res) {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function registerChannelWebhooks(userId, req) {
  const base = webhookBase(req);
  const settings = await getUserSettings(userId);
  const results = {};

  // Luma
  if (settings.luma.apiKey) {
    try {
      const url = `${base}/api/v1/webhooks/luma`;
      const data = await lumaRequest(settings, "POST", "/v2/webhooks/create", {
        body: {
          url,
          events: ["guest.registered", "guest.updated"],
        },
      });
      results.luma = { ok: true, data, url };
    } catch (e) {
      results.luma = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  } else {
    results.luma = { ok: false, error: "Luma API key not configured" };
  }

  // Eventbrite
  if (settings.eventbrite.privateToken) {
    try {
      const orgRes = await fetch("https://www.eventbriteapi.com/v3/users/me/organizations/", {
        headers: { Authorization: `Bearer ${settings.eventbrite.privateToken}` },
      });
      const orgData = await readJsonSafe(orgRes);
      if (!orgRes.ok) {
        throw new Error(
          String(orgData.error_description || orgData.error || `HTTP ${orgRes.status}`)
        );
      }
      const orgId = orgData.organizations?.[0]?.id;
      if (!orgId) throw new Error("No Eventbrite organization found");

      const webhookUrl = `${base}/api/v1/webhooks/eventbrite`;
      const whRes = await fetch(
        `https://www.eventbriteapi.com/v3/organizations/${orgId}/webhooks/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.eventbrite.privateToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint_url: webhookUrl,
            actions: EVENTBRITE_WEBHOOK_ACTIONS,
          }),
        }
      );
      const whData = await readJsonSafe(whRes);
      results.eventbrite = {
        ok: whRes.ok,
        data: whData,
        url: webhookUrl,
        error: whRes.ok
          ? undefined
          : String(whData.error_description || whData.error || `HTTP ${whRes.status}`),
      };
    } catch (e) {
      results.eventbrite = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    results.eventbrite = { ok: false, error: "Eventbrite token not configured" };
  }

  // Hightribe (manual Laravel env)
  const htUrl = `${base}/api/v1/webhooks/hightribe`;
  const htSecret =
    settings.hightribe.webhookSecret ||
    process.env.CHANNEL_MANAGER_WEBHOOK_SECRET ||
    "";
  results.hightribe = {
    ok: true,
    url: htUrl,
    laravelEnv: {
      CHANNEL_MANAGER_WEBHOOK_URL: htUrl,
      CHANNEL_MANAGER_WEBHOOK_SECRET:
        htSecret || "<generate-a-secret-and-set-in-both-apps>",
    },
    note: htSecret
      ? "Add CHANNEL_MANAGER_WEBHOOK_URL and CHANNEL_MANAGER_WEBHOOK_SECRET to Hightribe Laravel .env, then php artisan config:clear."
      : "Set Hightribe webhook secret in Settings first, then add both env vars to Hightribe Laravel .env.",
  };

  return { ok: true, webhooks: results, base };
}

async function getWebhookSetupInfo(req, userId) {
  const base = webhookBase(req);
  let htSecret = process.env.CHANNEL_MANAGER_WEBHOOK_SECRET || "";
  if (userId) {
    try {
      const settings = await getUserSettings(userId);
      htSecret = settings.hightribe.webhookSecret || htSecret;
    } catch {
      // ignore
    }
  }

  return {
    endpoints: {
      luma: `${base}/api/v1/webhooks/luma`,
      eventbrite: `${base}/api/v1/webhooks/eventbrite`,
      hightribe: `${base}/api/v1/webhooks/hightribe`,
    },
    setup:
      "POST /api/v1/webhooks/setup to register on Luma + Eventbrite. hightribe: set env vars on Laravel backend.",
    HightribeLaravelEnv: [
      `CHANNEL_MANAGER_WEBHOOK_URL=${base}/api/v1/webhooks/hightribe`,
      `CHANNEL_MANAGER_WEBHOOK_SECRET=${htSecret || "<same-as-settings-Hightribe-webhookSecret>"}`,
    ],
  };
}

/** Resolve Hightribe webhook secret from env or any user settings. */
async function resolveHightribeWebhookSecret() {
  const envSecret = process.env.CHANNEL_MANAGER_WEBHOOK_SECRET?.trim();
  if (envSecret) return envSecret;

  const rows = await prisma.userSettings.findMany({
    select: { settingsJson: true },
    take: 50,
  });
  for (const row of rows) {
    const secret = row.settingsJson?.hightribe?.webhookSecret?.trim();
    if (secret) return secret;
  }
  return "";
}

module.exports = {
  webhookBase,
  registerChannelWebhooks,
  getWebhookSetupInfo,
  resolveHightribeWebhookSecret,
};
