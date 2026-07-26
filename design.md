# Hashtag Tracker — Design Document

## 1. Understanding

### 1.1 Problem Statement

Build an Instagram hashtag media ingestion pipeline for the hashtag **`matcha`**. The system must:

1. Pull media from Meta Graph API (`top_media` and `recent_media`).
2. Persist metadata in **Postgres** (via migrations).
3. Download media assets and store them in **local file storage** (abstracted for future S3).
4. Deduplicate media across syncs.
5. Expose a single **paginated read API** (`GET /hashtags`) ordered by creation time (newest first).

### 1.2 Constraints & Expectations

| Area | Requirement |
|------|-------------|
| Stack | Express, TypeScript, Postgres |
| Deployment | Docker Compose (`app` + `postgres` services) |
| Queue | In-memory (swappable → SQS) |
| Scheduler | `node-cron` inside `app` container (swappable → EventBridge) — **not OS crontab** |
| Storage | Local filesystem (swappable → S3) |
| Pagination | Meta API is paginated; handle up to **500 items per sync** |
| Sync cadence | **Top media** on startup; **recent media** every **3 hours** |
| API | One endpoint: `GET /hashtags` with cursor/offset pagination |
| Quality bar | Clean architecture, engineering judgment — not production-hardened |

### 1.3 Meta API Flow

```
1. ig_hashtag_search(q=matcha)  →  hashtag_id
2. {hashtag_id}/top_media       →  paginated media (initial sync)
3. {hashtag_id}/recent_media    →  paginated media (periodic sync)
```

Each media item includes (at minimum): `id`, `media_type`, `timestamp`, `permalink`, `media_url`, `caption`, `like_count`, `comments_count`.

### 1.4 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Upsert on `instagram_media_id`** | Primary dedup key; Meta IDs are globally unique |
| **Separate `sync_runs` table** | Audit trail, debugging, idempotency tracking |
| **Abstract interfaces for Queue, Storage, Scheduler** | Enables drop-in AWS replacements without rewriting business logic |
| **Job-based ingestion** | Decouple cron/API triggers from long-running fetch+store work |
| **Store `stored_asset_path` not raw binary in DB** | Keeps Postgres lean; assets live in storage layer |
| **Cursor-based API pagination** | Stable under concurrent inserts; better than offset for large datasets |
| **Env-based credentials** | Never commit tokens; requirements token goes in `.env` |

---

## 2. Modules

```
src/
├── config/                 # Env validation, constants
├── db/
│   ├── migrations/         # SQL migration files
│   ├── client.ts           # Postgres pool / connection
│   └── repositories/       # Data access layer
├── integrations/
│   └── meta/               # Meta Graph API client
├── services/
│   ├── hashtag.service.ts  # Hashtag lookup & resolution
│   ├── ingestion.service.ts# Orchestrates fetch → store → asset upload
│   ├── media.service.ts    # Query stored media for API
│   └── asset.service.ts    # Download from Meta URL → upload to storage
├── infrastructure/
│   ├── queue/
│   │   ├── queue.interface.ts
│   │   └── in-memory.queue.ts
│   ├── storage/
│   │   ├── storage.interface.ts
│   │   └── local.storage.ts
│   └── scheduler/
│       ├── scheduler.interface.ts
│       └── cron.scheduler.ts
├── jobs/
│   ├── job.types.ts
│   ├── sync-top-media.job.ts
│   └── sync-recent-media.job.ts
├── workers/
│   └── queue.worker.ts     # Processes queued jobs
├── api/
│   ├── routes/
│   │   └── hashtags.routes.ts
│   ├── middleware/
│   │   ├── error-handler.ts
│   │   └── validate-pagination.ts
│   └── app.ts
├── types/                  # Shared domain types
└── index.ts                # Bootstrap: DB, queue, cron, Express
```

