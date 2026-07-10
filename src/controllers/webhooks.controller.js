const { handleBookingWebhook } = require("../services/webhooks/webhook-booking.service");
const { saveWebhookLog } = require("../services/webhooks/webhook-log.service");
const {
  registerChannelWebhooks,
  getWebhookSetupInfo,
  resolveHightribeWebhookSecret,
} = require("../services/webhooks/webhook-setup.service");
const { resolveUserIdFromChannelEvent } = require("../services/channels/events.service");
const { getUserSettings } = require("../services/settings.service");
const {
  listWebhookLogs,
  isValidWebhookLogToken,
} = require("../services/webhooks/webhook-log.service");
const { serialize } = require("../utils/serialize");

function parseLumaWebhook(payload) {
  const webhookType = String(payload.type || payload.action || "").trim();
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : {};
  const guest =
    payload.guest && typeof payload.guest === "object"
      ? payload.guest
      : data.guest && typeof data.guest === "object"
        ? data.guest
        : {};
  const event =
    payload.event && typeof payload.event === "object" ? payload.event : {};

  const dataId = String(data.id || data.api_id || "").trim();
  const isEventWebhook =
    /^event\./i.test(webhookType) ||
    (!/guest/i.test(webhookType) && dataId.startsWith("evt-") && !!(data.name || data.url));

  let eventId = String(
    guest.event_id ||
      guest.event_api_id ||
      data.event_id ||
      data.event_api_id ||
      event.id ||
      event.api_id ||
      payload.event_api_id ||
      payload.event_id ||
      ""
  ).trim();

  if (!eventId && isEventWebhook) eventId = dataId;

  const email = String(
    guest.user_email || guest.email || data.user_email || data.email || payload.email || ""
  ).trim();

  const name =
    String(
      guest.user_name ||
        guest.name ||
        data.user_name ||
        data.name ||
        payload.name ||
        email.split("@")[0] ||
        "Guest"
    ).trim() || "Guest";

  return { webhookType, eventId, email, name, isEventWebhook };
}

