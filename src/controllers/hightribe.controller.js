const hightribe = require("../services/hightribe/hightribe.service");
const {
  updateUserSettings,
  upsertHtConnection,
  toPublicSettingsView,
} = require("../services/settings.service");
const { upsertChannelEvents } = require("../services/channels/events.service");

async function loginHightribe(req, res, next) {
  try {
    const { email, password, serviceUrl } = req.body || {};
    const result = await hightribe.loginWithPassword({ email, password, serviceUrl });

    const htEmail = String(
      result.user?.email || email || ""
    )
      .trim()
      .toLowerCase();

    // Persist token + Hightribe account email
    const settings = await updateUserSettings(req.userId, {
      hightribe: {
        serviceUrl: result.serviceUrl,
        apiKey: result.token,
        email: htEmail,
      },
    });

    const htUserId =
      result.user?.id != null
        ? String(result.user.id)
        : result.user?.user_id != null
          ? String(result.user.user_id)
          : null;

    await upsertHtConnection(req.userId, {
      htUserId,
      htToken: result.token,
    });

    const publicSettings = toPublicSettingsView(settings);

    res.json({
      success: true,
      status: true,
      token: result.token,
      access_token: result.token,
      apiKey: result.token,
      email: htEmail || null,
      user: result.user,
      message: result.message,
      settings: publicSettings,
      data: {
        token: result.token,
        email: htEmail || null,
        user: result.user,
      },
    });
  } catch (err) {
    if (err.name === "HightribeApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        status: false,
        message: err.message,
      });
    }
    next(err);
  }
}

async function createHightribeEvent(req, res, next) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const body = req.body || {};
    if (!body.title && !body["title"]) {
      return res.status(422).json({
        success: false,
        message:
          "title is required. Multipart FormData (with cover) must be parsed — redeploy backend if you still see empty body errors.",
        debug: {
          contentType: req.headers["content-type"] || null,
          bodyKeys: Object.keys(body),
          fileCount: files.length,
        },
      });
    }
    const raw = await hightribe.createEvent(req.userId, body, files);
    // HT returns { data: event }; FE reads response.data.id — unwrap one level
    const event = raw?.data ?? raw;
    try {
      await upsertChannelEvents("hightribe", req.userId, [event], { prune: false });
    } catch {
      /* dashboard mirror is best-effort */
    }
    res.status(201).json({
      success: true,
      ...(raw && typeof raw === "object" ? raw : {}),
      data: event,
    });
  } catch (err) {
    if (err.name === "HightribeApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

async function createHightribeEventWithTickets(req, res, next) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const body = req.body || {};
    if (!body.title && !body["title"]) {
      return res.status(422).json({
        success: false,
        message:
          "title is required. Send JSON or multipart FormData with a title field (cover uploads must use multipart).",
      });
    }
    const raw = await hightribe.createEventWithTickets(req.userId, body, files);
    const event = raw?.data ?? raw;
    try {
      await upsertChannelEvents("hightribe", req.userId, [event], { prune: false });
    } catch {
      /* dashboard mirror is best-effort */
    }
    res.status(201).json({
      success: true,
      ...(raw && typeof raw === "object" ? raw : {}),
      data: event,
    });
  } catch (err) {
    if (err.name === "HightribeApiError") {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

module.exports = {
  loginHightribe,
  createHightribeEvent,
  createHightribeEventWithTickets,
};
