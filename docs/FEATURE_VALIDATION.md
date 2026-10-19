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
## Trail rating totals

Each published report contributes one rating, including repeat visits by the same author. The average is rounded to one decimal; the report count includes all published reports. Blocking filters personal content without changing the shared average. Unrated trails return `rating: 0, reports: 0` and display **Not rated**.

1. Start with `npm run web`. For a connected PostgreSQL API, apply migration 008 with `npm run db:migrate` first.
2. Find a trail with no reports. Publish a report rated 2, then a second report rated 5 for that trail.
3. Return to Explore: expect **3.5 (2 reports)**. Reload the app and verify the same result.
4. Retrying a report with the same request ID must not increase the total. Automated tests also cover concurrent submissions, rounding and unchanged averages after blocking.

Existing local demo storage is recalculated on load without deleting reports. PostgreSQL uses a live aggregate view, so inserts and removals cannot leave stale counters. Legacy sample totals remain in the database for compatibility but are not used by the API. This policy does not yet include moderation or abuse weighting.

## User blocking (PostgreSQL API)

Apply migrations with `npm run db:migrate` before starting the API. In Community, select **Block author** on another person's report. Their reports disappear after refresh. In Profile, open **Blocked people** to unblock them. Local-only mode does not offer blocking; a connected JSON demo returns an explanatory error because blocking requires PostgreSQL.

With two accounts, verify both feeds hide the other's reports and comments; likes, comments, new joins, approvals and invitation redemption fail between blocked accounts. Unblocking one side does not override a block made by the other account. Existing shared outings and rosters remain accessible so participants can leave; chat history fetched from the server excludes blocked authors. Shared group messages can still be sent to other participants. Public trail geometry remains accessible.

Refresh other open app sessions and reopen conversations after changing blocks: already downloaded content is not remotely erased. The database integration suite exercises these rules without requiring an external identity provider. Live two-account sign-in and physical-device checks remain pending.
