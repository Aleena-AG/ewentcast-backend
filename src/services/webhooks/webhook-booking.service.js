const crypto = require("crypto");
const {
  getChannelEvent,
  resolveUserIdFromChannelEvent,
} = require("../channels/events.service");
const { upsertWebhookBooking } = require("../channels/bookings.service");
const {
  findMasterContextByChannelEvent,
  getMasterEvent,
  registerAttendee,
} = require("../registry.service");
const { getUserSettings } = require("../settings.service");
const { lumaRequest } = require("../luma/luma.service");

function webhookExternalId(channel, eventId, email) {
  const hash = crypto
    .createHash("sha256")
    .update(`${channel}:${eventId}:${email.toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
  return `wh:${channel}:${eventId}:${hash}`.slice(0, 191);
}

async function syncCapacityAcrossChannels(master, excludeChannel) {
  const remaining = Math.max(0, master.capacity - master.sold);
  const results = [];
  const userId = master.userId;
  if (!userId) return results;

  let settings;
  try {
    settings = await getUserSettings(userId);
  } catch {
    return results;
  }

  for (const [ch, ref] of Object.entries(master.channels || {})) {
    if (ch === excludeChannel || !ref) continue;
    try {
      if (ch === "eventbrite" && ref.ticketId) {
        const token = settings.eventbrite.privateToken;
        if (!token) throw new Error("Eventbrite token not configured");
        const res = await fetch(
          `https://www.eventbriteapi.com/v3/events/${ref.eventId}/ticket_classes/${ref.ticketId}/`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              ticket_class: { quantity_total: remaining + master.sold },
            }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            String(data.error_description || data.error || `HTTP ${res.status}`)
          );
        }
        results.push({ channel: ch, ok: true });
      } else if (ch === "luma" && ref.ticketId) {
        await lumaRequest(settings, "POST", "/v1/event/ticket-types/update", {
          body: {
            event_ticket_type_id: ref.ticketId,
            max_capacity: remaining + master.sold,
          },
        });
        results.push({ channel: ch, ok: true });
      } else {
        results.push({ channel: ch, ok: true });
      }
    } catch (e) {
      results.push({
        channel: ch,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}

async function handleWebhookBooking(input) {
  const registeredAt = input.registeredAt || new Date().toISOString();
  const ctx = await findMasterContextByChannelEvent(
    input.sourceChannel,
    input.channelEventId
  );

  let master = null;
  if (ctx) {
    await registerAttendee(ctx.masterId, {
      email: input.email,
      name: input.name,
      source: input.sourceChannel,
      registeredAt,
    });
    master = await getMasterEvent(ctx.masterId);
  }

  let userId = ctx?.userId ?? null;
  if (!userId) {
    userId = await resolveUserIdFromChannelEvent(
      input.sourceChannel,
      input.channelEventId
    );
  }

  let eventTitle = ctx?.title || "Untitled event";
  if (userId && (!ctx?.title || eventTitle === "Untitled event")) {
    const stored = await getChannelEvent(
      input.sourceChannel,
      userId,
      input.channelEventId
    );
    if (stored?.title) eventTitle = stored.title;
  }

  let bookingSaved = false;
  if (userId) {
    bookingSaved = await upsertWebhookBooking({
      userId,
      channel: input.sourceChannel,
      externalId:
        input.externalId ||
        webhookExternalId(input.sourceChannel, input.channelEventId, input.email),
      eventExternalId: input.channelEventId,
      eventTitle,
      guestName: input.name,
      guestEmail: input.email,
      registeredAt: new Date(registeredAt),
      status: input.status || "confirmed",
    });
  }

  return { master, bookingSaved };
}

async function handleBookingWebhook(sourceChannel, channelEventId, attendee) {
  const { master, bookingSaved } = await handleWebhookBooking({
    sourceChannel,
    channelEventId,
    email: attendee.email,
    name: attendee.name,
    registeredAt: attendee.registeredAt,
    externalId: attendee.externalId,
    status: attendee.status,
  });

  if (!master) {
    return { master: null, synced: [], bookingSaved: !!bookingSaved };
  }

  const synced = await syncCapacityAcrossChannels(master, sourceChannel);
  return { master, synced, bookingSaved };
}

module.exports = {
  handleWebhookBooking,
  handleBookingWebhook,
  webhookExternalId,
  syncCapacityAcrossChannels,
};
