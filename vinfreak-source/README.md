# VINFREAK - Full Project Guide

VINFREAK is a full-stack marketplace for enthusiast car listings. It ingests third-party feeds, normalizes and enriches them, exposes JSON APIs, serves a React SPA, and ships an audit-focused admin console.

## What the platform delivers
- Aggregates and cleans listings; canonicalizes make/model/dealership; enriches geo data; deduplicates by VIN/lot.
- Public read API with deep filtering, text search, VIN/lot lookup, pagination, and sorting.
- React SPA for searching/filtering, browsing cards, detailed listing pages, comments, and likes behind a soft password gate.
- Admin console for inventory, imports, logos, dealerships, comments, site settings, AI commenter, and audit trails.

## Architecture at a glance
- **Backend (`backend/`):** FastAPI + SQLModel; HTML admin views/templates; session middleware + CSRF helpers; importers; Slack/Grok integrations; optional static frontend hosting.
- **Frontend (`frontend/`):** React 18 + Vite SPA; API helper; pages/components/toasts; built assets can be served by the backend fallback.
- **Database:** SQL (Postgres in production; SQLite supported locally/tests).
- **Imports/Tasks:** JSON normalization utilities and CLI wrappers for bulk ingestion; price updater and Grok/Neurowraith integrations.

## Production Server Map (Render)
Use this section as the single source of truth for service names/links.

| Service | Purpose | Current URL/Host | Notes |
| --- | --- | --- | --- |
| `backend` (web) | Main app (public API + admin pages in monolith mode) | `https://vinfreak.com` (custom), fallback `https://vinfreak.onrender.com` | Start command: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT` |
| `admin` (optional split service) | Separate admin runtime when deployed independently | `https://admin.vinfreak.com` | If this is split out, point Slack run/help/stats commands to this host so `/admin/jobs` matches that runtime |
| `api` (optional split service) | Separate public API runtime | service-specific | Start command: `uvicorn backend.api.app:app --host 0.0.0.0 --port $PORT` |
| `vinfreak-scraper-worker-celery` | Celery background worker | no public URL | Start command: `celery -A backend.integrations.job_tasks:celery_app worker --loglevel=info --pool=prefork --concurrency=1` |
| `redis-vinfreak` | Redis broker/cache | `redis-vinfreak:6379` (private network) | Internal-only host used by app + worker |
| NeuroWraith remote (if used) | Remote spider API | `https://neurowraith-dev.onrender.com` | Used when `NEUROWRATH_MODE=remote` |

Known in-code defaults tied to hosts:
- `frontend/src/api.js` defaults API base to `https://vinfreak.onrender.com`.
- `frontend/src/api.js` defaults admin base to `https://admin.vinfreak.com`.
- `backend/backend_settings.py` default admin redirect host includes `backend-vinfreak-prod.onrender.com`.

## Repository layout
| Path | Purpose |
| --- | --- |
| `backend/` | FastAPI app, models, admin templates, integrations, utils, importers. |
| `frontend/` | React SPA (pages, components, assets, Vite config). |
| `migrations/` | SQL migrations for geo/index maintenance. |
| `scripts/` | Maintenance helpers (e.g., location updates). |
| `tests/` | Pytest suite for API/admin/normalization. |
| `import_cars.py` | Thin CLI wrapper for bulk imports. |

## Access control model
- **API token:** `/api` routes require a shared token via `X-API-Token` (or `Authorization: Bearer`). Configure with `API_TOKEN`.
- **Soft SPA gate:** Frontend verifies a shared password at `/public/site-password`; versioned token stored in `localStorage`.
- **Admin/dealer Basic:** `/admin` + dealer portal routes are additionally gated when `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` (or agent Basic) are set.
- **Admin auth:** Admins log in at `/admin/login` using env-driven `ADMIN_USER` / `ADMIN_PASS`; sessions are signed with `SECRET_KEY` and include CSRF tokens.

## Data model (core entities)
- `Make`, `Model`, `Category`
- `Dealership` (metadata, logo)
- `Car` (VIN, lot_number, pricing, mileage, status, specs, geo, seller info, images, source, soft delete)
- `CarImport`, `CarImportUndo` (ingest tracking, cascade delete)
- `NeuroWraithRun` (external ingestion runs)
- `CarLike`, `Comment`, `CommentBlocklist`, `CommentReaction` (engagement + moderation)
- Site settings/uploads for branding

