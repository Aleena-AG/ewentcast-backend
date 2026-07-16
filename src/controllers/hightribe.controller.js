const hightribe = require("../services/hightribe/hightribe.service");
const {
  updateUserSettings,
  upsertHtConnection,
  toPublicSettingsView,
} = require("../services/settings.service");
const {
  upsertChannelEvents,
  getChannelEvent,
} = require("../services/channels/events.service");
const {
  propagateFromChannelEvent,
  propagateMasterToChannels,
} = require("../services/channels/propagate-master.service");
const prisma = require("../config/db");

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

/** Proxy FE: GET /api/v1/hightribe/events/bookings?page=&per_page= */
async function listHightribeBookings(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page || req.query.perPage) || 50;
    const raw = await hightribe.htRequest(req.userId, "events/bookings", {
      page: String(page),
      per_page: String(perPage),
    });
    res.json({
      success: true,
      ...(raw && typeof raw === "object" ? raw : {}),
      data: raw?.data ?? raw,
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

/** Proxy FE: GET /api/v1/hightribe/events?page=&per_page= */
async function listHightribeEvents(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page || req.query.perPage) || 50;
    const raw = await hightribe.htRequest(req.userId, "events", {
      page: String(page),
      per_page: String(perPage),
    });
    res.json({
      success: true,
      ...(raw && typeof raw === "object" ? raw : {}),
      data: raw?.data ?? raw,
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

/** Proxy FE: GET /api/v1/hightribe/events/:id */
async function getHightribeEvent(req, res, next) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ success: false, message: "event id required" });
    }
    const raw = await hightribe.htRequest(req.userId, `events/${id}`);
    const event = raw?.data ?? raw;
    try {
      await upsertChannelEvents("hightribe", req.userId, [event], { prune: false });
    } catch {
      /* dashboard mirror is best-effort */
    }
    res.json({
      success: true,
      ...(raw && typeof raw === "object" ? raw : {}),
      data: event,
    });
  } catch (err) {
    if (err.name === "HightribeApiError") {
      // Fallback: event may exist locally if created via ewentcast but HT get failed
      try {
        const local = await getChannelEvent("hightribe", req.userId, req.params.id);
        if (local?.payload) {
          return res.json({
            success: true,
            data: local.payload,
            event: local.payload,
            source: "local",
          });
        }
      } catch {
        /* ignore */
      }
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

/** Proxy FE: PUT/PATCH /api/v1/hightribe/events/:id — also fans out to Luma + Eventbrite */
async function updateHightribeEvent(req, res, next) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ success: false, message: "event id required" });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    const body = req.body || {};
    const raw = await hightribe.updateEvent(req.userId, id, body, files);
    const event = raw?.data ?? raw;
    try {
      await upsertChannelEvents("hightribe", req.userId, [event], { prune: false });
    } catch {
      /* dashboard mirror is best-effort */
    }

    // Sync linked master + push same edits to Luma / Eventbrite
    let channelUpdates = null;
    const syncChannels = body.syncChannels !== false && body.propagate !== false;
    if (syncChannels) {
      try {
        const ref = await prisma.channelRef.findFirst({
          where: { channel: "hightribe", eventId: id },
          include: { masterEvent: { include: { channelRefs: true } } },
        });
        if (ref?.masterEvent && Number(ref.masterEvent.userId) === Number(req.userId)) {
          const patch = {};
          const title = body.title || body.name || event?.title || event?.name;
          if (title) patch.title = String(title);
          if (body.description != null || event?.description != null) {
            patch.description = String(body.description ?? event.description ?? "");
          }
          if (body.timezone || event?.timezone) {
            patch.timezone = String(body.timezone || event.timezone);
          }
          const startAt = body.start_at || body.startAt || event?.start_at;
          const endAt = body.end_at || body.endAt || event?.end_at;
          if (startAt) {
            const d = new Date(startAt);
            if (!Number.isNaN(d.getTime())) patch.startAt = d;
          }
          if (endAt) {
            const d = new Date(endAt);
            if (!Number.isNaN(d.getTime())) patch.endAt = d;
          }
          if (body.capacity != null || event?.capacity != null) {
            const cap = Number(body.capacity ?? event.capacity);
            if (!Number.isNaN(cap)) patch.capacity = cap;
          }

          if (Object.keys(patch).length) {
            await prisma.masterEvent.update({
              where: { id: ref.masterId },
              data: patch,
            });
          }

          const master = await prisma.masterEvent.findUnique({
            where: { id: ref.masterId },
            include: { channelRefs: true },
          });

          if (master) {
            channelUpdates = await propagateMasterToChannels(req.userId, master, {
              excludeChannel: "hightribe",
            });
          } else {
            const propagated = await propagateFromChannelEvent(
              "hightribe",
              id,
              req.userId
            );
            channelUpdates = propagated?.channels || null;
          }
        }
      } catch {
        /* fan-out is best-effort — HT update already succeeded */
      }
    }

    res.json({
      success: true,
      ...(raw && typeof raw === "object" ? raw : {}),
      data: event,
      channelUpdates,
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
  listHightribeBookings,
  listHightribeEvents,
  getHightribeEvent,
  updateHightribeEvent,
};
