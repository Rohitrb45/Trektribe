# Verification report — first milestone

## Saved chat drafts — 2026-10-22

Implementation commit: `d3df205`, branch `feature/trektribe-multiuser`.

- Added AsyncStorage drafts scoped to API URL, account UUID and outing UUID. The composer restores saved text, shows storage status, retries failed storage operations, and supports explicit discard. Normal closing waits for queued writes.
- Message IDs are saved before sending and retained for unconfirmed retries. Acknowledgments remove only a matching draft, protecting a newer draft from a late acknowledgment within the same app runtime.
- Local typechecking, all 25 unit/HTTP tests, API compilation and web export passed. Both jobs passed in [saved draft CI](https://github.com/Rohitrb45/Trektribe/actions/runs/39788017912), including PostgreSQL/Redis integration tests and Android/iOS bundle exports.
- Draft tests use a storage adapter to exercise reopening, account/API/outing isolation, delayed writes, acknowledgment races, failed writes, invalid data and discard. Existing integration tests cover server-side message idempotency.
- No migration or new dependency is required. Manual UI, physical-device storage durability and live sign-in remain unverified. Drafts use local unencrypted app storage, persist across sign-out for the same account, and are not synchronized across devices or concurrent browser tabs. A force-close before saving completes can lose the latest keystrokes.

## Conversation presence — verified 2026-10-22

Implementation commit: `a5d873a`, branch `feature/trektribe-multiuser`.

- Added conversation-scoped presence with 10-second foreground heartbeats and 30-second per-device expiry. Local mode uses memory; multi-instance mode uses Redis server timestamps and expiring sorted sets. The client displays unique active participant names and clears presence when disconnected or backgrounded.
- Every presence request verifies authentication and accepted membership. Responses filter blocked users and recheck the viewer's membership. Disconnect cleanup removes only that socket's session; expired entries provide fallback cleanup after crashes.
- Local typechecking, all 22 unit/HTTP tests, API compilation and web export passed before the interruption. Both jobs passed in [presence validation CI](https://github.com/Rohitrb45/Trektribe/actions/runs/39627190003), confirmed on resume: PostgreSQL/Redis integration tests, unit/HTTP tests, builds and Android/iOS bundle exports.
- Tests cover cross-instance presence, multiple devices, nonmembers, forged identities, bilateral blocks, stale Redis timestamps, Redis permission failure and membership removal. Local expiry is tested with a controlled clock; Redis expiry cleanup is tested using an explicitly stale score rather than waiting 30 seconds.
- No database migration is required. Redis ACL additions and manual validation are documented in `FEATURE_VALIDATION.md`. Physical-device foreground/background behavior, live OIDC, load-balancer behavior and crash timing remain unverified. Production startup remains disabled.

## Chat across API instances — 2026-10-21

Implementation commit: `87e5b6b`, branch `feature/trektribe-multiuser`.

- Added Redis 6.3 client support for bounded, best-effort conversation-change notifications across API instances. PostgreSQL continues to store messages and coordinate outbox claims. Each receiving instance revalidates authentication and membership locally.
- Added a database coordination lock to reject mixed local/Redis modes and multiple local dispatchers. Redis publication failures roll back outbox delivery markers for retry; Redis startup failure does not silently downgrade to local mode.
- Local typechecking, all 21 unit/HTTP tests and API compilation passed. Both jobs passed in [Redis chat CI](https://github.com/Rohitrb45/Trektribe/actions/runs/39620637216), including PostgreSQL/Redis integration tests, web builds, and Android/iOS bundle exports.
- The new integration scenario runs two HTTP/Socket.IO server instances with independent PostgreSQL pools. It verifies remote notifications, nonmember filtering, mixed-mode rejection, history access while Redis publishing is denied, successful retry after restoring publication, membership removal and continued operation after stopping one server. Publication failure is injected through a temporary Redis ACL user, not by shutting down the Redis service.
- Presence, physical-device behavior, live OIDC, load-balancer configuration and Redis cluster testing remain pending. Notifications may be missed or duplicated; five-second sync and reconnect backfill remain authoritative. Production startup is still disabled.

## Forum editing and moderation — 2026-10-21

Implementation commit: `faa3b67`, branch `feature/trektribe-multiuser`.

- Migration 011 adds revision-controlled author edits, soft deletion, reports with content snapshots, explicit moderator assignments and an audit table for decisions. Client controls include editing, deletion confirmation, reporting and moderator review.
- Local typechecking, all 21 unit/HTTP tests, API compilation and web export passed after fixing an edit-payload type narrowing error.
- Both jobs passed in [forum management CI](https://github.com/Rohitrb45/Trektribe/actions/runs/39611598057), including PostgreSQL/PostGIS integration tests and Android/iOS bundle exports.
- Database tests cover concurrent edits, stale revisions, ownership, duplicate reports, preserved report evidence after editing, dismissal/removal, repeated decisions, revoked moderator access and prevention of restoring removed content through ordinary endpoints.
- No moderator is assigned automatically. Deletion hides retained records; it is not permanent erasure. Appeals, restoration, bulk moderation and realtime notifications remain pending. Live sign-in, manual UI and physical-device validation were not performed.

## Community discussions — 2026-10-21

Implementation commit: `a8abdd4`, branch `feature/trektribe-multiuser`.

- Migration 010 adds persistent discussion threads and replies. The connected Community screen supports creation, paginated browsing, replies, manual refresh and author-only closing/reopening.
- Strict request validation derives authorship from the session. Duplicate request IDs are idempotent only for the same actor/content; block checks apply before pagination and before accepting reply retries. Closing and replying serialize on the thread row.
- Local typechecking, all 20 unit/HTTP tests, API compilation and web export passed. Both jobs passed in [forum validation CI](https://github.com/Rohitrb45/Trektribe/actions/runs/39609929571), including real PostgreSQL/PostGIS integration tests and Android/iOS bundle exports.
- Integration coverage includes concurrent duplicate submissions, conflicting IDs, ownership, closing/reopening, paging, blocked replies/threads and persistence across connection pools.
- Forum editing, deletion, moderation and realtime notifications remain pending. Drafts are not persisted after closing the screen. Live sign-in and physical-device behavior remain unverified; exports are not native binary builds.

## Outing cohosts — 2026-10-21

Implementation commit: `856639e`, branch `feature/trektribe-multiuser`.

- Added migration 009 and organizer-controlled cohost assignment/revocation. Accepted cohosts can approve applicants; invitations, cancellation and role management remain organizer-only. Leaving deletes the role with membership.
- Local typechecking, all 19 unit/HTTP tests, API compilation and web export passed.
- Both jobs passed in [cohost validation CI](https://github.com/Rohitrb45/Trektribe/actions/runs/39607410505): real PostgreSQL/PostGIS integration tests, unit/HTTP tests, builds and Android/iOS bundle exports.
- Database tests cover persistence, pending-member promotion rejection, restricted permissions, organizer/applicant blocking, revocation serialized with approval, and ordinary membership after rejoining.
- Live OIDC sign-in and physical-device testing remain pending. Bundle exports are not native binary/device validation.

## Report rating aggregation — 2026-10-19

Implementation commit: `fb5d1a1`, branch `feature/trektribe-multiuser`.

- Migration 008 adds a live report aggregate view and trail/rating index. API totals use persisted reports, with one vote per report and averages rounded to one decimal. Unrated trails display "Not rated". Legacy local demo data is recalculated without losing reports.
- Local Node.js 22.23.3: typechecking, all 18 unit/HTTP tests, API compilation, web export, and Android/iOS Hermes bundle exports passed.
- New database tests cover duplicate retries, concurrent writes from independent pools, conflicts, block-independent totals, and removal of reports. Both jobs in the [rating CI run](https://github.com/Rohitrb45/Trektribe/actions/runs/39281774705) passed (confirmed 2026-10-21), including the PostgreSQL checks and native bundle exports.
- Bundle exports are not APK/IPA builds or physical-device validation. No live provider or device test was performed.

## User blocking — 2026-10-19

Implementation commit: `47ec06a`, branch `feature/trektribe-multiuser`.

- Added migration 007, block/unblock endpoints, report-author blocking, and a profile block list. Feed, comments, likes, outing discovery, invitations and group-message history enforce bilateral blocks. Existing outing memberships remain available for leaving.
- Typechecking, all 16 unit/HTTP tests, API compilation and web export passed locally. The sandbox initially prevented Node's user lookup; the same tests passed outside that sandbox.
- Both jobs passed in [blocking validation CI](https://github.com/Rohitrb45/Trektribe/actions/runs/39274490267): real PostgreSQL/PostGIS integration tests, unit/HTTP tests, typechecking, API/web builds, and Android/iOS bundle exports.
- The new integration scenario covers bilateral visibility, invitation retry denial, blocked mutations, shared chat filtering, preserved membership, leaving, and independent unblock ownership.
- Already loaded content in other sessions requires refresh/reopening. No live provider or physical-device testing was performed. Production startup remains disabled.

## Resumed development — 2026-10-19

Implementation commit: `9ba060c`, branch `feature/trektribe-multiuser`.

- Completed the GPX file-picker interface and persisted outing chat (migration 006), with transactional message/outbox writes, acknowledgments after commit, reconnect history, and accepted-member authorization.
- Typechecking, API compilation, and web export passed locally with Node.js 22.23.3.
- The initial local suite passed 15/16 tests; the HTTP server hit its 30-second cold-start deadline without output. Running that test alone passed in about nine seconds. The timeout was not relaxed.
- Database/socket integration tests additionally cover invalid credentials, forged sender fields, conflicting retries, message persistence, reconnect backfill, and membership removal.
- Both jobs passed in the [implementation validation run](https://github.com/Rohitrb45/Trektribe/actions/runs/39270025566): all 16 unit/HTTP tests, typechecking, API/web builds, Android/iOS bundle exports, and the real PostgreSQL/PostGIS/socket integration suite.
- Physical-device testing remains deferred at the user's request. Live OIDC provider redirects, native binaries, Redis multi-server delivery, maps, media, and GPS recording are not verified by these checks.
- See [feature validation](FEATURE_VALIDATION.md) for manual checks and current chat limitations.

## Previous verification — 2026-10-11

Implementation commit: `4291cac`, branch `feature/trektribe-database-validation`.

- Local Node.js 22.23.3: typechecking, 10 automated tests, and API compilation passed.
- Expo Doctor: 18/18 checks passed. SDK dependency compatibility check passed.
- Android and iOS Hermes production bundle exports passed locally. This is not APK/IPA compilation or device testing.
- The real PostgreSQL 16/PostGIS 3.5 integration job passed in [GitHub Actions](https://github.com/Rohitrb45/Trektribe/actions/runs/38114194117). It exercised repeatable migration/seed behavior, geometry round-trips and spatial queries, GiST indexes, durable/idempotent writes, rollback on conflicting request IDs, SQL cursor pagination, join/cancel permissions, and competing approvals from independent connection pools for a single remaining slot.
- Feed pagination now runs in PostgreSQL and preserves microseconds in cursors. Aggregate demo snapshots/mutations remain unchanged.
- Android platform tools are available locally, but `adb devices -l` reported no connected device. Moto Edge 50 Fusion behavior remains pending; see [the device checklist](NATIVE_VALIDATION.md).
- No physical iOS device, Xcode, or native binary validation was available. Real OIDC sign-in remains unconfigured and the production guard remains enabled.

The older report below records the initial integration environment; its database limitation is superseded by the CI result above.

Completed in the authoring environment:

- Dependency installation and lockfile generation.
- Strict TypeScript checks for the Expo client and NestJS server.
- Compiled NestJS backend build.
- Expo web bundle export.
- Eight passing automated tests, including a spawned HTTP server test.
- Durable JSON storage round-trip and concurrent-write serialization.

Not verified here:

- Visual browser/device smoke tests: the available browser could not launch in the execution environment. A successful web export is not a visual inspection.
- Native iOS/Android compilation or device behavior.
- PostgreSQL/PostGIS migrations and adapter integration: Docker/PostgreSQL were unavailable.
- Real external integrations: authentication, mapping, media storage, chat, and GPS recording are not implemented yet.

The app is a development milestone. Follow the README for a local run and inspect the UI on your target devices before extending or deploying it.

## Repository integration — 2026-10-10

- Preserved the upstream MIT license, project description, and Git history.
- Used a workspace-local Node.js 22.23.3 runtime because the installed Node.js 20.14.0 is below the project requirement. The system runtime was not changed.
- Added `.nvmrc` and a GitHub Actions workflow for the four documented checks.
- Passed `npm run typecheck`, all eight tests via `npm test`, `npm run build:api`, and `npm run build:web` locally on Windows.
- Increased the HTTP test's startup deadline from roughly six seconds to 30 seconds, with bounded health requests and useful timeout diagnostics. The Windows test run needed about 25 seconds.
- `npm audit fix` left 35 findings (12 moderate, 23 high). Forced changes were not applied because npm proposed incompatible Expo/React Native changes. Dependency remediation remains outstanding.
- Docker was unavailable; PostgreSQL/PostGIS and native device behavior remain unverified.

## Expo Router navigation (2026-10-22)

- Clean `npm ci` completed using Node 22.23.3; Router 6 and native dependencies match Expo SDK 54.
- TypeScript, all 26 unit/API tests, API compilation and web export passed.
- Automated Chromium smoke test against the exported web app passed: tab URLs, browser Back/Forward, retained search filters, direct/reloaded trail details, detail-to-Trips navigation, missing-trail recovery, and mobile-width Profile navigation. No browser page errors were observed.
- Browser history can remount the layout. Discovery preferences use a memory-only store and reset on explicit sign-out; persisted application data reloads through the existing adapter. Route changes dismiss transient dialogs and unmount chat/presence subscriptions.
- The file routes currently use the existing application shell. Feature-screen extraction and generated API clients remain pending.
- Physical Android/iOS behavior and real OIDC callbacks are not verified. Web deployment requires SPA path fallback. See FEATURE_VALIDATION.md for manual checks.
- Android and iOS JavaScript exports passed after the history-filter fix; these are not native binary or device tests.

## Feature-screen extraction (2026-10-22)

- Previous navigation commit `36f523c` passed both GitHub Actions jobs (`database` and `check`): https://github.com/Rohitrb45/Trektribe/actions/runs/39794654398.
- Extracted Explore, Community, Trips and Profile into typed screen modules; shared UI controls/styles moved out of App. The shell retains mutations and modal state, including pinned route and invitation requests. File-route components still delegate rendering through the shell.
- TypeScript (including a mobile unused-import check), all 26 tests, API/web builds, and Android/iOS JavaScript exports passed.
- Chromium checks against the exported web app passed for navigation/history, retained search, trail reload/direct links, missing-trail handling, mobile-width Profile, profile edits, saved-trail navigation, likes, report publishing and outing creation. No page errors were observed. Outing date validation correctly rejected a missing date before the test supplied a future date.
- These checks used Local demo mode. No new live OIDC, physical-device, or connected-mode manual verification is claimed for this refactor. Generated API clients remain the next client integration milestone.
## Generated core API client, first stage (2026-10-23)

- Added a partial OpenAPI 3.1 contract covering nine core read/save/like operations, generated TypeScript schemas, and a typed fetch client used by the mobile OIDC resource loader and save/like actions.
- `npm run api:check` verifies generated-file freshness in CI. Compile-time compatibility checks compare the five core response models against the generated schemas.
- All 29 tests pass, including generated-client calls against the local HTTP API, current-token lookup, cursor serialization, false request values, structured/non-JSON errors, and coordinate validation.
- Full-suite API startup twice exceeded the existing 30-second deadline with unrestricted worker concurrency; isolated client/API tests passed. Limiting test workers to four made the full suite pass in about seven seconds without extending the deadline.
- TypeScript, API/web builds, and Android/iOS JavaScript exports passed. Chromium local-demo checks passed for navigation/history, retained filters, trail links, profile edits, saved trails, likes, reports and outing creation, with no page errors.
- Prior screen-extraction CI passed both jobs: https://github.com/Rohitrb45/Trektribe/actions/runs/39801832797.
- Live OIDC and physical-device behavior remain unverified. Other mutations, forum/moderation, blocking, GPX/invitations and chat HTTP endpoints still use the previous request adapter. This is not a complete generated API migration. See API_CLIENT.md.
- Implementation commit `f58f0af` passed both CI jobs (`check` and `database`, including PostgreSQL/PostGIS and Redis): https://github.com/Rohitrb45/Trektribe/actions/runs/39962576279.

## Generated core command mutations (2026-10-23)

- Extended the contract from nine to 18 operations. All core command dispatch now uses a typed adapter: profile, reports/comments, outings, join/leave, approvals, cohost changes, saves and likes. Existing queueing and retry IDs are preserved.
- Added drift checks comparing the nine new request schemas to server validators. API tests exercise each mutation, duplicate-report protection, and unauthorized cancellation rejection.
- Generated-code freshness, TypeScript, all 31 tests, API/web builds, Android/iOS JavaScript exports and Chromium local-demo workflow checks passed.
- An initial full-suite run timed out during API startup. The isolated API test and subsequent full-suite run without overlapping builds passed; the startup deadline and test assertions were retained.
- Blocking, forums/moderation, GPX/routes, invitations and chat HTTP requests remain outside the generated contract. Live OIDC and physical-device testing are still pending.
## Generated blocking and invitation clients (2026-10-23)

- Extended contract coverage to 22 operations and migrated block-list, block/unblock, invitation creation and acceptance requests.
- All 32 local tests, TypeScript, generated-code freshness, API/web builds and Android/iOS JavaScript exports passed.
- Added a PostgreSQL-backed HTTP integration test for successful block/unblock, blocked-invitation rejection, invitation issuance and repeat acceptance. Database execution is tracked in CI below; no local PostgreSQL service is available.
- Native-device and live OIDC verification remain pending. Forums, GPX/routes and chat HTTP endpoints remain to migrate.

- Implementation `c34a09f` passed both CI jobs, including the new PostgreSQL HTTP round trip: https://github.com/Rohitrb45/Trektribe/actions/runs/39968230442.

## Generated GPX and pinned-route client (2026-10-24)

- Contract coverage increased to 25 operations: GPX import, replacement versions and pinned outing routes now use generated client calls.
- GPX validation is shared with the API contract-drift test. Coordinate validation is reused for pinned routes.
- All 34 tests, TypeScript, generated-code freshness, API/web builds and Android/iOS JavaScript exports passed. An initial API startup timeout passed on rerun without extending the deadline.
- Extended the PostgreSQL HTTP test to cover import, immutable outing geometry after replacement, invalid GPX, and unauthorized replacement. Its CI result is recorded below.
- Forum and chat HTTP migration, live OIDC, basemaps and physical-device validation remain pending.

- Implementation `4ac97bd` passed both CI jobs, including the PostgreSQL pinned-route HTTP regression: https://github.com/Rohitrb45/Trektribe/actions/runs/40093092656.

## Generated forum discussion lifecycle (2026-10-24)

- Added six operations (31 total): capabilities, thread list/detail, creation, replies and close/reopen. Mobile thread/reply types now derive from the generated schema.
- All 36 local tests, TypeScript, generated-code freshness and API/web builds passed. Creation-schema tests caught and corrected an initially missing UUID pattern.
- Extended PostgreSQL HTTP coverage for duplicate thread/reply requests, reply pagination, closed-thread rejection and reopening. CI execution is recorded below.
- Forum editing/removal/reporting/moderation and chat HTTP migration remain pending, as do live OIDC and device validation.

- Android and iOS JavaScript exports also passed; these are not physical-device tests.

- Implementation `f515bb3` passed both CI jobs, including PostgreSQL HTTP forum lifecycle checks: https://github.com/Rohitrb45/Trektribe/actions/runs/40095521852.

## Generated forum management client (2026-10-26)

- Extended the contract to 39 operations, adding typed thread/reply editing, removal, reporting, moderation queue and decisions.
- Added server-schema drift and request serialization tests, plus PostgreSQL HTTP coverage for stale revisions, moderator authorization, repeated decisions and content removal.
- All 38 local tests and API/web builds passed. The first suite run hit the existing API startup timeout; the full retry passed without changing the deadline or assertions.
- Database execution is verified through CI; no local PostgreSQL service is available. Live OIDC and physical-device validation remain pending. Chat HTTP migration is next.
- Generated-code freshness, TypeScript and Android/iOS JavaScript exports passed. Exports do not verify native-device behavior.

- Implementation `18a3f27` passed both CI jobs (check and database), including the PostgreSQL forum management HTTP regression: https://github.com/Rohitrb45/Trektribe/actions/runs/40344665740.

## Generated chat HTTP client (2026-10-27)

- Added typed history/send adapters and contract schemas (41 operations total). The chat screen retains Socket.IO transport; no automatic fallback or retry was introduced.
- Tests cover request IDs, fresh credentials, pagination and HTTP errors. PostgreSQL HTTP regression coverage includes duplicate/conflicting sends, history cursors, nonmember access and invalid bodies.
- All 40 local tests, generated-schema freshness, TypeScript and the API build passed. The initial API startup timeout passed on full-suite retry without modifying its deadline.
- Physical-device and live OIDC checks remain pending; this change adds HTTP coverage, not native validation. Socket.IO event contracts remain next.
- Web export also passed; PostgreSQL CI execution is recorded below.

- Implementation `cd9f9dc` passed both CI jobs (check and database), including PostgreSQL chat HTTP tests: https://github.com/Rohitrb45/Trektribe/actions/runs/40532462907.

## Shared Socket.IO contracts (2026-10-27)

- Added shared event types for send, sync, presence, away and change notifications, with discriminated success/error acknowledgments. Both mobile and API sockets use these contracts.
- Extracted strict server input validators into the shared module; tests cover whitespace, length limits, forged identity, UUIDs and bounded numeric cursors. Existing wire payloads, retry IDs and membership checks are preserved.
- TypeScript, all 41 local tests and the API build passed. An initial API startup timeout passed on full-suite retry without deadline changes.
- Response types are compile-time checks, not runtime validation of arbitrary server responses. Live OIDC, device lifecycle and load-balancer validation remain pending.
- Web export passed. PostgreSQL/Redis CI evidence is recorded below.

- Implementation `f1201ad` passed both CI jobs (check and database), including PostgreSQL/Redis realtime regressions: https://github.com/Rohitrb45/Trektribe/actions/runs/40533874925.

## Native map adapter (2026-10-27)

- Added @rnmapbox/maps 10.3.15, Expo plugin and platform-specific trail detail rendering. Web and unavailable native maps retain a labeled illustration.
- TypeScript, web export and Android/iOS JavaScript exports passed. Native binary compilation, public-token tile rendering and physical-device validation are still pending; SDK compatibility is not yet established by these exports.
- Setup and acceptance steps: NATIVE_MAPS.md. Offline recording and media remain pending.

- Implementation `5862084` passed check and database CI: https://github.com/Rohitrb45/Trektribe/actions/runs/40536526590. This does not include native binary builds.

## Windows Android build and map recovery (2026-11-01)

- Pinned Expo 54.0.37, added a Windows launcher with local JDK/SDK discovery and a short drive alias, and added Metro workspace resolution through that alias. Original pre-repair manifests remain in ignored local backups.
- Removed a stray text node that prevented native rendering. Map failures expose a retry action; native and web fallback illustrations now leave room for their labels and controls.
- `powershell -ExecutionPolicy Bypass -File T:/scripts/android.ps1 -BuildOnly -Architecture x86_64` passed: 248 tasks, 3m34s. This also verifies invocation through an existing drive alias. The earlier emulator install and application launch passed; this is a Metro-dependent debug APK, not a physical-device release.
- Final TypeScript and web export passed; generated API contract freshness passed. Full regression runs passed 40/41 tests but twice exceeded the HTTP test's 30-second startup deadline. Direct API startup returned HTTP 200, and the isolated HTTP regression then passed in 18.1 seconds without changing its deadline. A fully green local concurrent suite is not claimed.
- Public-token style API validation passed previously. Live route/tile rendering remains unverified after emulator Wi-Fi and SwiftShader failures. Hardware graphics, ARM64 Android, iOS and physical-device acceptance remain pending. No new PostgreSQL/Redis integration run was performed locally for this change.

## Live Android map acceptance (2026-11-01)

- API 37 x86_64 emulator with host graphics and Mapbox Maps SDK 11.33.0 displayed live terrain tiles and the green sample route. Camera framing, horizontal pan and double-tap zoom passed; scale changed from 1 mi to 0.5 mi after zooming.
- Mapbox logo and attribution control remained visible. The control opened the provider/OpenStreetMap attribution and privacy/telemetry links.
- Temporarily requested a nonexistent provider style, observed HTTP 404 and the labeled illustration with a visible retry button. Restored the original source, tapped Retry map, and observed live tiles/route again. No token changes or test hooks remain. This validates provider-error recovery, not invalid-token or network-loss recovery.
- A brief Home/application-resume cycle retained the live map. The emulator encountered a System UI ANR during cold boot and later slept; after dismissal/wake, the app rendered. This is not a physical-device stability or long-running lifecycle result.
- Screenshots: [recovered live map](images/android-native-map.png), [404 fallback](images/android-map-fallback.png). The latter includes the expected Expo development notification. The native source is unchanged from ee740b2; no additional automated test run was necessary for this documentation-only verification update.
## Native basemap downloads (2026-11-03)

- Added bounded Mapbox offline regions with a content-derived identifier, progress, pause/resume, status refresh and removal. Live rendering and downloads share the same outdoors style. No new native dependencies were needed; this was exercised through the existing Android development binary.
- The API 37 emulator restored the earlier paused pack at 75% after restart. Resume completed, and rereading SDK status reported Map area downloaded. Reopening the sample trail with Wi-Fi disabled retained the tiles and route; there was no default network route and an external ping failed. This is limited to the sample area in an already running Local demo app; it does not establish cold-start or all-zoom offline acceptance.
- Removal returned the controls to Download map area. Removal stops the transfer before releasing the region and ignores late progress events. Shared style resources and ordinary provider caches can remain.
- Three new boundary/progress tests passed, as did the final mobile TypeScript check and web export. The full suite passed 43/44 tests; the existing HTTP startup deadline timed out, then the isolated HTTP test passed in 23.8 seconds after stopping the emulator. No deadline or assertion was relaxed. An initial web-export invocation used the repository root; rerunning from apps/mobile passed.
- Evidence: [completed pack](images/android-map-download.png), [Wi-Fi-disabled map](images/android-map-download-offline.png). Emulator System UI startup instability remains an environment limitation. GPS recording, server-backed offline trail snapshots, a download library/storage quota, iOS and physical-device acceptance remain pending.
## Native download library (2026-11-04)

- Added Profile map-download management using the SDK's stored packs independently of the current trail catalog. New packs include a bounded title; existing packs without title metadata show a generic area identifier.
- Listing retains entries with unreadable status. Removal pauses the region first, rejects unrelated pack names and propagates deletion errors. The UI serializes refresh/removal and keeps errors visible rather than reporting false success.
- All six offline-region/library tests passed, including previous-area discovery, foreign-pack exclusion, legacy metadata, unavailable status, pause-before-delete, deletion failure and already-missing packs. Mobile TypeScript and web/Android/iOS JavaScript exports passed.
- No native dependency, schema or API contract changed. Full API/database suites were not rerun for this mobile-only change. Native library UI acceptance and physical-device/iOS acceptance remain pending; exports are not native binary or device tests.
- Profile still depends on normal application startup. This is basemap management, not independent offline startup, route snapshots, quotas or GPS recording.
## Map-area limits and size reporting (2026-11-04)

- Added a 10-area admission limit for new TrekTribe map packs. Count-and-create operations are serialized within the app; existing packs can resume or be reused at the limit. Older installations above the limit are not pruned automatically.
- Profile displays provider-reported resource sizes and their sum, labeling unknown sizes and distinguishing these figures from actual disk usage. This does not implement a byte quota or automatic eviction.
- All nine offline-region/library tests passed, including concurrent final-slot creation, existing-pack reuse, replacement after removal, failed inventory/creation recovery and invalid size reports. Mobile TypeScript and web/Android/iOS JavaScript exports passed.
- No native dependency, database or API contract changed; full API/database suites were not rerun. Native UI/device acceptance of the limits and size labels remains pending. Offline startup/route snapshots and GPS recording remain separate work.
## 2026-11-04 — Offline trail snapshots

Added Expo SQLite 16.0.10 (Expo SDK 54 compatible), a bounded device-local trail-copy repository, explicit save/removal controls and an Offline trails viewer outside API/auth loading. Only whitelisted trail fields are persisted. Source URLs discard credentials, query and fragment; route identity includes source, trail ID, version and geometry. Copies are explicitly shared on the device and remain available when signed out.

Validation: 13/13 snapshot/map tests passed with Node 22.23.3, including real SQLite file reopening, parameterized storage, capacity/update/removal, corrupt-row isolation and geometry/version identity. Mobile and API TypeScript checks passed. Expo web, Android and iOS JavaScript exports passed. The sandbox test attempt failed before execution because Node could not resolve the Windows user profile; rerunning outside the sandbox passed. The backend/database integration suite was not rerun for this mobile-only change. Native runtime UI, airplane-mode cold startup, physical-device and iOS native acceptance remain pending. Recording sessions/points and sync queues are not implemented by this milestone.

Android x86_64 debug APK compilation with Expo SQLite passed (Gradle BUILD SUCCESSFUL, 248 actionable tasks). This verifies native compilation only; the new viewer was not exercised on an emulator in this increment.

## 2026-11-07 — Recording persistence foundation

Added TrackStorage and a native Expo SQLite/Crypto singleton adapter. Sessions and numbered SHA-256 chunks are device-local with no sharing/upload API. Chunk insertion and counters commit atomically; exact retries acknowledge without duplicate points, conflicting retries fail, and chunks/timestamps must be ordered. Startup changes interrupted recording sessions to paused. Writes are serialized and pause/resume/finish/removal are transactional. Capacity is bounded to 20 sessions, 500 chunks/session and 200 points/chunk.

Validation: 18/18 offline tests passed on Node 22.23.3. The five new tests cover real SQLite persistence across file reopening, restart recovery, concurrent retries, integrity/order/conflict checks, injected write-failure rollback, terminal state handling, one active recording, bounded payloads, limits and deletion. Those five passed again after the final readback-whitelist change. Mobile and API TypeScript checks passed. No dependencies or native configuration changed. No new APK/bundle or backend integration run was needed for this unconnected storage module; native adapter runtime, GPS capture/UI, background behavior and device acceptance remain unverified and pending. There is no new user-facing recording control in this increment.

## 2026-11-07 — Foreground GPS recording

Added the native Record a walk screen and Expo Location 19.0.8 adapter. Start/resume request foreground permission and watch location; accepted fixes commit immediately to the checksummed SQLite store. Pause/finish/close/background/focus loss detach the watcher, drain accepted writes and persist the resulting status. Returning never resumes automatically. Denied permission, provider errors, failed writes and delayed callbacks are handled. The UI shows confirmed saved counts, saved-route previews and confirmed deletion, with explicit device-local access and foreground-only limits. Capture currently uses one chunk per accepted point, capped at 500 updates per session with a 10-second minimum spacing and 100 m maximum reported accuracy.

Checks: all 25 offline/controller tests passed, including seven new controller tests for denied permission, queued writes, stale callbacks, cancellation during permission/watch startup, storage/provider failure and capacity. The seven controller tests passed again after the final write-failure ordering fix. Mobile/API TypeScript checks passed; mobile was rechecked after the final app-focus/close-screen fixes. Expo web/Android/iOS exports passed. Android x86_64 debug APK compilation with Expo Location passed (Gradle BUILD SUCCESSFUL, 248 actionable tasks). Generated Android configuration includes coarse/fine location, with no background-location/foreground-service configuration requested by the plugin.

Runtime acceptance was attempted but not completed: the earlier Medium_Phone AVD no longer exists, and the available Small_Phone remained offline in ADB even after reconnect. Windows reported approximately 360 MB free physical memory during the attempt. Only the emulator processes and Metro server launched for this test were stopped. No successful install, GPS injection, permission dialog, map preview or native lifecycle acceptance is claimed. Physical-device testing, iOS native build/runtime, airplane-mode cold startup, background recording, longer durable batching and upload/sync remain pending. The backend integration suite was not rerun for this mobile feature.

## 2026-11-07 — Durable partial recording chunks

Foreground capture now calls appendFix with the expected saved-point count. Each fix updates a checksummed SQLite partial chunk and the session counters in one transaction. The 200th point seals the chunk atomically; partial data survives pause/restart/finish and is included in route previews. The last-point acknowledgment can be retried on either side of sealing without duplication; conflicting/stale retries fail. Existing sealed chunks are unchanged. Maximum capacity for a new recording is 500 × 200 = 100,000 points; older single-point chunks retain their slots and therefore reduce available capacity. No in-memory flush timer or new native dependency was introduced.

Validation: the 28-test offline/controller suite passed, then the nine storage tests passed with an additional consistent 99,999-point fixture that verified the final seal, acknowledgment retry and rejection at 100,000. Tests cover real SQLite file reopening, partial finish/removal, concurrent retry, checksum failures, legacy coexistence and atomic rollback after a simulated failure at sealing. Mobile TypeScript and web/Android/iOS exports passed; TypeScript passed again after the final preview-drain change. Preview now pauses/drains pending controller writes and refreshes counts before reading chunks. No new native APK, backend integration suite or emulator run was performed for this TypeScript/storage-only increment. Native runtime, physical-device durability/endurance, background recording and upload/sync acceptance remain pending.

## 2026-11-07 — Remaining-work audit, storage reserves and identity setup

Added native free-space preflight checks using the installed Expo FileSystem Paths.availableDiskSpace API: 64 MiB for recording creation/resume/new point or chunk writes and offline trail saves; 256 MiB before starting/resuming map downloads. Unknown capacity blocks new writes. Recordings stop with an actionable storage error; reads, pause/finish, exact acknowledgment retries and deletion are not blocked by the reserve policy. Checks do not allocate/reserve space, monitor ongoing provider downloads or enforce a hard cache quota. Normal transaction failure handling remains necessary.

The 31 targeted offline/recording/storage tests passed, including injected low/unknown capacity, blocked writes without counter changes, retry acknowledgments, recovery and deletion. The full suite passed 71/72 initially; the HTTP API test timed out at its 30-second startup deadline. Its isolated rerun passed in approximately 12 seconds. Mobile/API TypeScript and generated API-contract freshness checks passed. No native dependency/configuration changed. Native low-storage runtime, PostgreSQL integration and device endurance were not rerun.

Added REMAINING_WORK.md as the current checklist, distinguished historical milestone notes, corrected stale authentication status text, and prepared AUTH0_SETUP.md from the current repository flow and official Auth0 documentation. No tenant, provider user or local environment was changed. The user requested provider setup instructions and explicitly kept physical-device testing deferred. Live identity, media, sync, background recording, appeals/erasure and deployment acceptance remain incomplete.

Web, Android and iOS JavaScript exports also passed with the new native storage adapter.

## 2026-11-07 — Private track upload server stage

Added migration 012 for owner-scoped private recording sessions/chunks, bounded declarations, checksum verification and monotonic timestamps, transactional ordered upload/counters, exact-retry acknowledgments, owner-only listing/reading, completion and deletion tombstones. Concurrent creation uses an owner row lock for the 20-live-upload quota; chunk mutation and deletion use the recording row lock. Location payloads are removed on deletion and stale create/chunk retries cannot restore them. Canonical point serialization is now shared by mobile/server. OpenAPI schemas and generated client adapters cover all new routes; no upload UI or automatic synchronization is connected.

Local checks: all 75 application tests passed, including new strict-schema, checksum and adapter retry tests, existing SQLite capture regressions and the HTTP API smoke test. Mobile/API TypeScript, API compilation and generated-contract freshness checks passed. PostgreSQL integration tests were added for migration repeatability, owner isolation, concurrent retries, sequencing, completion, final-slot quota races, deletion and real HTTP routing. They were not run locally: TEST_DATABASE_URL is absent, port 5432 is not listening and PostgreSQL/Docker tools were not found. CI's existing PostgreSQL job is the next database acceptance check; do not infer its result from the local unit tests. Device testing remains deferred.

Web, Android and iOS JavaScript exports passed after the shared serialization change.

GitHub Actions subsequently passed both check and database jobs for implementation commit 94f9438: https://github.com/Rohitrb45/Trektribe/actions/runs/42392695404 . The PostgreSQL/PostGIS integration suite therefore verified migration 012, owner isolation, ordered/concurrent retry handling, final-slot quota races, deletion/tombstones and the HTTP adapter on the CI database. This supersedes the pending-CI status above; no live OIDC or native-device acceptance is implied.

## 2026-11-07 — Explicit native private uploads and durable outbox

Added a separate SQLite outbox with atomic frozen snapshots of finished recordings (including partial tails), per-account/API scope, server-progress reconciliation, persisted chunk cursors and deletion intent. Upload runs freeze the credential and check account/session/screen state before every request. Backgrounding/closure invalidates the run until a manual retry; a request already sent may complete against the original account. Upload controls resolve the server-authenticated profile, confirm the named account and recheck scope before preparing data. No automatic upload is connected. Uploaded jobs discard redundant payloads but retain remote deletion handles. Local recording removal is explicitly distinct from outbox/server removal.

Server removal now acquires the same owner lock as creation and writes an owner-scoped tombstone even for an absent upload ID. This fixes the delete-before-delayed-create resurrection race. Integration coverage includes that race and cross-owner deletion isolation. It intentionally changes unknown-ID removal from 404 to an idempotent deletion acknowledgment; reads/writes remain owner-scoped 404s.

Validation: all 81 application tests passed before the final quota test was added; the complete seven-test outbox suite then passed, covering file reopening, credential guards, account changes, lost create/chunk/complete/delete responses, atomic rollback, corruption, finished-only preparation and global device quota recovery. Mobile/API TypeScript, API compilation and generated-contract freshness passed. PostgreSQL race tests are queued for CI because no local database is configured. No native dependency or build configuration changed. Live OIDC/native UI, background/timeout handling on real devices and remote restore UI remain unverified; physical-device testing remains deferred.

Web, Android and iOS JavaScript exports passed with the native upload controls and outbox adapter.

Implementation commit 92f88b2 subsequently passed both application and PostgreSQL/PostGIS CI jobs: https://github.com/Rohitrb45/Trektribe/actions/runs/42395288276 . This includes the final outbox test suite and real-database delete-before-create/concurrent deletion checks. It supersedes the pending-CI note above; live provider/native-device acceptance remains pending.

## 2026-11-07 — Restore private server recordings

Native private uploads now lists the current account's server recordings and offers explicit restore for completed uploads. The confirmation explains that restored GPS data remains device-local and accessible after sign-out. Downloads verify canonical SHA-256 chunks, totals, completion and timestamp ordering, then atomically import a finished recording under the existing 20-session limit and free-space checks. Restore identity includes API/account scope and remote ID, so repeated/concurrent restores reuse the same local copy while separate accounts remain separate. No partial download is persisted; interruption restarts download from the beginning. Import refreshes the local recording list without changing the server copy.

Validation: all 86 application tests passed; the four restore tests passed again after adding cancellation during an in-progress SQLite commit. Real SQLite tests cover file reopening, concurrent/idempotent restoration, account isolation, checksum/completion/network failures, account changes, storage rollback, ordering, conflicts and capacity recovery. Mobile/API TypeScript, generated-contract freshness and web/Android/iOS exports passed. No native dependency, API route or database migration changed. Live OIDC/native UI, large-recording memory/performance and physical-device acceptance remain pending; the user's physical-device deferral is unchanged.

## 2026-11-07 - Bundled Android offline validation APK

Added OfflinePreview to the Windows launcher and an APK packaging verifier. The release variant embeds JavaScript/Hermes and disables Android developer support; the generated project uses its development signing key, so this remains a local validation artifact. A Gradle init script keeps dependency CMake intermediates under the short drive alias and passes an absolute mobile entry point to Expo. Offline builds disable Kotlin incremental caching to avoid mixed physical/subst-root cache failures and limit Metro to two workers. No dependency sources or environment secrets were changed.

Validation: the x86_64 assembleRelease build passed, including release lint, in 7m 43s (393 actionable tasks). The verifier confirmed a 2,204,492-byte embedded bundle, x86_64 native libraries, a valid APK signature, com.trektribe.app and a non-debuggable manifest. APK size: 61,806,616 bytes. SHA-256: 7E33FCCB0F97FF1D0B163B1C33E63BF06EDBE827C0BAC2DE8CEB5C3991B905A9. Output: apps/mobile/android/app/build/outputs/apk/release/app-release.apk (ignored by Git). The verifier also rejected the Metro-only debug APK and an incorrect arm64-v8a expectation for this x86_64 APK. Both PowerShell scripts parsed successfully and git diff --check passed.

Earlier attempts exposed the native long-path error, Kotlin incremental-cache root mismatch and relative Metro entry-point error; the successful build includes their fixes. No application/API logic changed, so the application suite was not repeated for this build-tooling change. No APK installation or runtime check was performed. Airplane-mode cold startup, saved map/recording UI, ARM64/iOS builds and live Auth0 acceptance remain pending. Physical-device testing remains deferred. See OFFLINE_ANDROID_BUILD.md for install and cold-start instructions; production startup remains guarded.

## 2026-11-07 - Android offline cold-start navigation acceptance

Installed the previously verified x86_64 validation APK (SHA-256 7E33FCCB0F97FF1D0B163B1C33E63BF06EDBE827C0BAC2DE8CEB5C3991B905A9) with adb install -r on Small_Phone, API 37, x86_64. The emulator booted with 1024 MB RAM, two cores, no snapshot, host graphics and no window. The app launched without Metro.

Added scripts/android-offline-smoke.ps1: emulator-only serial validation, installed-app/boot checks, radio-state capture, airplane mode with Wi-Fi/mobile data disabled, no-active-default-network assertion, two force-stop/relaunch cycles, Offline trails and Recordings modal navigation, screenshots/UI XML, and finally-based restoration with bounded polling for asynchronous radio transitions. The script never creates, deletes or uploads a recording, but force-stopping pauses any active capture; finish test recordings first.

Final runtime run passed on emulator-5554. Evidence is in .tmp/offline-smoke-20261107-235609: both launch/trails/recordings screenshots and XML, connectivity.txt reporting Active default network: none, and result.txt. Original states were airplane disabled, Wi-Fi 1, mobile data 1; restoration was verified. An earlier complete navigation run also passed; subsequent stricter restoration checking exposed an asynchronous-state race, fixed by bounded polling and verified in the final run. PowerShell's successful adb stderr progress handling was corrected during implementation. Parser, non-emulator serial rejection and git diff --check passed. The headless emulator was stopped after validation to release memory.

Scope: bundled offline startup and navigation passed. Saved trail/map content, recorded-point persistence on native runtime, permission/GPS behavior, low-storage recovery and live account upload/restore were not tested here. Physical Moto testing remains explicitly deferred. No app/API logic or APK changed; application unit tests were not repeated for this script-only change.

## 2026-11-08 - Foreground map-download storage pressure monitor

Added a native root-level monitor independent of the trail screen and sign-in state. A five-second foreground timer checks the existing 256 MiB reserve; healthy checks avoid provider enumeration. Low/unreadable space triggers a sweep of TrekTribe-owned packs, pausing active downloads and attempting a pause when status is unreadable. Completed/inactive and unrelated regions are preserved. Individual pause failures do not prevent attempts on other packs and are reported visibly. Inventory failures are also visible. Sweeps do not overlap; foreground-generation checks prevent new mutations after lifecycle invalidation. Already-issued native operations may still finish. The web component is a no-op. No automatic removal or resume is added.

Validation: 12 targeted monitor/map-library/storage-space tests passed, mobile TypeScript passed, and web/Android/iOS JavaScript exports passed. Tests cover healthy fast path, owned/active selection, completed/inactive preservation, unrelated packs, unreadable status, partial pause failure, inventory failure and cancellation after an awaited status read. git diff --check passed. No API, database or dependency change was made.

This is a foreground safeguard, not a hard quota or reserved disk allocation. Background transfers and writes between polling intervals can consume space; provider pause can fail. Real native storage-pressure, background/resume and provider-event/UI acceptance remain pending. The previous APK and offline navigation screenshots predate this code; rebuild before testing this change on an emulator. Physical-device testing remains deferred.

## 2026-11-08 - Updated APK and saved-trail offline persistence

Rebuilt the x86_64 offline validation APK including commit 86c63ba's foreground map-storage monitor. assembleRelease passed in 4m 35s (393 actionable tasks, 12 executed). Packaging verification passed: 2,207,148-byte embedded bundle, x86_64 libraries, valid signature, expected application ID and non-debuggable manifest. APK size: 61,809,272 bytes; SHA-256 B3093FD6F73EC2D53101FF9AFD33CDDAEB4FE4A878DC34C456988636C5654EB2. The artifact remains ignored by Git at the documented release APK path.

Installed with adb install -r on Small_Phone/API 37/x86_64, preserving data. Saved the demo Chandrashila Summit through Save offline copy; the app confirmed success. Extended android-offline-smoke.ps1 with optional SavedTrailTitle: after each of two radio-disabled force-stop/relaunch cycles, it opens the first saved copy and asserts the expected title in the viewer. UI captures now remove only their own old temporary device XML before dumping, preventing a UIAutomator exit-0 failure from reusing stale evidence.

The extended test passed with no active default network. Evidence: .tmp/offline-smoke-20261108-180208, including saved-trail-1/2 screenshots/XML and result.txt. Visual inspection of saved-trail-1 confirmed the title, saved timestamp and illustrated route outline. Both existing local screen-navigation checks passed, and original radio states were restored. A deliberately wrong expected title was rejected; airplane mode/Wi-Fi/mobile data again restored to disabled/1/1. Parser and git diff --check passed. A transient emulator System UI not-responding prompt during setup recovered after choosing Wait; it did not occur in the successful test. The headless emulator was stopped afterwards; the saved demo copy was retained.

This establishes native sample-copy save/reopen across two offline process restarts, not route accuracy, downloaded terrain, recorded-point persistence, real GPS or provider login. The rebuilt monitor starts without breaking offline navigation, but low-storage pause behavior still needs controlled native acceptance. No app/API source changed in this step; unit suites were not rerun for the script-only extension. Physical-phone testing remains deferred.