## Public API (essential routes)
All require an API token. Base path is `/api`.

| Method & Path | Description |
| --- | --- |
| `GET /cars` | Paginated inventory with filtering/sorting. Query params: `page`, `page_size`, `q`, `vin`, `lot_number`, `make`, `model`, `dealership_id`, `year_min`/`year_max`, `price_min`/`price_max`, `mileage_min`/`mileage_max`, `body_type`, `drivetrain`, `transmission`, `exterior_color`, `status`, `sort` (`relevance`/`price`/`year`/`mileage`), location filters. Returns `{items, total, page, page_size}`; normalizes records; flips expired auctions to `SOLD` on fetch. |
| `GET /cars/{id_or_vin_or_lot}` | Fetch single listing by numeric ID, VIN, or lot; includes dealership/make metadata. |
| `GET /dealerships` | Dealership list (id, name, logo URL). |
| `GET /makes` | Makes with canonical names, logos, aggregated counts. |
| `GET /public/settings` | Public site chrome (title, theme, default page size, contact email, curated filters). |
| `GET /cars/{car_id}/comments` | Approved comments + count for a listing. |
| `POST /cars/{car_id}/comments` | Submit a comment (display name, optional email, body, optional parent_id); subject to moderation/blocklist/AI commenter. |
| `POST /cars/{car_id}/likes` | Toggle or create a like for a listing. |
| `GET /cars/{car_id}/comments/count` | Lightweight comment count. |
| `POST /integrations/facebook/marketplace/import` | Authorized Marketplace ingestion endpoint. Accepts inline `listings` or fetches from configured `FACEBOOK_MARKETPLACE_FEED_URL`; normalizes and upserts into inventory. |

Example:
```bash
curl -H "X-API-Token: $API_TOKEN" \
  "https://your-api.example.com/api/cars?page=1&page_size=12&make=Porsche&sort=price"
```

## Admin console (areas)
- **Dashboard:** Flash messages, CSRF setup, quick links.
- **Car logos:** Upload/update/delete logos; canonicalize names; re-evaluate matches.
- **Dealerships:** CRUD with logos and audit logging.
- **Inventory (`/admin/cars`):** Filters, bulk status updates, bulk dealership assignment, CSV export, soft delete, auto-refresh for auction status/make normalization.
- **Car editor:** Full form, image uploads, make/model guarantees, CSRF, audit snapshots.
- **Imports:** Upload JSON arrays; normalize, dedupe by VIN, infer dealerships, attach to `car_imports`; Neurowraith ingestion; cascading delete of imports.
- **Facebook Marketplace:** Admin UI at `/admin/facebook-marketplace` to run authorized Marketplace imports with feed/token or pasted listing JSON; includes built-in make/model search presets plus custom brand+model presets you can add from the page.
- **Site settings:** Theme, branding assets, default pagination, maintenance banner, contact email, curated make filters; upload cleanup.
- **Comments:** Moderation, blocklist, AI commenter review.
- **Seed tool:** Populate demo cars into an empty DB.

## Importing data
- **Normalization helper:** `backend/import_from_json.py` converts third-party dumps to canonical car schema (VIN, pricing, drivetrain/body, seller info, highlights, deduped images, lot extraction).
- **Bulk CLI:** `backend/import_cars.py` or root `import_cars.py` posts to `/cars/bulk`; flags for default make/source, chunking, cached make lookups.

Example:
```bash
python import_cars.py --file cars.json --default-make Porsche --source neurowraith
```

## Frontend experience
- **Home/search:** Brand filters, text search, facets (dealership, drivetrain, body, color, transmission), price/year sliders, sort, responsive grid with skeletons, pagination, KPI chips.
- **Car detail:** Hero media, dealership/source logos, auction countdown, price/mileage/location stats, spec grid (VIN copy), galleries, highlights/equipment/modifications/flaws/service/notes, comments modal, likes.
- **Access gate:** Soft password flow hits `/public/site-password` and stores a versioned token locally.
- **Toasts & error boundary:** Global toast context for network/clipboard feedback; SPA error guard.

