const { getUserSettings } = require("../settings.service");
const { upsertChannelEvents, listChannelEvents } = require("./events.service");
const { upsertChannelBookings, listChannelBookings } = require("./bookings.service");
const luma = require("../luma/luma.service");
const eventbrite = require("../eventbrite/eventbrite.service");
const hightribe = require("../hightribe/hightribe.service");

/**
 * Pull events + bookings from channel APIs and persist to MySQL.
 * Mirrors eventlifter-core syncChannelDataToDb.
 */
async function syncChannelDataToDb(channel, userId) {
  const settings = await getUserSettings(userId);
  let events = [];
  let bookings = [];

  if (channel === "luma") {
    events = await luma.fetchEventsForSync(settings);
    bookings = await luma.fetchBookingsForSync(settings, events);
  } else if (channel === "eventbrite") {
    events = await eventbrite.fetchEventsForSync(settings);
    bookings = await eventbrite.fetchBookingsForSync(settings, events);
  } else if (channel === "hightribe") {
    events = await hightribe.fetchEventsForSync(userId);
    bookings = await hightribe.fetchBookingsForSync(userId);
  } else {
    throw Object.assign(new Error("invalid channel"), { statusCode: 400 });
  }

  const eventSync = await upsertChannelEvents(channel, userId, events, { prune: true });
  let bookingCount = 0;
  if (bookings.length > 0) {
    const bookingSync = await upsertChannelBookings(channel, userId, bookings);
    bookingCount = bookingSync.upserted;
  }

  const storedEvents = await listChannelEvents(channel, userId);
  const storedBookings = await listChannelBookings(channel, userId);

  return {
    events: eventSync.upserted,
    pruned: eventSync.pruned,
    bookings: bookingCount,
    storedEvents,
    storedBookings,
  };
}

module.exports = { syncChannelDataToDb };