### 2.1 Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| **config** | Load & validate env vars (`DATABASE_URL`, Meta tokens, storage path) |
| **db / migrations** | Schema versioning; create tables via migration runner (e.g. `node-pg-migrate`) |
| **db / repositories** | CRUD for hashtags, media, sync runs; upsert logic |
| **integrations/meta** | HTTP client for hashtag search, top_media, recent_media with pagination |
| **services/ingestion** | End-to-end sync: paginate Meta → dedupe → persist metadata → enqueue asset jobs |
| **services/asset** | Fetch `media_url` → save to local storage → update `stored_asset_path` |
| **services/media** | Read path for API: paginated query with filters |
| **infrastructure/queue** | Enqueue/dequeue job payloads; in-memory impl with interface |
| **infrastructure/storage** | `upload(buffer, key)`, `getUrl(key)`; local dir impl |
| **infrastructure/scheduler** | Register cron expressions; trigger job enqueue |
| **jobs** | Typed handlers for `SYNC_TOP_HASHTAG_MEDIA` and `SYNC_RECENT_HASHTAG_MEDIA` |
| **workers/queue.worker** | Poll queue, dispatch to job handlers |
| **api** | Express routes, validation, error responses |

---

## 3. Block Diagram

### 3.1 System Context

```mermaid
flowchart TB
    subgraph External
        META[Meta Graph API]
        CLIENT[API Client]
    end

    subgraph HashtagTracker["Hashtag Tracker (Express + TS)"]
        API[API Layer<br/>GET /hashtags]
        CRON[Cron Scheduler<br/>every 3h]
        QUEUE[In-Memory Queue]
        WORKER[Queue Worker]
        INGEST[Ingestion Service]
        ASSET[Asset Service]
        META_CLIENT[Meta Client]
        REPO[Repositories]
    end

    subgraph Persistence
        PG[(Postgres)]
        FS[Local File Storage]
    end

    CLIENT --> API
    API --> REPO
    REPO --> PG

    CRON -->|enqueue SYNC_RECENT| QUEUE
    BOOT[App Startup] -->|enqueue SYNC_TOP| QUEUE

    QUEUE --> WORKER
    WORKER --> INGEST
    INGEST --> META_CLIENT
    META_CLIENT --> META
    INGEST --> REPO
    INGEST --> ASSET
    ASSET --> META
    ASSET --> FS
    ASSET --> REPO
```

### 3.2 Ingestion Pipeline (Single Sync Job)

```mermaid
flowchart LR
    A[Job Dequeued] --> B[Resolve Hashtag ID]
    B --> C[Fetch Page from Meta]
    C --> D{More pages?<br/>max 500 items}
    D -->|yes| C
    D -->|no| E[For each media item]
    E --> F{Exists in DB?}
    F -->|yes| G[Skip / update metrics]
    F -->|no| H[Insert metadata]
    H --> I[Download media_url]
    I --> J[Upload to storage]
    J --> K[Update stored_asset_path]
    G --> L[Record sync_run stats]
    K --> L
    L --> M[Done]
```

### 3.3 Layered Architecture

```mermaid
flowchart TB
    subgraph Presentation
        R[Routes + Middleware]
    end
    subgraph Application
        SVC[Services + Jobs + Worker]
    end
    subgraph Domain
        T[Types + Interfaces]
    end
    subgraph Infrastructure
        DB[Postgres Repos]
        Q[Queue]
        ST[Storage]
        SC[Scheduler]
        MC[Meta Client]
    end

    R --> SVC
    SVC --> T
    SVC --> DB
    SVC --> Q
    SVC --> ST
    SVC --> SC
    SVC --> MC
```

---

## 4. Database Schema

### 4.1 ER Diagram

