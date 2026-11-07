# Private recording upload protocol — server stage

Implemented 2026-11-07. The app still records locally: no upload button, automatic upload or sync worker is connected. These endpoints establish the server protocol and generated client adapter for the next stage. Live OIDC and native acceptance remain separate tasks.

## Server contract

All routes use the existing authenticated actor and PostgreSQL. JSON-demo storage responds with 409. The API never accepts an owner ID from a request body. Owner and upload ID form a composite key; identical local IDs on two accounts are separate recordings. Responses for another owner's recording are 404.

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

Removal is idempotent for the owner. It deletes GPS payloads and clears the title/last timestamp. An owner/upload-ID tombstone retains declaration/counter/completion metadata and deletion time so delayed creation or chunk retries cannot resurrect deleted data. This is not the app-wide permanent-erasure feature. Tombstone retention and abuse/rate limits require release policy.

## Migration and verification

Migration `012_private_tracks.sql` runs through `npm run db:migrate` with the configured PostgreSQL database. Existing trails/local SQLite databases are unaffected. Do not switch the production guard off.

`tests/private-tracks.test.ts` checks request/response schema drift, canonical checksums, strict input validation and generated adapter retry payloads. `tests/integration/postgres.test.ts` adds actual PostgreSQL checks for owner isolation, concurrent retries, final-slot quota races, ordering, completion, legacy migration repeatability, HTTP routing and deletion/tombstones. Its harness creates and drops an isolated database on `TEST_DATABASE_URL`; it does not clear the supplied database. CI's database job supplies PostgreSQL/PostGIS.

## Next client stage

Only finished recordings should be offered for upload initially. Include the persisted partial tail as a final upload chunk, then freeze the declared totals. Prompt explicitly before uploading device-local GPS data into the signed-in account. Persist an outbox keyed by API/issuer/subject and a fresh upload ID; never move pending uploads to another account on sign-in changes. Reconcile progress with the server after timeouts, retry identical chunks, complete only after all acknowledgments, and expose explicit remote deletion distinct from local deletion. None of that client lifecycle is claimed by this server increment.
