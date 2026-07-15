const prisma = require("../config/db");

function defaultSettings() {
  const appUrl = (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
  return {
    eventbrite: {
      clientId: "",
      clientSecret: "",
      redirectUri: `${appUrl}/api/v1/eventbrite/callback`,
      privateToken: "",
      publicToken: "",
    },
    luma: {
      apiKey: "",
      calendarId: "",
      apiBaseUrl: "https://public-api.luma.com",
      discoverBaseUrl: "https://api.lu.ma",
    },
    hightribe: {
      serviceUrl: (process.env.HT_API_BASE || "https://api.hightribe.com").replace(/\/$/, ""),
      apiKey: "",
      webhookSecret: "",
    },
  };
}

function isMaskedSecret(s) {
  return !!s && s.includes("*");
}

function normalizeLumaStored(luma) {
  if (!luma) return undefined;
  let apiKey = String(luma.apiKey ?? luma.api_key ?? "").trim();
  if (isMaskedSecret(apiKey)) apiKey = "";
  return {
    apiKey,
    calendarId: String(luma.calendarId ?? luma.calendar_id ?? ""),
    apiBaseUrl: String(luma.apiBaseUrl ?? luma.api_base_url ?? "") || "https://public-api.luma.com",
    discoverBaseUrl:
      String(luma.discoverBaseUrl ?? luma.discover_base_url ?? "") || "https://api.lu.ma",
  };
}

function normalizeStored(stored) {
  if (!stored) return null;
  const luma = normalizeLumaStored(stored.luma);
  return luma ? { ...stored, luma } : stored;
}

function mergeSettings(base, patch) {
  if (!patch) return base;
  return {
    eventbrite: { ...base.eventbrite, ...(patch.eventbrite || {}) },
    luma: { ...base.luma, ...(patch.luma || {}) },
    hightribe: { ...base.hightribe, ...(patch.hightribe || {}) },
  };
}

function mergePatch(current, patch) {
  const updated = mergeSettings(current, patch);
  if (patch.eventbrite?.clientSecret?.includes("*")) {
    updated.eventbrite.clientSecret = current.eventbrite.clientSecret;
  }
  if (patch.eventbrite?.privateToken?.includes("*")) {
    updated.eventbrite.privateToken = current.eventbrite.privateToken;
  }
  if (patch.eventbrite?.publicToken?.includes("*")) {
    updated.eventbrite.publicToken = current.eventbrite.publicToken;
  }
  if (patch.luma?.apiKey?.includes("*")) {
    if (!current.luma.apiKey) {
      throw new Error(
        "Enter your full Luma API key — paste it from lu.ma/settings, not the masked display value"
      );
    }
    updated.luma.apiKey = current.luma.apiKey;
  }
  if (patch.hightribe?.apiKey?.includes("*")) {
    updated.hightribe.apiKey = current.hightribe.apiKey;
  }
  if (patch.hightribe?.webhookSecret?.includes("*")) {
    updated.hightribe.webhookSecret = current.hightribe.webhookSecret;
  }
  return updated;
}

function maskSecret(s) {
  return s ? `${s.slice(0, 4)}${"*".repeat(Math.max(0, s.length - 4))}` : "";
}

function toPublicSettingsView(d) {
  return {
    eventbrite: {
      clientId: d.eventbrite.clientId,
      clientSecret: maskSecret(d.eventbrite.clientSecret),
      redirectUri: d.eventbrite.redirectUri,
      privateToken: maskSecret(d.eventbrite.privateToken),
      publicToken: maskSecret(d.eventbrite.publicToken),
      configured: !!d.eventbrite.privateToken,
      oauthConfigured: !!(d.eventbrite.clientId && d.eventbrite.clientSecret),
      hasPrivateToken: !!d.eventbrite.privateToken,
    },
    luma: {
      apiKey: maskSecret(d.luma.apiKey),
      calendarId: d.luma.calendarId,
      apiBaseUrl: d.luma.apiBaseUrl,
      discoverBaseUrl: d.luma.discoverBaseUrl,
      configured: !!d.luma.apiKey && !isMaskedSecret(d.luma.apiKey),
    },
    hightribe: {
      serviceUrl: d.hightribe.serviceUrl,
      apiKey: maskSecret(d.hightribe.apiKey),
      webhookSecret: maskSecret(d.hightribe.webhookSecret),
      // Connected only when a real token/API key is saved — not merely serviceUrl
      // (default serviceUrl is always https://api.hightribe.com).
      configured: !!d.hightribe.apiKey && !isMaskedSecret(d.hightribe.apiKey),
      hasApiKey: !!d.hightribe.apiKey && !isMaskedSecret(d.hightribe.apiKey),
      hasWebhookSecret: !!d.hightribe.webhookSecret,
    },
  };
}

async function getUserSettings(userId) {
  const row = await prisma.userSettings.findUnique({
    where: { userId: BigInt(userId) },
  });
  const stored = row ? normalizeStored(row.settingsJson) : null;
  return mergeSettings(defaultSettings(), stored);
}

async function updateUserSettings(userId, patch) {
  const current = await getUserSettings(userId);
  const updated = mergePatch(current, patch);

  await prisma.userSettings.upsert({
    where: { userId: BigInt(userId) },
    create: {
      userId: BigInt(userId),
      settingsJson: updated,
    },
    update: {
      settingsJson: updated,
    },
  });

  return updated;
}

async function clearChannelSettings(userId, channel) {
  const empty = defaultSettings();
  if (channel === "luma") return updateUserSettings(userId, { luma: empty.luma });
  if (channel === "eventbrite") return updateUserSettings(userId, { eventbrite: empty.eventbrite });

  // Hightribe: wipe token + ht_connections so GET settings stays disconnected after refresh
  await prisma.htConnection.deleteMany({ where: { userId: BigInt(userId) } });
  return updateUserSettings(userId, {
    hightribe: {
      ...empty.hightribe,
      apiKey: "",
      webhookSecret: "",
    },
  });
}

async function getHtConnection(userId) {
  return prisma.htConnection.findUnique({
    where: { userId: BigInt(userId) },
  });
}

async function upsertHtConnection(userId, data) {
  return prisma.htConnection.upsert({
    where: { userId: BigInt(userId) },
    create: {
      userId: BigInt(userId),
      htUserId: data.htUserId || null,
      htToken: data.htToken || null,
      connectedAt: data.connectedAt || new Date(),
    },
    update: {
      htUserId: data.htUserId ?? undefined,
      htToken: data.htToken ?? undefined,
      connectedAt: data.connectedAt ?? new Date(),
    },
  });
}

module.exports = {
  defaultSettings,
  getUserSettings,
  updateUserSettings,
  clearChannelSettings,
  toPublicSettingsView,
  getHtConnection,
  upsertHtConnection,
};
