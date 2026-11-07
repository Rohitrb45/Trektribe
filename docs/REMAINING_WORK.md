# Remaining work

Current status: 2026-11-07. This is the current checklist; dated progress paragraphs in NEXT_STEPS.md are historical. The app is a development build, not a completed production release.

## Completed in code

- Multi-user JWT/PKCE integration, ownership and organizer policies, blocking, invitations, cohosts, forums/moderation and typed API clients.
- PostgreSQL/PostGIS migrations, route versions/GPX ingestion, pagination, persisted chat, outbox and Redis coordination, with automated coverage recorded in VERIFICATION.md.
- Native map rendering and downloads, a map library, saved SQLite trail copies, foreground recording, durable partial chunks, checksums and retry-safe persistence.
- Low-space preflight checks for local writes (64 MiB reserve) and starting/resuming map downloads (256 MiB reserve). These do not reserve disk space or enforce a hard provider-cache byte quota.
- Auth0 setup instructions matching the existing client: [AUTH0_SETUP.md](AUTH0_SETUP.md). Creating the tenant and proving live sign-in remain open.

## Still open

| Priority | Item | What completion requires | Dependency/status |
| --- | --- | --- | --- |
| 1 | Live identity validation | Two real accounts, native/web redirects, session expiry, ownership/private-visibility acceptance | User creates tenant/public apps using AUTH0_SETUP.md; no secrets should be shared |
| 1 | Recording and offline UI runtime | Permission denial/revocation, GPS fixes, pause/resume, restart, partial chunks, low-storage recovery and removal on native runtime | Last emulator stayed offline under memory pressure; needs a working emulator |
| 1 | Physical Android acceptance | Moto GPS accuracy, screen lock, background transitions, long walks, interrupted writes, battery and storage pressure | Explicitly deferred by user |
| 1 | Truly offline cold startup | Build with bundled JavaScript; launch without Metro/network; open saved trails/maps/recordings | Development APK requiring Metro is insufficient evidence |
| 2 | Background recording | Native background task/service, opt-in permissions, lifecycle recovery and clear ongoing-recording controls | Not implemented; foreground capture intentionally pauses |
| 2 | Private track sync | Owner-scoped server sessions/chunks, checksum/idempotency contracts, durable client outbox/cursors, retries/conflicts and deletion | Server endpoints, migration 012, generated adapter, account/API-scoped SQLite outbox and explicit native upload/retry/removal controls implemented. Application and PostgreSQL CI passed for the mobile outbox and deletion-race update; confirmed remote restore UI is implemented; live-account/native end-to-end acceptance remains pending. Uploads require confirmation |
| 2 | Media pipeline | Owner-scoped S3/R2 upload authorization, bounded validation, worker processing/metadata removal, readiness and interrupted-upload recovery | Not implemented; live verification also needs object storage configuration |
| 2 | Moderation appeals and erasure | Appeal submission/review and audit policy; permanent deletion covering database, attachments, outbox and local caches | Not implemented; retention/review policy needs definition before irreversible erasure |
| 2 | Provider storage budget | Monitor in-progress downloads, hard cache/region budget and storage-pressure recovery | Preflight reserves and area-count limits exist; hard byte enforcement does not |
| 3 | iOS native acceptance | Build/sign, maps, SQLite, GPS and auth redirects on supported iOS hardware | Requires macOS/Xcode and an iOS target |
| 3 | Multi-instance deployment acceptance | Load-balancer reconnects, membership revocation, Redis outages, duplicate outbox delivery and restart recovery | Code/tests exist for coordination; deployed load-balancer validation remains open |
| 3 | Release hardening | Dependency/security review, staging configuration, backup/restore, observability, CI/release checks and removal of production guard only after acceptance | Production startup remains disabled |

## Validation boundaries

Passing TypeScript/tests or generating an APK does not establish real GPS, provider login, cloud uploads or battery behavior. Consult VERIFICATION.md for exactly what ran. Do not mark external integrations complete from mock tests. Device-local recordings are accessible without sign-in and must not be uploaded automatically when sync is added.

Recommended implementation order after the current safeguards: live web identity setup/verification and native recording smoke test; private sync contracts/outbox; media pipeline; background recording with device acceptance; appeals/erasure; staging and release validation. Physical testing remains deferred until the user changes that preference.
