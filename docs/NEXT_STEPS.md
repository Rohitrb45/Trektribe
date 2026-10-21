# Next implementation milestones

## 1. Turn the single-user demo into a multi-user application

Progress (2026-10-19): configurable JWT verification, issuer/subject identity mapping, resource endpoints, PKCE client sign-in, profile editing, ownership tests, and bilateral user blocking are implemented. Blocking includes report-author controls and a profile unblock list, filtered feeds/comments/chat, and new-interaction restrictions. Live-provider verification, Expo Router, and generated API clients remain outstanding. Production startup is still disabled.

Choose an OIDC provider, implement token verification, and map subjects to user IDs. Replace the static demo identity and aggregate demo endpoints with resource endpoints. Derive authorship and permissions from the authenticated identity. Add ownership, blocking, visibility, and organizer policies and authorization tests. Split `App.tsx` into feature screens as navigation expands; introduce Expo Router and generated OpenAPI clients.

Acceptance: two real accounts can publish separate stories, like each other's posts, and cannot edit each other's content or approve another organizer's trip. The production startup guard may be removed only after these controls are in place.

## 2. Validate the database and finish trail ingestion

Progress (2026-10-19): PostgreSQL/PostGIS tests cover migrations, persistence, spatial queries, final-slot approvals, private invitations, and pinned route versions. SQL feed pagination, bounded GPX import, derived distance/elevation metrics, and report-based rating aggregation are implemented. Each report contributes one vote; averages are rounded to one decimal and totals are derived from persisted reports rather than sample counters. See `VERIFICATION.md` for evidence.

Run the migration and adapter against PostgreSQL/PostGIS in CI. Add concurrent approval tests against a real database. Move feed pagination into SQL instead of reading an aggregate snapshot. Add route-version tables before accepting edits to published geometry. Import GPX with point/file limits and safe XML parsing. Compute route metrics from validated data and derive rating totals from a defined rating policy.

Acceptance: competing final-slot approvals yield one success; changing a trail does not alter an existing outing's pinned route.

## 3. Connect native maps and media

Validate the Expo/native SDK compatibility matrix, install `@rnmapbox/maps`, and build for physical iOS and Android devices. Replace `RouteArt` with a native map behind a platform adapter; retain the illustration only as a labeled demo fallback. Add S3/R2 upload authorization, asset processing, metadata stripping, and media readiness validation. Use a worker for media tasks.

Acceptance: real routes render, signed uploads are owner-scoped, and interrupted uploads recover without creating duplicate posts.

## 4. Complete group planning and community

Progress (2026-10-19): outing creation, timezone capture, private visibility, hashed invitations, cancellation, and persisted Socket.IO conversations are implemented. Chat uses membership checks, idempotent message IDs, per-room sequences, commit-before-ack, a transactional outbox, and reconnect backfill. Cohost assignment/revocation and delegated join approvals are implemented (2026-10-21); only organizers manage roles, invitations and cancellation. Persistent community threads, paginated replies, author-controlled closing/reopening, blocking and retry protection are implemented (2026-10-21). Forum author editing with revision checks, soft deletion, report snapshots, and administrator-provisioned moderator review are implemented. Redis notification fan-out and coordinated multi-process outbox dispatch are implemented. PostgreSQL remains authoritative; failed publication retries and clients recover missed hints through polling/backfill. Conversation-scoped presence is implemented with expiring per-device Redis/local leases and membership/block filtering. Appeals, permanent erasure and load-balancer validation remain pending. Physical-device testing is deferred at the user's request.

Add outing creation, timezones, private visibility, hashed invitations, cohosts, cancellation, and durable forum threads. Add chat room membership, per-room message sequences, persisted messages, transactional outbox, Socket.IO acknowledgments, and reconnect backfill. Redis supports presence and broadcasts; PostgreSQL remains authoritative.

Acceptance: acknowledged messages survive reconnects; removed members lose access; private-trip details never appear in public discovery.

## 5. Offline maps and recorded tracks

Use Expo SQLite for sessions, points, sync cursors, and queued operations; AsyncStorage in this demo is not a GPS database. Download map resources through the provider SDK. Add numbered, checksummed track chunks and private-by-default sharing. Test permission changes, background lifecycle, screen lock, limited storage, and battery drain on real devices.

Acceptance: a downloaded route can be inspected in airplane mode; supported recording interruptions preserve saved points; retrying a chunk never duplicates it.