## Local development
Backend  
1) `python -m venv .venv && ./.venv/Scripts/activate` (Windows) or `source .venv/bin/activate` (POSIX)  
2) `pip install -r backend/requirements.txt`  
3) Export env vars (see below).  
4) `uvicorn backend.app:app --reload`

Frontend  
1) `cd frontend`  
2) `npm install`  
3) `npm run dev` (honors `VITE_API_BASE`; otherwise uses the built-in default API URL)

Key environment variables (backend)
- `DATABASE_URL` / `ADMIN_DATABASE_URL`
- `APP_ENV`, `ALLOW_INSECURE_DEFAULTS`
- `ADMIN_USER` / `ADMIN_PASS`
- `SECRET_KEY`
- `API_TOKEN`, `API_TOKEN_HEADER`
- `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD`
- `AGENT_BASIC_AUTH_USERNAME` / `AGENT_BASIC_AUTH_PASSWORD`
- `UPLOAD_DIR`, `ASSETS_BASE_URL`
- `UPLOAD_MAX_BYTES`, `UPLOAD_ALLOWED_MIME_TYPES`
- `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS`
- `GROK_API_KEY`, `GROK_MODEL`, `GROK_TIMEOUT_SECONDS`, `GROK_MAX_RETRIES`, `GROK_RETRY_DELAY_SECONDS`
- `SLACK_WEBHOOK_URL`, `SLACK_CAR_ALERT_CHANNEL`
- `SLACK_COMMAND_SIGNING_SECRET` (preferred) or `SLACK_COMMAND_VERIFICATION_TOKEN` (legacy fallback)
- `SLACK_BOT_TOKEN` (optional, enables full threaded slash-command job reports)
- `SLACK_ALERTS_ENABLED`, `SLACK_ALERT_WEBHOOK_URL`, `SLACK_ALERT_CHANNEL`
- `NEUROAI_BASE_URL`, `NEUROAI_USERNAME`, `NEUROAI_PASSWORD`, `NEUROAI_REQUEST_TIMEOUT_SECONDS`, `NEUROAI_MAX_URLS_PER_REQUEST`
- `NEUROWRATH_MODE` (`remote`, `local`, or `auto`)
- `NEUROWRATH_API_BASE_URL`, `NEUROWRATH_USERNAME`, `NEUROWRATH_PASSWORD`
- `NEUROWRATH_LOCAL_BASE_DIR`, `NEUROWRATH_LOCAL_SCRAPY_BIN`, `NEUROWRATH_LOCAL_PYTHON`
- `NEUROWRATH_LOCAL_FALLBACK_TO_REMOTE`
- `NEUROWRATH_SCHEDULER_ENABLED`
- `NEUROWRATH_CRON_TOKEN`
- `BACKGROUND_JOB_BACKEND` (`thread` default, or `celery`)
- `REDIS_URL` (used by cache and as Celery broker fallback)
- `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `CELERY_TASK_TRACK_STARTED`, `CELERY_TASK_ALWAYS_EAGER`
- `CELERY_WORKER_POOL` (`solo` default; production workers should use `prefork`), `CELERY_WORKER_CONCURRENCY` (`1` default)
- `CELERY_WORKER_MAX_TASKS_PER_CHILD` (`50` default), `CELERY_WORKER_MAX_MEMORY_PER_CHILD_KB` (`0` disables memory cap)
- `PYTHON_VERSION` (Render runtime pin; use `3.12.8` in production services)

NeuroWraith local folder note:
- `NEUROWRATH_MODE=auto` will use local scrapers when `NEUROWRATH_LOCAL_BASE_DIR` exists and has `spiders/spider_config.json`, otherwise it falls back to remote API.
- This allows `neurowraith/` to live outside the git repo (for example on a mounted path) while keeping admin integration working.
- `FACEBOOK_MARKETPLACE_IMPORT_ENABLED`, `FACEBOOK_MARKETPLACE_FEED_URL`, `FACEBOOK_MARKETPLACE_ACCESS_TOKEN`, `FACEBOOK_MARKETPLACE_TIMEOUT_SECONDS`
- `FACEBOOK_MARKETPLACE_SESSION_COOKIE`, `FACEBOOK_MARKETPLACE_USER_AGENT`
- `FACEBOOK_MARKETPLACE_GRAPHQL_DOC_ID`, `FACEBOOK_MARKETPLACE_GRAPHQL_FRIENDLY_NAME`
- `FACEBOOK_MARKETPLACE_FB_DTSG`, `FACEBOOK_MARKETPLACE_LSD`, `FACEBOOK_MARKETPLACE_JAZOEST`, `FACEBOOK_MARKETPLACE_ASBD_ID`
- `FACEBOOK_MARKETPLACE_GRAPHQL_FORM_FIELDS`, `FACEBOOK_MARKETPLACE_GRAPHQL_HEADERS`
- `FACEBOOK_MARKETPLACE_DEFAULT_QUERY`, `FACEBOOK_MARKETPLACE_DEFAULT_CATEGORY_ID`, `FACEBOOK_MARKETPLACE_DEFAULT_LATITUDE`, `FACEBOOK_MARKETPLACE_DEFAULT_LONGITUDE`, `FACEBOOK_MARKETPLACE_DEFAULT_RADIUS_KM`
- `FACEBOOK_MARKETPLACE_DEFAULT_LOCATION_ID` (Marketplace location slug/id used by search URL fallback)

Frontend
- `VITE_API_BASE` - override API origin for local dev/tests.

## Running tests
- Backend: `python -m pytest`
- Frontend utils/components: `npm --prefix frontend test`
- Frontend build: `npm --prefix frontend run build`

## CI
- GitHub Actions workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Triggered on pushes to `main` and all pull requests.
- Runs:
  - Backend dependency install + `pytest -q`
  - Frontend dependency install + `npm test` + `npm run build`

## Facebook Marketplace hardening checklist
- Run focused Marketplace tests before release:
  - `python -m pytest tests/test_facebook_marketplace_import.py tests/test_admin_facebook_marketplace.py -q`
- Run image repair in dry-run first:
  - `python scripts/repair_facebook_marketplace_images.py --limit 100`
- If dry-run looks correct, apply:
  - `python scripts/repair_facebook_marketplace_images.py --limit 100 --apply`
- Verify queue and job health from `/admin/jobs` after each deploy.

## Deployment notes
- FastAPI can serve built SPA assets from `frontend/dist` (see fallback routes near the end of `backend/app.py`).
- Static assets: `/static`; uploads: `/uploads` (ensure writable/protected). Consider offloading uploads to object storage + CDN in production.
- Run behind TLS-terminating proxy; pin allowed hosts; configure CORS if exposing cross-site.

### Render service topology
- Recommended simplest setup:
  - `backend` web service (`uvicorn backend.app:app --host 0.0.0.0 --port $PORT`)
  - `vinfreak-scraper-worker-celery` background worker (Celery)
  - `redis-vinfreak` (private Redis)
- Optional split setup:
  - `admin` web service: `uvicorn backend.admin.app:app --host 0.0.0.0 --port $PORT`
  - `api` web service: `uvicorn backend.api.app:app --host 0.0.0.0 --port $PORT`
  - Keep Celery/Redis env aligned across any service that can queue jobs.

### Optional Celery + Redis workers (recommended for durable jobs)
- Use this if you want background imports to survive web server restarts and retry via queue workers.
- Update env on the web app service that receives job requests (`backend`, and `admin`/`api` too if they can queue jobs):
  - `BACKGROUND_JOB_BACKEND=celery`
  - `REDIS_URL=redis://redis-vinfreak:6379`
  - Optional: `CELERY_BROKER_URL=redis://redis-vinfreak:6379`
  - Optional: `CELERY_RESULT_BACKEND=redis://redis-vinfreak:6379`
