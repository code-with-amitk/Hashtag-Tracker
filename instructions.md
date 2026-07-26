## setup

### Option A — Docker Compose (recommended)

**Prerequisites:** Docker, Docker Compose, Meta API token (see **vars** below)

```bash
cp .env.example .env          # set META_ACCESS_TOKEN
docker compose up --build     # starts app + postgres
```

The **app container** runs the API, queue worker, and **`node-cron` scheduler** (not OS crontab). On startup it waits for Postgres, runs migrations, then starts the app.

```bash
docker compose logs -f app    # view logs
docker compose down           # stop
docker compose down -v        # stop and reset volumes
```

App: http://localhost:3000 · Postgres (host debug): `localhost:5434`

See [`design.md` Section 11](./design.md#11-docker-deployment) for container architecture.

### Option B — Local development (WSL / Node)

**Prerequisites:** Node.js 20+, Postgres 14+, `.env` configured

```bash
cp .env.example .env
npm install
npm run migrate
npm run dev
```

For WSL Postgres on port 5433, use the commented `DATABASE_URL` in `.env.example`.

---

## vars

Environment variables used by the application. Copy `.env.example` to `.env` and set values before running.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | Postgres connection string, e.g. `postgresql://user:pass@localhost:5433/hashtag_tracker` |
| `TEST_DATABASE_URL` | no | `…/hashtag_tracker_test` | Postgres URL used by Jest integration tests |
| `META_ACCESS_TOKEN` | yes | — | Instagram page access token for Meta Graph API |
| `META_USER_ID` | yes | — | Instagram business account ID (`user_id` in API calls) |
| `HASHTAG_NAME` | no | `matcha` | Hashtag to track (without `#`) |
| `STORAGE_BASE_PATH` | no | `./storage` | Local directory for downloaded media assets |
| `PORT` | no | `3000` | HTTP port for the Express server |
| `SYNC_MAX_ITEMS` | no | `500` | Max media items fetched per sync (Meta pagination cap) |
| `CRON_RECENT_MEDIA` | no | `0 */3 * * *` | Cron expression for recent-media sync (every 3 hours) |

**Example `.env`:**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/hashtag_tracker
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/hashtag_tracker_test
META_ACCESS_TOKEN=<your-instagram-page-token>
META_USER_ID=17841413741308252
HASHTAG_NAME=matcha
STORAGE_BASE_PATH=./storage
PORT=3000
```

> Do not commit `.env` or real tokens to git. Credentials are provided in `requrirements.md` for local development only.

---

## tradeoffs

> Will be finalized after implementation. Planned shortcuts documented in [`design.md` Section 9](./design.md#9-tradeoffs--shortcuts-planned):

- In-memory queue (no persistence across restarts)
- Local file storage instead of S3
- No retry/backoff for Meta API rate limits
- Single hashtag scope (`matcha`)
- No authentication on the read API
- Asset download inline during ingestion (not a separate async job queue)

---

## ai-usage

### Which AI tools you used (for example, Cursor, Claude, Codex)

- **Cursor** (AI-assisted coding agent)

### What you used them for

- Reading and interpreting `requrirements.md`
- Creating `design.md` — architecture, module layout, Mermaid diagrams, DB schema, phased TODO with unit tests
- Filling `instructions.md` vars section and setting up `ai-usage/` exports
- Drafting `.env.example`

### What you reviewed, tested, or wrote yourself

- Reviewed all design decisions (dedup strategy, schema fields, module boundaries, pagination approach)
- Verified environment variable names and defaults against requirements
- Will implement, test, and validate all application code manually during Phases 0–7

### Chat history from your AI sessions

All exported sessions are in the [`ai-usage/`](./ai-usage/) folder:

| Session | File |
|---------|------|
| Design document | [`ai-usage/session-01-design.md`](./ai-usage/session-01-design.md) |
| Instructions & AI usage setup | [`ai-usage/session-02-instructions-ai-usage.md`](./ai-usage/session-02-instructions-ai-usage.md) |
| Raw transcript (JSONL) | [`ai-usage/917a1bf0-bcce-4b30-9ccc-b2874fbf2302.jsonl`](./ai-usage/917a1bf0-bcce-4b30-9ccc-b2874fbf2302.jsonl) |
| Index | [`ai-usage/README.md`](./ai-usage/README.md) |
