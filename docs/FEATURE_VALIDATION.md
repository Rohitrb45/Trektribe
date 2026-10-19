# Validate the new features

## Local demo

Start `npm run web` with Node 22.13+.

- Profile → Edit profile: change display name, bio, experience, and gear; reload to verify persistence.
- Trips → Plan an outing: choose a trail, a future local date/time, and capacity. Verify the organizer occupies one place and the outing survives reload.
- Cancel your outing and verify it no longer accepts joins or approvals.

## Connected PostgreSQL mode

Apply migrations using `DATABASE_URL`, `DEMO_MODE=true`, and `npm run db:migrate`, then start the API. Set `EXPO_PUBLIC_API_URL` before starting Expo. Migration 006 adds persisted messages and an outbox without replacing existing data.

- Explore → Import GPX trail: select a continuous `.gpx` route or track under 1 MB/10,000 points. Verify invalid coordinates, entity declarations, malformed files, and multiple segments are rejected.
- Create an outing on your imported trail, then replace its GPX route in trail details. The outing's **View outing route** must still show the original version.
- Create a private outing and an invitation. In OIDC mode, another account must not discover it until it redeems the invitation. A redeemed code cannot be used by a different account; invitations expire after at most seven days or at the outing start.
- Accepting an invitation creates a pending request. Approve it before testing chat.
- Open conversation as an accepted member. Send a message, reconnect, and verify it remains. A retry using the same request ID must not duplicate it. After leaving the outing, synchronization and sending must be denied.

Socket events are `trip:send` (tripId, id, body) and `trip:sync` (tripId, after). Authentication is checked on connection and each event. Success acknowledgments follow the database commit. Each message receives a per-outing sequence and an outbox row in the same transaction. Notifications prompt synchronization; PostgreSQL history is authoritative.

The current dispatcher supports one API process. It sends only change notifications to currently accepted members; disconnected clients backfill on reconnect. Redis fan-out, presence, persistent unsent drafts, and multi-process delivery are not implemented. Unsent drafts can be lost when the app closes. Device lifecycle and live OIDC redirects remain unverified.

Run `npm test` for local checks and `npm run test:db` with `TEST_DATABASE_URL` for real PostGIS/socket tests. The database suite creates and drops its own test database. See `VERIFICATION.md` for recorded results.
