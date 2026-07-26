# Hashtag Tracker

Instagram hashtag media ingestion pipeline — fetches `#matcha` media from Meta Graph API, stores metadata in Postgres, downloads assets to local storage, and exposes a paginated read API.

The **app container** runs everything in one Node.js process: Express API, in-memory queue worker, and **`node-cron` scheduler** (not OS crontab).

---

## Run with Docker Compose (recommended)

### Prerequisites

- Docker and Docker Compose
- Meta API credentials (see `requrirements.md`)

### Steps

```bash
# 1. Copy env file and add your Meta access token
cp .env.example .env
# Edit .env — set META_ACCESS_TOKEN (required)

# 2. Build and start app + postgres
docker compose up --build

# Or run detached
docker compose up --build -d
```

On startup the **app container** will:

1. Wait for Postgres to be healthy
2. Run database migrations
3. Start the Node.js app (API + queue worker + in-process `node-cron`)

### Useful commands

```bash
# View logs
docker compose logs -f app

# Stop services
docker compose down

# Stop and remove volumes (reset DB + stored media)
docker compose down -v

# Rebuild after code changes
docker compose up --build
```

### Service endpoints

| Service | URL / Port |
|---------|------------|
| App API | http://localhost:3000 |
| Postgres (host debug) | `localhost:5434` (user: `postgres`, password: `postgres`, db: `hashtag_tracker`) |

### What runs where

| Component | Location |
|-----------|----------|
| Express API | `app` container |
| In-memory queue + worker | `app` container |
| `node-cron` (every 3h recent sync) | `app` container — **not** OS crontab |
| Postgres | `postgres` container |
| Media files | Docker volume `app_storage` → `/app/storage` |

### Manual sync (don't wait 3 hours)

The startup sync runs automatically, but you can re-trigger anytime:

```bash
# Top media (same as startup)
curl -X POST http://localhost:3000/sync/top

# Recent media (same as the 3-hour cron)
curl -X POST http://localhost:3000/sync/recent

# Wait ~30–60s, then check stored media
curl http://localhost:3000/hashtags
```

Check sync status in the database:

```bash
docker exec hashtag-tracker-postgres psql -U postgres -d hashtag_tracker \
  -c "SELECT sync_type, status, items_fetched, items_inserted, error_message FROM sync_runs ORDER BY created_at DESC LIMIT 3;"
```

---

## Run locally (without Docker)

For development on WSL with an existing Postgres install:

```bash
cp .env.example .env   # set META_ACCESS_TOKEN and DATABASE_URL
npm install
npm run migrate
npm run dev            # hot reload
```

If using WSL Postgres on port **5433**, set:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/hashtag_tracker
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (local) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (local) |
| `npm test` | Run unit tests |
| `npm run lint` | Run ESLint |
| `npm run migrate` | Run database migrations |

---

## Troubleshooting Docker startup

**`MetaApiError: (#200) Requires instagram_basic permission`**

Your `META_ACCESS_TOKEN` is wrong or lacks permissions. Common causes:

1. **App ID|App Secret used instead of page token** — values like `123456|abc...` are invalid. Use the Instagram **page access token** from `requrirements.md` (starts with `EAAM...`).
2. **Token expired** — regenerate the page token in Meta Developer Console.
3. **Missing scopes** — the token needs `instagram_basic` and related Instagram Graph permissions.

After fixing `.env`:

```bash
docker compose down
docker compose up --build
```

The app now stays running even if Meta fails (`GET /health` works), but media sync will not run until the token is valid.

---

## Documentation

- [`design.md`](./design.md) — architecture, Docker layout, phased plan
- [`instructions.md`](./instructions.md) — environment variables and tradeoffs
- [`requrirements.md`](./requrirements.md) — project requirements