- Create a Render background worker service named `vinfreak-scraper-worker-celery`.
- Worker Render settings:
  - Region: same as backend + Redis
  - Root directory: leave blank
  - Build command: `pip install -r backend/requirements.txt`
  - Start command: `celery -A backend.integrations.job_tasks:celery_app worker --loglevel=info --pool=prefork --concurrency=1`
  - Env: copy backend envs (`DATABASE_URL`, `ADMIN_DATABASE_URL`, `SECRET_KEY`, scraper creds, Slack creds) and add the Celery/Redis vars above
- Pin Python on both web + worker to avoid build failures with `pydantic-core` on 3.14:
  - `PYTHON_VERSION=3.12.8`
- Start API server as usual.
- Worker command (for non-Render environments):

```bash
celery -A backend.integrations.job_tasks:celery_app worker --loglevel=info --pool=prefork --concurrency=1
```

- Queue routing:
  - NeuroWraith jobs are published to the `neurowraith` queue.
  - Facebook Marketplace jobs are published to the `facebook_marketplace` queue.
  - A worker started without `-Q` will consume all configured queues.
  - A dedicated NeuroWraith worker can be isolated with:

```bash
celery -A backend.integrations.job_tasks:celery_app worker --loglevel=info --pool=prefork --concurrency=1 -Q neurowraith
```

  - If you isolate NeuroWraith with `-Q neurowraith`, run a second worker for Facebook Marketplace:

