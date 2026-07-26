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
| `META_PAGE_LIMIT` | no | `10` | Page size for `recent_media` requests (Meta rejects large `top_media` pages — see **tradeoffs**) |
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

Deliberate shortcuts and platform constraints for this assignment. A production system would address most of these.

### Infrastructure & runtime

| Decision | What we did | Why / production alternative |
|----------|-------------|------------------------------|
| **In-memory queue** | Jobs live in process memory; lost on restart | Simple and sufficient for the scope. Replace with SQS via `QueueInterface` for durability and horizontal scaling. |
| **Local file storage** | Assets written to `STORAGE_BASE_PATH/{hashtag}/{mediaId}.{ext}` | Meets assignment requirements. Swap `LocalStorage` for S3 via `StorageInterface`. |
| **In-process cron** | `node-cron` inside the app container | No OS crontab or separate scheduler container. Production would use EventBridge + Lambda or a dedicated worker service. |
| **Single Node process** | API, queue worker, and scheduler run together | Keeps Docker setup minimal. Production would likely split API and workers (ECS/Fargate, Lambda). |
| **No auth on API** | `GET /hashtags` and `POST /sync/*` are open | Assignment is an internal ingestion tool. Production would add API keys or OAuth. |

### Ingestion & sync behavior

| Decision | What we did | Why / production alternative |
|----------|-------------|------------------------------|
| **Single hashtag** | Only `#matcha` (configurable via `HASHTAG_NAME`, but not multi-tenant) | Matches requirements. Multi-hashtag would need per-hashtag sync state and API filtering. |
| **Inline asset download** | Media files downloaded during the sync job, not enqueued separately | Simpler pipeline; sync duration includes download time. Production might use a dedicated asset queue with retries and CDN upload. |
| **No Meta retry/backoff** | Failed API calls mark the `sync_run` as failed and log the error | Acceptable for a demo. Production would add exponential backoff, rate-limit awareness, and dead-letter handling. |
| **Dedup via DB upsert** | Unique constraint on `instagram_media_id`; re-sync updates counts, skips re-insert | Simple and reliable. Does not re-download assets if already stored. |
| **Manual sync endpoints** | `POST /sync/top` and `POST /sync/recent` for testing | Not required by spec; useful for demos without waiting for cron. Would be protected or removed in production. |
| **Bootstrap enqueues top sync** | First top-media sync runs on app startup | Ensures data appears quickly after deploy. Production might rely on scheduled jobs only to avoid startup load. |

### Meta Graph API limits (discovered during live testing)

These are **platform constraints** with the provided token, not bugs in the ingestion code:

| Constraint | Observed behavior | How we handle it |
|------------|-------------------|------------------|
| **`top_media` page size** | Requests with `limit ≥ 2` fail with *"Please reduce the amount of data you're asking for"* — even with `fields=id` only | `top_media` always uses `limit=1`. |
| **`top_media` pagination** | Page 2+ fails (same error or *"An unknown error occurred"*) | Only the **first page** is ingested (~1 top item per sync). Cannot reach the assignment's 500-item cap for top media with this API tier. |
| **`recent_media` page size** | Higher limits work (tested up to 25 with full fields) | Default `META_PAGE_LIMIT=10`; falls back to smaller field sets if Meta rejects the payload. |
| **`recent_media` deep pagination** | Later pages can fail (rate limits or transient network errors) | Partial results are kept — sync completes with whatever was fetched before the failure. |
| **Per-media enrichment** | `GET /{media-id}` fails with permission errors for hashtag-sourced IDs | We do not fetch media details in a second pass; all fields must come from the hashtag media list endpoint. |
| **Token type matters** | App ID\|App Secret pairs fail with permission errors | Must use the Instagram **page access token** (`EAAM…`) from `requrirements.md`. |

**Practical outcome:** a typical sync ingests **1 top item** and **up to ~40–500 recent items** (depending on Meta response and `SYNC_MAX_ITEMS`), not a full 500 for both endpoints.

### Database & API design

| Decision | What we did | Why / production alternative |
|----------|-------------|------------------------------|
| **Cursor pagination only** | `GET /hashtags` uses `cursor` + `limit`; no offset | Stable under concurrent inserts; better index use. Offset pagination is omitted intentionally. |
| **Metadata field selection** | Store media ID, type, caption, URL, permalink, counts, timestamps, source, stored asset path | Balances assignment suggestions with what the API reliably returns. Caption may be omitted if Meta rejects large payloads (compact field fallback). |
| **Sync run audit table** | `sync_runs` tracks status, counts, and errors per job | Useful for debugging; production would add metrics/alerting on top. |
| **Migrations on startup** | Docker entrypoint runs `npm run migrate` before the app | Convenient for demos. Production often runs migrations as a separate deploy step. |

### Testing & coverage

| Decision | What we did | Why / production alternative |
|----------|-------------|------------------------------|
| **Mocked Meta in unit tests** | HTTP responses are stubbed; no live API in CI | Deterministic and fast. A staging smoke test against real Meta would run in a gated pipeline. |
| **Integration tests need Postgres** | Jest `globalSetup` runs migrations against `TEST_DATABASE_URL` | Validates repositories and API against a real DB. CI would provision Postgres as a service container. |
| **No ≥80% coverage gate in CI** | Tests exist across layers but no enforced coverage threshold in this repo | Phase 7 target; add `jest --coverage` to CI when ready. |

### AI-assisted development

Architecture, scaffolding, and much of the implementation were written with **Cursor** (see **ai-usage**). All design decisions, Meta API behavior, Docker setup, and test results were reviewed and validated manually against the running system.

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
