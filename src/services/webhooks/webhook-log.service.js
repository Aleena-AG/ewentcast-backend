const prisma = require("../../config/db");
const { serialize } = require("../../utils/serialize");

const REDACT_HEADERS = new Set([
  "authorization",
  "x-webhook-secret",
  "x-channel-manager-secret",
  "stripe-signature",
  "cookie",
]);

function sanitizeHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== "object") return out;

  // Express req.headers is a plain object
  for (const [key, value] of Object.entries(headers)) {
    const v = Array.isArray(value) ? value.join(", ") : String(value);
    out[key] = REDACT_HEADERS.has(key.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}

async function saveWebhookLog(input) {
  try {
    await prisma.webhookLog.create({
      data: {
        channel: input.channel,
        method: input.method || "POST",
        path: input.path || "",
        statusCode: input.statusCode,
        outcome: input.outcome || null,
        payloadJson: input.payload ?? null,
        headersJson: input.headers ? sanitizeHeaders(input.headers) : null,
        responseJson: input.response !== undefined ? input.response : null,
        errorMessage: input.error || null,
        durationMs: input.durationMs ?? null,
      },
    });
  } catch (e) {
    console.error("[webhook-log] save failed:", e instanceof Error ? e.message : e);
  }
}

async function listWebhookLogs(limit = 150) {
  const safeLimit = Math.min(Math.max(Number(limit) || 150, 1), 500);
  const rows = await prisma.webhookLog.findMany({
    orderBy: { id: "desc" },
    take: safeLimit,
  });
  return serialize(rows);
}

function getWebhookLogToken() {
  return process.env.WEBHOOK_LOG_TOKEN?.trim() || null;
}

function isValidWebhookLogToken(token) {
  const expected = getWebhookLogToken();
  if (!expected || !token) return false;
  return token === expected;
}

module.exports = {
  saveWebhookLog,
  listWebhookLogs,
  sanitizeHeaders,
  getWebhookLogToken,
  isValidWebhookLogToken,
};