```bash
celery -A backend.integrations.job_tasks:celery_app worker --loglevel=info --pool=prefork --concurrency=1 -Q facebook_marketplace
```

- Keep fallback safety: if Celery is unavailable/misconfigured, app falls back to in-process thread workers.
- Runtime visibility:
  - `/admin/jobs` shows queue backend summary plus per-job status/messages/results.
  - Slack `/run status` includes a `Background jobs` line (`threads` or `celery + redis`).

### External cron runner (recommended for remote Neurowraith)
- Keep scrapers on the separate NeuroWraith server and let cron trigger VinFreak import runs.
- In VinFreak env set:
  - `NEUROWRATH_MODE=remote`
  - `NEUROWRATH_API_BASE_URL`, `NEUROWRATH_USERNAME`, `NEUROWRATH_PASSWORD`
  - `NEUROWRATH_SCHEDULER_ENABLED=false`
  - `NEUROWRATH_CRON_TOKEN=<strong-random-token>`
- Configure source toggles/limits in `/admin/neurowraith`.
- On the cron server use `scripts/trigger_neurowraith_cron.py`:

```bash
export VINFREAK_NEUROWRATH_CRON_URL="https://your-vinfreak-domain/internal/neurowraith/cron"
export VINFREAK_NEUROWRATH_CRON_TOKEN="your-strong-token"
python scripts/trigger_neurowraith_cron.py --verbose
```

Example crontab (every 15 minutes):

```cron
*/15 * * * * cd /path/to/vinfreakdev && /usr/bin/python3 scripts/trigger_neurowraith_cron.py >> /var/log/vinfreak-neurowraith-cron.log 2>&1
```

Health-gated variant (checks Neurowraith `/spiders` after login before triggering import):

```bash
export NEUROWRATH_API_BASE_URL="https://your-neurowraith-domain"
export NEUROWRATH_USERNAME="your-neurowraith-user"
export NEUROWRATH_PASSWORD="your-neurowraith-pass"
export VINFREAK_NEUROWRATH_CRON_URL="https://your-vinfreak-domain/internal/neurowraith/cron"
export VINFREAK_NEUROWRATH_CRON_TOKEN="your-strong-token"
python scripts/trigger_neurowraith_with_health.py --require-spiders bringatrailer,carsandbids --verbose
```

Health-gated crontab example:

```cron
*/15 * * * * cd /path/to/vinfreakdev && /usr/bin/python3 scripts/trigger_neurowraith_with_health.py --require-spiders bringatrailer,carsandbids >> /var/log/vinfreak-neurowraith-health-cron.log 2>&1
```

### Slack ops commands and alerts
- Endpoints:
  - `POST /api/integrations/slack/commands/run`
  - `POST /api/integrations/slack/commands/help`
  - `POST /api/integrations/slack/commands/stats`
- Recommended Slack slash commands:
  - `/run` -> `https://your-domain/api/integrations/slack/commands/run`
  - `/help` -> `https://your-domain/api/integrations/slack/commands/help`
  - `/stats` -> `https://your-domain/api/integrations/slack/commands/stats`
- If your `/admin/jobs` UI runs on a separate admin service/runtime, point Slack slash commands to that same host (for example `https://admin.vinfreak.com/api/integrations/slack/commands/run`) so live in-memory job rows are visible in that UI.
- Required env:
  - `SLACK_COMMAND_SIGNING_SECRET` (from Slack app "Signing Secret")
  - Optional fallback: `SLACK_COMMAND_VERIFICATION_TOKEN`
  - Optional: `SLACK_BOT_TOKEN` if you want full job reports posted as threaded Slack messages instead of limited `response_url` follow-ups
  - Optional: `NEUROWRATH_MANUAL_IMPORT_TIMEOUT_SECONDS` (applies to manual runs with explicit numeric limits)
