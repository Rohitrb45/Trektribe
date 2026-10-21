# TrekTribe — first working milestone

TrekTribe is a community-driven social and navigation platform designed for outdoor enthusiasts, hikers, and mountaineers. It bridges the gap between static GPS trail mapping and social networking by allowing adventurers to discover new trails, document real-time conditions, share experiences through media-rich reports, and coordinate group treks.

A mobile-first Expo / React Native application with a NestJS API and a PostgreSQL/PostGIS adapter. This is a runnable development demo, not a production release.

## Run the app

Requirements: Node.js 22.13+ and npm. Install dependencies from the repository root:

The `.nvmrc` file selects Node.js 22. GitHub Actions runs the checks and builds listed below on pushes and pull requests.

```bash
npm ci
npm run web
```

Open the URL printed by Expo (normally http://localhost:8081). The app starts in **Local demo** mode without a server or credentials. Likes, saved trails, text reports, comments, and join requests persist in browser/device storage.

For native development:

```bash
npm start
# Or, with Android Studio / Xcode installed:
npm run android -w @trektribe/mobile
npm run ios -w @trektribe/mobile
```

The project pins Expo SDK 54 and its matching React / React Native versions. Use a compatible development build; compatibility with the currently installed Expo Go version is not assumed. Native binaries and device testing are not included in this milestone.

## What works

- Responsive Explore, Community, Trips, and Profile screens.
- Search by trail name, region, or highlights; difficulty and saved-trail filters.
- Trail details, metrics, and clearly labeled illustrative route previews.
- Save/unsave trails and persist them across reloads.
- Publish a text report with rating, conditions, and validated observation date.
- Like/unlike reports and add comments.
- Request a place on an outing, cancel a request, and approve sample requests on your own outing.
- Shared domain validation; idempotent likes/saves and request-ID-based post/comment creation.
- NestJS REST API, durable single-process JSON demo store, and optional PostgreSQL adapter.
- Parameterized PostGIS proximity queries and GiST indexes.

The illustrations, route coordinates, trip dates, statistics, profile, and initial stories are sample data. They are not current trail guidance. Initial ratings/report totals are fixture values and are not recomputed from new reports yet.

## Run the API (optional)

In terminal one:

```bash
DEMO_MODE=true npm run api
```

In terminal two:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3001 npm run web
```

For PowerShell, set `$env:DEMO_MODE="true"` or `$env:EXPO_PUBLIC_API_URL="http://localhost:3001"` before the corresponding command.

The default API binds to loopback only. It stores demo changes at `apps/api/data/demo.json` when launched through the workspace script. Keep it single-process. Local-device mode and API mode have independent data; switching modes does not migrate data. An API failure displays an error and never silently switches to local storage.

The demo API uses the fixed development bearer token `trektribe-local-demo`. It is a mode guard, **not user authentication**. The server refuses startup unless `DEMO_MODE=true`, and always refuses `NODE_ENV=production`. Do not deploy or expose this demo API publicly. Physical devices need a reachable LAN API address and an explicitly configured host; prefer local-only mode until proper authentication is installed.

Copying `.env.example` does not automatically load backend settings. Export them into the shell. Expo can read `apps/mobile/.env.local` for `EXPO_PUBLIC_API_URL`.

## PostgreSQL / PostGIS (optional)

Install Docker with Compose, then:

```bash
docker compose up -d --wait
export DATABASE_URL='postgres://trektribe:local-development-only@localhost:5432/trektribe'
export DEMO_MODE=true
npm run db:migrate
npm run api
```

The migration creates normalized users, treks, posts, likes, comments, saved trails, group treks, and membership tables. It installs PostGIS and indexes trailheads and routes. A version table tracks the migration. The seed command is repeatable without overwriting existing rows.

The PostgreSQL adapter has a dedicated integration suite and a PostGIS service in GitHub Actions. Run it locally against a disposable PostgreSQL/PostGIS server with a role allowed to create databases:

```powershell
$env:TEST_DATABASE_URL = 'postgres://trektribe:local-development-only@localhost:5432/postgres'
npm run test:db
```

The suite creates a uniquely named test database, runs the migration twice, tests persistence, spatial queries, feed pagination, permissions, and competing final-slot approvals, then drops only that test database. It does not migrate or clear the database in `TEST_DATABASE_URL`. A failed database connection does not fall back to JSON storage. See `docs/VERIFICATION.md` for recorded results.

For roster changes, the adapter locks the parent trip row before validating and changing membership. All future endpoints that change trip capacity or accepted membership must use that same locking convention.

## API reference

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Mode and storage health metadata |
| GET | `/v1/treks?q=&difficulty=All&lat=&lng=&radiusM=` | Trail search; optional proximity |
| GET | `/v1/treks/:id` | Trail details |
| GET | `/v1/feed?limit=20&cursor=` | Cursor-paginated feed |
| GET | `/v1/group-treks` | Sample outings; demo token required |
| GET | `/v1/demo/state` | Demo client snapshot; demo token required |
| POST | `/v1/demo/commands` | Validated demo mutations; demo token required |

Example:

```bash
curl http://localhost:3001/v1/demo/commands \
  -H 'Authorization: Bearer trektribe-local-demo' \
  -H 'Content-Type: application/json' \
  -d '{"type":"save","trekId":"00000000-0000-4000-8000-000000000101","saved":true}'
```

Commands are defined in `packages/core/src/types.ts`; runtime schemas are in `apps/api/src/validation.ts`. Current commands: `save`, `like`, `post`, `comment`, `join`, `leave`, `approve`, `profile`, `create-trip`, and `cancel-trip`.

The snapshot/command endpoints deliberately support this single-user development demo. Replace them with per-resource, authenticated endpoints before multi-user deployment. The PostgreSQL feed endpoint now uses SQL keyset pagination with timestamp/ID cursors. The demo snapshot and command endpoints still load the fixture dataset and are not intended for production scale.

## Check and build

```bash
npm run typecheck
npm test
npm run build:api
npm run build:web
```

- Backend output: `apps/api/dist/`.
- Web output: `apps/mobile/dist/`.
- Compiled API: `DEMO_MODE=true npm run start -w @trektribe/api`.
- To inspect an exported web build: `python3 -m http.server 8081 --directory apps/mobile/dist`.

The test suite covers HTTP authorization/validation, feed cursors, geographic filtering, idempotency, observation dates, join/approval rules, and serialized JSON persistence. Test fixtures use a fixed reference date where applicable.

## Project layout

```text
apps/mobile/src/       Expo screens, native SVG artwork, local/API data adapter
apps/api/src/          NestJS controller, validation, JSON and PostgreSQL stores
packages/core/src/     Shared types, sample content, pure domain rules
packages/database/    Versioned SQL migration
scripts/              Database migration and seeding entry point
tests/                Domain, persistence, and HTTP tests
docs/                 Next implementation milestones
```

## Not implemented yet

Live-provider sign-in verification; blocking and moderation; photo/video capture and uploads; real basemaps; cohosts and forum threads; notifications; offline map packs; SQLite GPS recording; account deletion; Redis-backed multi-server chat delivery.

Profile and gear editing, outing creation/cancellation, configurable OIDC authentication, private invitations, GPX import, immutable route versions, and persisted outing conversations are implemented. PostgreSQL is required for invitations, GPX import, and conversations; two real users also require a configured OIDC provider. See [authentication setup](docs/AUTHENTICATION.md) and [feature validation](docs/FEATURE_VALIDATION.md).

Badges and initial activity totals are samples. Offline-capable browser assets are not offline map downloads. Read `docs/NEXT_STEPS.md` for remaining milestones. Production startup remains disabled.