async function lumaWebhook(req, res) {
  const started = Date.now();
  const path = "/api/v1/webhooks/luma";
  let payload = {};
  let statusCode = 500;
  let outcome = "error";
  let responseBody = {};
  let errorMessage;

  try {
    payload = req.body || {};
    const parsed = parseLumaWebhook(payload);

    if (parsed.isEventWebhook) {
      statusCode = 200;
      outcome = "skipped";
      responseBody = {
        ok: true,
        skipped: "event webhook (no guest registration)",
        webhookType: parsed.webhookType || undefined,
        eventId: parsed.eventId || undefined,
      };
      return res.status(200).json(responseBody);
    }

    if (!parsed.eventId || !parsed.email) {
      statusCode = 200;
      outcome = "skipped";
      responseBody = {
        ok: true,
        skipped: "missing event or email",
        webhookType: parsed.webhookType || undefined,
      };
      return res.status(200).json(responseBody);
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook(
      "luma",
      parsed.eventId,
      { email: parsed.email, name: parsed.name }
    );
    statusCode = 200;
    outcome = "ok";
    responseBody = {
      ok: true,
      masterId: master?.id,
      synced,
      bookingSaved,
    };
    return res.status(200).json(serialize(responseBody));
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    statusCode = 500;
    outcome = "error";
    responseBody = { ok: false, error: errorMessage };
    return res.status(500).json(responseBody);
  } finally {
    void saveWebhookLog({
      channel: "luma",
      path,
      statusCode,
      outcome,
      payload,
      headers: req.headers,
      response: responseBody,
      error: errorMessage,
      durationMs: Date.now() - started,
    });
  }
}

async function eventbriteWebhook(req, res) {
  const started = Date.now();
  const path = "/api/v1/webhooks/eventbrite";
  let payload = {};
  let statusCode = 500;
  let outcome = "error";
  let responseBody = {};
  let errorMessage;

  try {
    payload = req.body || {};
    const apiUrl = String(payload.api_url || "");
    const config = payload.config;
    const action = String(config?.action || payload.action || "");

    if (action === "test") {
      statusCode = 200;
      outcome = "test";
      responseBody = { ok: true, message: "webhook test received" };
      return res.status(200).json(responseBody);
    }

    let eventId = "";
    let email = "";
    let name = "";

    if (apiUrl.includes("/orders/")) {
      let token = "";
      const matchEvent = apiUrl.match(/events\/(\d+)/);
      if (matchEvent) {
        const uid = await resolveUserIdFromChannelEvent("eventbrite", matchEvent[1]);
        if (uid) {
          const settings = await getUserSettings(uid);
          token = settings.eventbrite.privateToken;
        }
      }
      if (token) {
        const orderRes = await fetch(apiUrl, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        if (orderRes?.ok) {
          const order = await orderRes.json();
          eventId = String(order.event_id || "");
        }
      }
    }

    const attendee = payload.attendee;
    if (attendee) {
      eventId = eventId || String(attendee.event_id || "");
      const profile = attendee.profile || {};
      email = String(profile.email || "");
      name = String(profile.name || "");
    }

    if (!eventId) {
      const match = apiUrl.match(/events\/(\d+)/);
      if (match) eventId = match[1];
    }

    if (!eventId || !email) {
      statusCode = 200;
      outcome = "skipped";
      responseBody = {
        ok: true,
        skipped: "could not parse eventbrite payload",
        action,
      };
      return res.status(200).json(responseBody);
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook(
      "eventbrite",
      eventId,
      {
        email,
        name,
        externalId: attendee?.id ? String(attendee.id) : undefined,
      }
    );
    statusCode = 200;
    outcome = "ok";
    responseBody = {
      ok: true,
      masterId: master?.id,
      synced,
      bookingSaved,
    };
    return res.status(200).json(serialize(responseBody));
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    statusCode = 500;
    outcome = "error";
    responseBody = { ok: false, error: errorMessage };
    return res.status(500).json(responseBody);
  } finally {
    void saveWebhookLog({
      channel: "eventbrite",
      path,
      statusCode,
      outcome,
      payload,
      headers: req.headers,
      response: responseBody,
      error: errorMessage,
      durationMs: Date.now() - started,
    });
  }
}

async function hightribeWebhook(req, res) {
  const started = Date.now();
  const path = "/api/v1/webhooks/hightribe";
  let payload = {};
  let statusCode = 500;
  let outcome = "error";
  let responseBody = {};
  let errorMessage;

  try {
    const secret = await resolveHightribeWebhookSecret();
    if (secret) {
      const header =
        req.headers["x-webhook-secret"] ||
        req.headers["x-channel-manager-secret"] ||
        "";
      if (header !== secret) {
        statusCode = 401;
        outcome = "unauthorized";
        responseBody = { ok: false, error: "invalid webhook secret" };
        return res.status(401).json(responseBody);
      }
    }

    payload = req.body || {};
    const eventId = String(payload.event_id || payload.eventId || "");
    const email = String(payload.email || payload.guest_email || "");
    const name = String(
      payload.name || payload.guest_name || email.split("@")[0] || "Guest"
    );
    const registeredAt =
      String(payload.registered_at || payload.registeredAt || payload.booking_date || "") ||
      undefined;

    if (!eventId || !email) {
      statusCode = 200;
      outcome = "skipped";
      responseBody = { ok: true, skipped: "missing event_id or email" };
      return res.status(200).json(responseBody);
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook(
      "hightribe",
      eventId,
      {
        email,
        name,
        registeredAt,
        externalId:
          payload.booking_id || payload.id
            ? String(payload.booking_id || payload.id)
            : undefined,
      }
    );

    if (!master && !bookingSaved) {
      statusCode = 200;
      outcome = "skipped";
      responseBody = {
        ok: true,
        skipped: "event not in your synced events yet",
        eventId,
        hint: "Sync events for this channel once so we can match the booking to your account.",
      };
      return res.status(200).json(responseBody);
    }

    statusCode = 200;
    outcome = "ok";
    responseBody = {
      ok: true,
      masterId: master?.id,
      synced,
      bookingSaved,
      attendee: { name, email, eventId },
    };
    return res.status(200).json(serialize(responseBody));
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    statusCode = 500;
    outcome = "error";
    responseBody = { ok: false, error: errorMessage };
    return res.status(500).json(responseBody);
  } finally {
    void saveWebhookLog({
      channel: "hightribe",
      path,
      statusCode,
      outcome,
      payload,
      headers: req.headers,
      response: responseBody,
      error: errorMessage,
      durationMs: Date.now() - started,
    });
  }
}

async function hightribeWebhookInfo(req, res) {
  res.json({
    ok: true,
    channel: "hightribe",
    method: "POST",
    expected: {
      event_id: "Hightribe event ID",
      email: "guest email",
      name: "guest name (optional)",
      registered_at: "ISO timestamp (optional)",
    },
    headers: {
      "X-Webhook-Secret":
        "required when Hightribe webhookSecret is set in settings or CHANNEL_MANAGER_WEBHOOK_SECRET env",
    },
  });
}

async function getSetup(req, res, next) {
  try {
    const info = await getWebhookSetupInfo(req, req.userId);
    res.json({ success: true, ...info });
  } catch (err) {
    next(err);
  }
}

async function postSetup(req, res, next) {
  try {
    const result = await registerChannelWebhooks(req.userId, req);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getLogs(req, res, next) {
  try {
    const token = req.headers["x-webhook-log-token"] || req.query.token;
    if (!isValidWebhookLogToken(String(token || ""))) {
      return res.status(401).json({
        success: false,
        message: "invalid or missing WEBHOOK_LOG_TOKEN",
      });
    }
    const logs = await listWebhookLogs(req.query.limit);
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  lumaWebhook,
  eventbriteWebhook,
  hightribeWebhook,
  hightribeWebhookInfo,
  getSetup,
  postSetup,
  getLogs,
};