- Recommended Slack bot scopes for full reports:
  - `chat:write`
  - `chat:write.public` if you want the app to post report threads into public channels without manually inviting the bot first
- Optional ops alert env:
  - `SLACK_ALERTS_ENABLED=true` (default true)
  - `SLACK_ALERT_WEBHOOK_URL` (if missing, falls back to `SLACK_WEBHOOK_URL`)
  - `SLACK_ALERT_CHANNEL` (optional override channel)
- Command examples:
  - `/help`
  - `/stats`
  - `/stats bat`
  - `/stats c&b`
  - `/stats dealership=BringATrailer`
  - `/run status`
  - `/run active` (latest active listings across all sources)
  - `/run active bat 25` (active Bring A Trailer listings)
  - `/run active dealership=BringATrailer 25` (active listings for one dealership)
  - `/run active bat dealership=BringATrailer 25` (combine source + dealership filters)
  - `/run facebook`
  - `/run facebook 50`
  - `/run facebook Ferrari F40 --limit 50`
  - `/run fbm --query "Porsche 911 GT3" --limit 50`
  - `/run all`
  - `/run bat 20` (Bring A Trailer)
  - `/run c&b 20` (Cars & Bids)
- For Facebook Marketplace runs:
  - `/run facebook` or `/run facebook <limit>` uses saved Brand/Model presets and cycles searches across US state centroids (instead of broad random `Vehicles` search).
  - Query can still be provided as free text after `facebook` or via `--query` / `query=` (for example `/run facebook Ferrari 488 Pista --limit 40`).
  - Slack Facebook runs are tracked as background jobs and appear in `/admin/jobs` and FreakOps active jobs, with Celery queue usage when enabled.
- For NeuroWraith sources, omitting `limit` (for example `/run bat`) now means "fetch until source is exhausted" and disables the importer timeout for that run.
- The endpoint responds quickly, then runs imports in the background and posts final result back to Slack via `response_url`.
- Server-side `5xx` errors are posted to Slack ops alerts with admin dashboard links when alerts are enabled.

### Cron-worker push migration (run spiders on cron server, push into VinFreak)
- Use this when you want to retire the remote NeuroWraith API server and run scrapers directly on a worker host.
- VinFreak only receives listings via secure internal endpoint:
  - `POST /internal/neurowraith/import` (header `X-NeuroWraith-Cron-Token`)
- VinFreak env:
  - `NEUROWRATH_SCHEDULER_ENABLED=false`
  - `NEUROWRATH_CRON_TOKEN=<strong-random-token>`
- Cron worker env:
  - `NEUROWRATH_LOCAL_BASE_DIR=/path/to/neurowraith`
  - `VINFREAK_NEUROWRATH_IMPORT_URL=https://your-vinfreak-domain/internal/neurowraith/import`
  - `VINFREAK_NEUROWRATH_CRON_TOKEN=<same-strong-token>`
  - `VINFREAK_NEUROWRATH_PUSH_SOURCES=bringatrailer:25,carsandbids:25`

Run manually:

```bash
python scripts/push_neurowraith_to_vinfreak.py --continue-on-error --verbose
```

Crontab example:

```cron
*/15 * * * * cd /path/to/vinfreakdev && /usr/bin/python3 scripts/push_neurowraith_to_vinfreak.py --continue-on-error >> /var/log/vinfreak-neurowraith-push.log 2>&1
```

## Security checklist
- Move all secrets to environment/config; rotate any placeholders or checked-in values before shipping.
- Use strong Basic/Admin credentials; rotate the SPA gate password; set `SECRET_KEY` per environment.
- Enable HTTPS everywhere; rate-limit auth/comment endpoints; restrict admin access (IP or identity provider) where possible.
- Monitor error and auth-failure alerts (Slack/Sentry/metrics) and keep audit logs immutable.

## Contact & maintenance
- Maintenance scripts live in `scripts/`.
- Verification commands run most recently are in `CHECKS.md`.