```mermaid
erDiagram
    hashtags {
        uuid id PK
        varchar name UK "e.g. matcha"
        varchar instagram_hashtag_id UK
        timestamptz created_at
        timestamptz updated_at
    }

    media {
        uuid id PK
        varchar instagram_media_id UK
        uuid hashtag_id FK
        varchar media_type "IMAGE, VIDEO, CAROUSEL_ALBUM"
        text caption
        text permalink
        text media_url "original Meta CDN URL"
        text stored_asset_path "local/S3 key, nullable until downloaded"
        int like_count
        int comments_count
        timestamptz instagram_timestamp
        varchar source "top | recent"
        timestamptz created_at
        timestamptz updated_at
    }

    sync_runs {
        uuid id PK
        uuid hashtag_id FK
        varchar sync_type "top | recent"
        varchar status "pending | running | completed | failed"
        int items_fetched
        int items_inserted
        int items_skipped
        int items_failed
        text error_message
        timestamptz started_at
        timestamptz completed_at
        timestamptz created_at
    }

    hashtags ||--o{ media : has
    hashtags ||--o{ sync_runs : tracks
```

### 4.2 Table Definitions

#### `hashtags`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | Internal ID |
| `name` | `VARCHAR(255) UNIQUE NOT NULL` | Display name: `matcha` |
| `instagram_hashtag_id` | `VARCHAR(64) UNIQUE NOT NULL` | From Meta search API |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

#### `media`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | Internal ID |
| `instagram_media_id` | `VARCHAR(64) UNIQUE NOT NULL` | **Dedup key** |
| `hashtag_id` | `UUID FK → hashtags` | |
| `media_type` | `VARCHAR(32)` | IMAGE, VIDEO, etc. |
| `caption` | `TEXT` | Nullable |
| `permalink` | `TEXT` | Instagram post URL |
| `media_url` | `TEXT` | Original CDN URL (may expire) |
| `stored_asset_path` | `TEXT` | Path/key in storage; null until asset job completes |
| `like_count` | `INTEGER DEFAULT 0` | Updated on re-sync if item exists |
| `comments_count` | `INTEGER DEFAULT 0` | Updated on re-sync |
| `instagram_timestamp` | `TIMESTAMPTZ` | When posted on Instagram |
| `source` | `VARCHAR(16)` | `top` or `recent` — first seen via |
| `created_at` | `TIMESTAMPTZ` | **API sort key** (insert time) |
| `updated_at` | `TIMESTAMPTZ` | |

**Indexes:**
- `UNIQUE (instagram_media_id)` — deduplication
- `INDEX (hashtag_id, created_at DESC)` — API pagination
- `INDEX (hashtag_id, instagram_timestamp DESC)` — optional analytics

#### `sync_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `hashtag_id` | `UUID FK` | |
| `sync_type` | `VARCHAR(16)` | `top` \| `recent` |
| `status` | `VARCHAR(16)` | Job lifecycle |
| `items_fetched` | `INTEGER DEFAULT 0` | |
| `items_inserted` | `INTEGER DEFAULT 0` | |
| `items_skipped` | `INTEGER DEFAULT 0` | Duplicates |
| `items_failed` | `INTEGER DEFAULT 0` | Asset download failures |
| `error_message` | `TEXT` | Nullable |
| `started_at` | `TIMESTAMPTZ` | |
| `completed_at` | `TIMESTAMPTZ` | |
| `created_at` | `TIMESTAMPTZ` | |

### 4.3 Fields Intentionally Excluded

| Meta Field | Reason |
|------------|--------|
| Owner/username | Not in requested fields; adds privacy/complexity |
| Thumbnail URL | Redundant if we store full asset |
| Hashtag edges | Single-hashtag scope for this project |
| Raw JSON blob | Prefer typed columns; easier querying |

---

## 5. API Design

### `GET /hashtags`

