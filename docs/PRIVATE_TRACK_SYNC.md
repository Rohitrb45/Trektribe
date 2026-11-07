# Private recording upload protocol and mobile queue

Implemented 2026-11-07. The native recording screen now offers explicit private upload, retry and removal controls for finished recordings. Capture remains local by default. Live OIDC and native end-to-end acceptance remain separate tasks; no automatic/background sync worker is connected.

## Server contract

All routes use the existing authenticated actor and PostgreSQL. JSON-demo storage responds with 409. The API never accepts an owner ID from a request body. Owner and upload ID form a composite key; identical local IDs on two accounts are separate recordings. Reads/writes for another owner's recording are 404. Removal always acknowledges deletion in the authenticated owner's namespace, including an absent ID, without affecting another owner.

| Route under `/v1` | Behavior |
| --- | --- |
| `POST /me/recordings` | Create/retry `{id,title,chunkCount,pointCount}`; metadata must match on retry |
| `GET /me/recordings` | List this owner's live uploads, including incomplete uploads |
| `GET /me/recordings/:id` | Read progress/counters/completion |
| `POST /me/recordings/:id/chunks/:sequence` | Save `{checksum,points}` in zero-based sequence order |
| `GET /me/recordings/:id/chunks/:sequence` | Read an owner-only chunk, checking stored integrity |
| `POST /me/recordings/:id/complete` | Empty object body; completes only at exact declared totals |
| `POST /me/recordings/:id/remove` | Empty object body; remove all GPS chunks, retain deletion tombstone |

Limits: 20 live uploads per account, 500 chunks per upload, 200 points per chunk, 100,000 points total. Points must have increasing millisecond timestamps both within and across chunks, valid longitude/latitude, nonnegative accuracy and numeric/null altitude. Canonical point serialization is shared between mobile and server in `packages/core/src/track-points.ts`; the checksum is lowercase SHA-256 of its UTF-8 JSON output. Hashes do not replace authentication.

Chunk data and progress commit in one transaction under the upload's row lock. Concurrent identical retries acknowledge the saved result without increasing counters. Conflicting payloads, out-of-order chunks, excess points or premature completion fail. Account creation locks enforce the live-upload quota across server instances. Existing chunks remain immutable after completion; exact retries are still acknowledged.

Removal is idempotent for the owner and creates a tombstone even if a delayed create request has not arrived yet. It takes the same owner lock as creation. It deletes GPS payloads and clears the title/last timestamp. An owner/upload-ID tombstone retains declaration/counter/completion metadata and deletion time so delayed creation or chunk retries cannot resurrect deleted data. This is not the app-wide permanent-erasure feature. Tombstone retention and abuse/rate limits require release policy.

## Migration and verification

Migration `012_private_tracks.sql` runs through `npm run db:migrate` with the configured PostgreSQL database. Existing trails/local SQLite databases are unaffected. Do not switch the production guard off.

`tests/private-tracks.test.ts` checks request/response schema drift, canonical checksums, strict input validation and generated adapter retry payloads. `tests/integration/postgres.test.ts` adds actual PostgreSQL checks for owner isolation, concurrent retries, final-slot quota races, ordering, completion, legacy migration repeatability, HTTP routing and deletion/tombstones. Its harness creates and drops an isolated database on `TEST_DATABASE_URL`; it does not clear the supplied database. CI's database job supplies PostgreSQL/PostGIS.

## Mobile queue

In the native recording screen, finish a nonempty recording and choose **Upload privately**. The app resolves the signed-in account through authenticated `/me` and asks for confirmation naming that account. It reconnects and verifies the same account after confirmation, then freezes all sealed chunks and the persisted partial tail into a separate SQLite outbox. There are at most 20 upload entries per device across accounts. Tokens are never persisted in the outbox.

The queue key combines the configured API URL, OIDC issuer and the server profile ID (derived server-side from verified issuer/subject). Each network run freezes the current token and rejects replacement/expired credentials before each request. Closing the screen or backgrounding invalidates the run even if the app returns before an in-flight response arrives. Requests already sent can finish against the original account; they cannot be redirected to a replacement account. Requests time out after 15 seconds, including response-body reading.

Preparation is atomic and performs free-space checks. The finished local recording can subsequently be deleted without corrupting a queued upload. **Delete local recording** removes only that original; its frozen outbox copy remains until upload completion or acknowledged server removal. Upload completion discards redundant queued GPS payloads but retains a small remote-deletion handle. **Remove server copy and upload entry** persists deletion intent, then requests idempotent server removal. Failed deletion remains visibly pending and must be retried. A fresh authenticated account lookup is required to manage its queue; offline deletion is not silently queued before identity verification.

Use **Load this account's uploads** and **Retry upload** after a restart or interruption. The server's acknowledged sequence/count reconcile lost responses; exact retries cannot duplicate points. Each job is independently scoped and only the current account's entries are shown. No job is sent just because the app restarted, regained connectivity or signed into an account. Re-uploading a removed recording needs a new explicit confirmation and new upload ID.

## Remaining acceptance

Unit tests exercise real SQLite reopen/rollback, lost create/chunk/complete/delete acknowledgments, frozen-token guards, account-scope isolation, integrity and deletion recovery. PostgreSQL integration tests cover delete-before-create and create/delete races. Live-provider/two-account native UI testing remains pending. The UI now lists the current account server recordings and restores completed uploads after explicit confirmation. Full account erasure, tombstone retention/rate policy, background sync and physical-device testing remain separate work.
