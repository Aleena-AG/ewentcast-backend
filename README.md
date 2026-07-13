# Ewentcast Backend API

Express.js + Prisma + MySQL API for **Ewentcast** — auth, cross-channel event registry, and Luma / Eventbrite / Hightribe sync + webhooks.

## Stack

- Node.js (Express 5)
- Prisma 7 + `@prisma/adapter-mariadb`
- MySQL / MariaDB
- Jest + Supertest

## Quick start

```bash
npm install
cp .env.example .env
# edit DB_* and APP_URL in .env

npx prisma generate
npx prisma migrate deploy

npm run dev
# API → http://localhost:5000
```

Health check:

```text
GET /api/v1/health
```

## Environment

Use discrete DB variables (no `DATABASE_URL` string required):

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `5000`) |
| `NODE_ENV` | `development` / `production` |
| `APP_URL` | Public app URL (reset/verify links, webhook setup) |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port (default `3306`) |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name |
| `DB_CONNECTION_LIMIT` | Pool size (default `5`) |
| `HT_API_BASE` | Hightribe API base (optional) |
| `CHANNEL_MANAGER_WEBHOOK_SECRET` | Hightribe webhook secret (optional) |
| `WEBHOOK_LOG_TOKEN` | Token for `GET /api/v1/webhooks/logs` |
| `AUTH_EXPOSE_RESET_TOKEN` | Expose reset/verify tokens in API responses (dev) |
| `AUTH_SESSION_DAYS` | Session length (default `30`) |
| `EWENTCAST_TRIAL_DAYS` | Trial days on register (default `14`) |

See `.env.example`.

## Project structure

```text
server.js                 # entry
src/
  app.js
  config/                 # db + env helpers
  controllers/
  middlewares/
  routes/
  services/
    auth.service.js
    luma/ eventbrite/ hightribe/
    channels/             # events, bookings, sync, purge
    webhooks/
  utils/
prisma/
  schema.prisma
  migrations/
postman/
tests/
```

## Auth

Base: `/api/v1/auth`

| Method | Path | Notes |
|--------|------|--------|
| POST | `/register` | Creates user + trial subscription + session |
| POST | `/login` | Returns Bearer token |
| GET | `/me` | Requires `Authorization: Bearer <token>` |
| POST | `/logout` | Invalidates session |
| POST | `/forgot-password` | Creates reset token |
| POST | `/reset-password` | `{ token, password }` |
| POST | `/resend-verification` | New email verify token |
| POST/GET | `/verify-email` | Confirm email |

In non-production, register/forgot responses may include `verifyToken` / `resetToken` for testing.

Other protected routes accept either:

- `Authorization: Bearer <token>`, or
- `x-user-id: <id>` (legacy/dev)

## Channels (Luma / Eventbrite / Hightribe)

Base: `/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/settings` | Per-user channel credentials |
| DELETE | `/settings/:channel` | Clear one channel’s settings |
| GET | `/events/:channel` | List stored events |
| POST | `/events/:channel/sync` | Upsert raw events (`{ events, prune? }`) |
| POST | `/events/:channel/sync-bookings` | Upsert bookings |
| POST | `/events/:channel/sync-from-api` | Pull from channel API → DB |
| GET | `/events/bookings` | All channel bookings |
| DELETE | `/events/:channel` | Purge channel data |
| GET/POST | `/registry` | Master events + channel refs |

`:channel` ∈ `luma` | `eventbrite` | `hightribe`

## Webhooks

Public inbound (no user auth):

| Method | Path |
|--------|------|
| POST | `/api/v1/webhooks/luma` |
| POST | `/api/v1/webhooks/eventbrite` |
| POST | `/api/v1/webhooks/hightribe` |

Setup (authenticated):

| Method | Path |
|--------|------|
| GET/POST | `/api/v1/webhooks/setup` |
| GET | `/api/v1/webhooks/logs` | Needs `WEBHOOK_LOG_TOKEN` |

## Laragon local domain

Proxy `api.ewentcast.test` → Node `:5000` via:

`C:\laragon\etc\apache2\sites-enabled\api.ewentcast.test.conf`

```bash
npm start
# open http://api.ewentcast.test/api/v1/health
```

Keep the Node process running; Apache only proxies.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon |
| `npm start` | Production start |
| `npm test` | Jest (unit + integration) |
| `npm run prisma:generate` | Generate client |
| `npm run prisma:migrate` | Dev migrations |
| `npx prisma migrate deploy` | Apply migrations (CI/live) |
| `npm run prisma:studio` | Prisma Studio |

## Postman

Collection: `postman/Ewentcast-API.postman_collection.json`

Variables: `baseUrl`, `authToken`, `userId`, `channel`, …

Default `baseUrl`: `http://api.ewentcast.test`

Cloud update (optional):

```bash
# POSTMAN_API_KEY in .env
node scripts/update-postman-collection.js
```

## License

ISC