Returns stored media for the tracked hashtag, newest first (`created_at DESC`).

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 20 | Page size (max 100) |
| `cursor` | string | — | Opaque cursor (base64-encoded `created_at` + `id`) |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "instagramMediaId": "1789...",
      "mediaType": "IMAGE",
      "caption": "...",
      "permalink": "https://instagram.com/p/...",
      "mediaUrl": "https://...",
      "storedAssetPath": "/storage/matcha/1789....jpg",
      "likeCount": 42,
      "commentsCount": 3,
      "instagramTimestamp": "2026-01-15T10:00:00Z",
      "source": "recent",
      "createdAt": "2026-01-15T12:00:00Z"
    }
  ],
  "pagination": {
    "nextCursor": "eyJjcmVhdGVkQXQiOi...",
    "hasMore": true
  }
}
```

**Health check (optional):** `GET /health` → `{ "status": "ok" }`

---

## 6. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | Postgres connection string |
| `META_ACCESS_TOKEN` | yes | Instagram page token |
| `META_USER_ID` | yes | Instagram business ID |
| `HASHTAG_NAME` | no | Default: `matcha` |
| `STORAGE_BASE_PATH` | no | Default: `./storage` |
| `PORT` | no | Default: `3000` |
| `SYNC_MAX_ITEMS` | no | Default: `500` |
| `CRON_RECENT_MEDIA` | no | Default: `0 */3 * * *` |

---

## 7. Phased TODO List

### Phase 0 — Project Scaffolding

- [x] Initialize Node project (`package.json`, `tsconfig.json`, ESLint)
- [x] Add dependencies: `express`, `pg`, `node-cron`, `dotenv`, `uuid`, migration tool
- [x] Add dev dependencies: `typescript`, `tsx`, `jest`, `ts-jest`, `@types/*`, `supertest`
- [x] Create folder structure per Section 2
- [x] Add `.env.example` and `.gitignore` (exclude `.env`, `storage/`, `node_modules/`)
- [x] Configure Jest for TypeScript

**Unit tests (Phase 0):**
- [x] Test env config loader validates required vars and applies defaults

---

### Phase 1 — Database Layer

- [x] Set up Postgres connection pool (`db/client.ts`)
- [x] Write migrations: `hashtags`, `media`, `sync_runs` + indexes
- [x] Implement repositories:
  - [x] `HashtagRepository` — find/create by name
  - [x] `MediaRepository` — upsert, findByInstagramId, paginated list
  - [x] `SyncRunRepository` — create, update status, increment counters
- [x] Seed `matcha` hashtag row on first boot (or via migration seed)

**Unit tests (Phase 1):**
- [x] `MediaRepository.upsert` — inserts new, skips duplicate, updates counts on conflict
- [x] `MediaRepository.findPaginated` — correct ordering, cursor pagination, empty results
- [x] `HashtagRepository.findOrCreate` — idempotent create
- [x] `SyncRunRepository` — status transitions and counter updates

*Use test DB or mocked `pg` pool; run migrations in test setup.*

---

### Phase 2 — Infrastructure Abstractions

- [x] Define `QueueInterface` — `enqueue(type, payload)`, `dequeue()`, `process(handler)`
- [x] Implement `InMemoryQueue`
- [x] Define `StorageInterface` — `upload(key, buffer)`, `exists(key)`, `getPath(key)`
- [x] Implement `LocalStorage` (write to `STORAGE_BASE_PATH/{hashtag}/{mediaId}.{ext}`)
- [x] Define `SchedulerInterface` — `schedule(cronExpr, callback)`
- [x] Implement `CronScheduler` wrapping `node-cron`
- [x] Implement `QueueWorker` — poll and dispatch jobs

**Unit tests (Phase 2):**
- [x] `InMemoryQueue` — FIFO order, typed payloads, handler invocation
- [x] `LocalStorage.upload` — creates dirs, writes file, idempotent on same key
- [x] `LocalStorage.getPath` — returns correct absolute path
- [x] `CronScheduler` — registers job (mock `node-cron`)

---

### Phase 3 — Meta Integration

- [x] Implement `MetaClient`:
  - [x] `searchHashtag(name)` → hashtag ID
  - [x] `fetchTopMedia(hashtagId, cursor?)` → page + next cursor
  - [x] `fetchRecentMedia(hashtagId, cursor?)` → page + next cursor
- [x] Handle pagination loop with `SYNC_MAX_ITEMS` cap (500)
- [x] Map API response → domain `MediaItem` type
- [x] Error handling: rate limits, invalid token, network errors

**Unit tests (Phase 3):**
- [x] `MetaClient.searchHashtag` — parses response (mocked HTTP)
- [x] `MetaClient.fetchTopMedia` — single page + multi-page aggregation
- [x] Pagination cap — stops at 500 items
- [x] Error mapping — throws typed errors for 401/429

*Mock `fetch` or use `nock` for HTTP.*

---

### Phase 4 — Ingestion & Asset Pipeline

- [x] Implement `IngestionService.syncTopMedia(hashtagName)`
- [x] Implement `IngestionService.syncRecentMedia(hashtagName)`
- [x] For each fetched item:
  - [x] Upsert metadata (skip if duplicate)
  - [x] Download asset from `media_url`
  - [x] Upload to storage
  - [x] Update `stored_asset_path`
- [x] Record `sync_run` with stats
- [x] Implement job handlers: `SyncTopMediaJob`, `SyncRecentMediaJob`

**Unit tests (Phase 4):**
- [x] `IngestionService` — new items inserted, duplicates skipped, counts updated
- [x] `IngestionService` — sync_run stats match actual inserts/skips
- [x] `AssetService.downloadAndStore` — downloads, stores, returns path (mocked HTTP + storage)
- [x] `AssetService` — handles download failure gracefully (logs, increments failed count)
- [x] Job handlers — correct service method called for each job type

---

### Phase 5 — Scheduler & Bootstrap

- [x] On app startup:
  - [x] Run migrations
  - [x] Resolve/create `matcha` hashtag
  - [x] Start queue worker
  - [x] Enqueue `SYNC_TOP_HASHTAG_MEDIA`
  - [x] Register cron: every 3h enqueue `SYNC_RECENT_HASHTAG_MEDIA`
- [x] Graceful shutdown: stop cron, drain queue

**Unit tests (Phase 5):**
- [x] Bootstrap — enqueues top sync on start (mock queue)
- [x] Cron callback — enqueues recent sync with correct payload

---

### Phase 6 — REST API

- [x] Implement `GET /hashtags` with cursor pagination
- [x] Input validation (limit bounds, cursor format)
- [x] Global error handler middleware
- [x] Optional `GET /health`

**Unit tests (Phase 6):**
- [x] `GET /hashtags` — returns 200 with paginated data (supertest + mocked repo)
- [x] `GET /hashtags?limit=101` — returns 400
- [x] `GET /hashtags?cursor=invalid` — returns 400
- [x] Response ordering — `created_at DESC`

**Integration tests (Phase 6):**
- [x] End-to-end with test DB: insert media → API returns correct page

---

### Phase 7 — Documentation & Polish

- [ ] Fill `instructions.md` — setup, vars, tradeoffs
- [ ] Update `README.md` with project overview
- [ ] Manual smoke test against real Meta API
- [ ] Verify dedup: run sync twice, confirm no duplicate rows
- [ ] Verify cron fires (or trigger manually for demo)

**Unit tests (Phase 7):**
- [ ] Ensure CI script: `npm test` runs all unit tests
- [ ] Target ≥ 80% coverage on services, repositories, and API routes

---

## 8. Testing Strategy Summary

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Jest + ts-jest | Services, repos (mocked DB), queue, storage, Meta client (mocked HTTP) |
| API | Supertest | Route handlers, validation, error responses |
| Integration | Jest + test Postgres | Repository CRUD, API + DB (optional, Phase 6) |

**Principles:**
- Mock external I/O (Meta API, filesystem in unit tests where practical)
- Use deterministic fixtures for Meta API responses
- Each phase ships tests alongside implementation — no deferred test debt
- Repositories tested against real Postgres in integration tests; mocked in service unit tests

---

## 9. Tradeoffs & Shortcuts (Planned)

| Shortcut | Rationale |
|----------|-----------|
| In-memory queue (no persistence) | Acceptable for assignment; jobs re-triggered on restart via cron/startup |
| No retry/backoff for Meta rate limits | Log and fail sync_run; production would add exponential backoff |
| Single hashtag hardcoded | Requirements specify only `matcha` |
| Asset download inline in ingestion | Simpler; production might separate into async asset-only jobs |
| No auth on API | Internal tool scope; production would add API keys |
| Cursor pagination only (no offset) | Better performance; offset param not required |

---

## 10. Future AWS Migration Path

| Local | AWS Replacement | Interface |
|-------|-----------------|-----------|
| In-memory queue | SQS | `QueueInterface` |
| Local filesystem | S3 | `StorageInterface` |
| node-cron | EventBridge + Lambda | `SchedulerInterface` triggers SQS |
| Single Express process | ECS/Fargate or Lambda | Same codebase, different bootstrap |

No business logic changes required — only infrastructure implementations and config.

---

## 11. Docker Deployment

### 11.1 Overview

The application ships with **Docker Compose** defining two services:

| Service | Image | Role |
|---------|-------|------|
| **`app`** | Built from `Dockerfile` | Express API, in-memory queue worker, **`node-cron` scheduler** |
| **`postgres`** | `postgres:14-alpine` | Database |

Scheduling runs **inside the `app` container** via `node-cron`. There is **no OS-level crontab** and **no separate cron container**.

### 11.2 Container Architecture

```mermaid
flowchart TB
    subgraph DockerCompose["Docker Compose"]
        subgraph AppContainer["app container"]
            API[Express API]
            CRON[node-cron scheduler]
            QUEUE[In-Memory Queue]
            WORKER[Queue Worker]
            STORAGE[Local Storage /app/storage]
        end

        subgraph PostgresContainer["postgres container"]
            PG[(Postgres 14)]
        end
    end

    META[Meta Graph API] --> AppContainer
    CRON -->|enqueue every 3h| QUEUE
    QUEUE --> WORKER
    WORKER --> PG
    WORKER --> STORAGE
    API --> PG
    AppContainer -->|DATABASE_URL| PostgresContainer
```

### 11.3 Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: compile TypeScript → production Node 20 Alpine image |
| `docker-compose.yml` | Defines `app` + `postgres`, volumes, health checks, env vars |
| `docker/entrypoint.sh` | Wait for Postgres → run migrations → start app |
| `.dockerignore` | Keeps image lean (excludes tests, git, local storage) |

### 11.4 Startup Sequence (app container)

```
1. entrypoint.sh waits until Postgres accepts connections
2. npm run migrate  (node-pg-migrate)
3. node dist/index.js
   ├── init DB pool
   ├── start queue worker
   ├── register node-cron (CRON_RECENT_MEDIA)
   ├── enqueue SYNC_TOP_HASHTAG_MEDIA on boot
   └── listen on PORT (default 3000)
```

### 11.5 Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `postgres_data` | `/var/lib/postgresql/data` | Persistent database |
| `app_storage` | `/app/storage` | Downloaded media assets |

### 11.6 Docker Setup & Run Steps

```bash
# 1. Clone repo and enter directory
cd Hashtag-Tracker

# 2. Create env file with Meta credentials
cp .env.example .env
# Set META_ACCESS_TOKEN in .env

# 3. Build and start
docker compose up --build

# Detached mode
docker compose up --build -d

# View app logs
docker compose logs -f app

# Stop
docker compose down

# Reset DB + media volumes
docker compose down -v
```

### 11.7 Environment Inside Compose

The `app` service sets `DATABASE_URL` to reach Postgres by **service name**:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/hashtag_tracker
```

Postgres is exposed on host port **5434** (optional, for debugging) to avoid clashing with a local WSL Postgres instance.

### 11.8 Docker vs Local WSL

| | Docker Compose | Local WSL |
|--|----------------|-----------|
| Postgres | `postgres` container | Existing WSL install (e.g. port 5433) |
| Scheduler | `node-cron` in `app` container | `node-cron` in Node process |
| OS crontab | Not used | Not used |
| Best for | Reviewers, reproducible setup | Day-to-day development |
