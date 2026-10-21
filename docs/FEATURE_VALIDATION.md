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

The dispatcher sends only change notifications to currently accepted members; disconnected clients backfill on reconnect. Without Redis, only one dispatcher may use a database. With Redis configured consistently on all API instances, independent dispatchers claim outbox rows and publish hints to every instance, which rechecks authentication and membership locally. Presence and persistent unsent drafts remain pending. Unsent drafts can be lost when the app closes. Device lifecycle and live OIDC redirects remain unverified.

Run `npm test` for local checks and `npm run test:db` with `TEST_DATABASE_URL` and `TEST_REDIS_URL` for real PostGIS/Redis/socket tests. Use disposable services: the database suite creates and drops its own database, and the Redis test creates/removes a temporary ACL user and isolated channel. The Redis test connection needs ACL administration privileges. See `VERIFICATION.md` for recorded results.

## Chat across API instances

Set `DATABASE_URL`, `REDIS_URL` (for example `redis://localhost:6379`), and the same `CHAT_REDIS_CHANNEL` on every instance serving the same app. Use a different channel per environment; Redis Pub/Sub is not isolated by database number. Backend variables must be exported into the process environment; `.env` is not loaded automatically. Redis is optional for single-instance development. Redis configuration failures stop startup rather than silently falling back to local delivery. All instances sharing a database must use the same mode; a PostgreSQL advisory lock rejects mixed modes or multiple local dispatchers.

Start two APIs on different ports, connect accepted outing members to each, and send a message. Both clients should refresh. Nonmembers must receive neither history nor conversation-change hints. Stop one API; the other should continue to serve history and publish notifications. Redis carries only outing IDs, never message bodies. PostgreSQL remains authoritative for membership and replay.

If Redis publishing fails, message acknowledgments still follow the PostgreSQL commit, and undelivered outbox rows retry. Successful publication means Redis accepted the hint, not that every client received it. Offline subscribers, transient notification errors, or a full bounded notification buffer may miss hints; the app's five-second sync and reconnect backfill recover history. Publication timeouts may produce duplicate hints, which only trigger synchronization. See the [Redis Pub/Sub delivery documentation](https://redis.io/docs/latest/develop/use-cases/pub-sub/nodejs/).

When putting Socket.IO behind a load balancer, configure sticky sessions for its default polling transport, or deliberately configure WebSocket-only transport throughout. This implementation uses Redis for application notifications, not a shared Socket.IO transport session. Redis presence, cluster/sharded Pub/Sub, and load-balancer/device testing remain pending. A lost PostgreSQL coordination connection disables notifications on that instance and requires an API restart. Production startup remains disabled.
## Community discussions (PostgreSQL API)

### Editing, deletion and moderation

Apply migration 011 with `npm run db:migrate`. On your own thread or reply, use **Edit**, then **Save changes**. Editing uses a revision check: if another session saves first, refresh before retrying. Replies cannot be edited in closed discussions. Use **Delete → Confirm deletion** to hide your content; deleting a discussion also hides its replies. Retained database records and report snapshots are available for moderation review; deletion is not permanent erasure and cannot be undone through the app.

Use **Report content** and provide a reason. Duplicate submissions by the same person create only one open report per target. A new report can be filed after the previous one is resolved. Blocked or removed content cannot be reported through these endpoints.

Moderator access is granted by a database administrator, never by a profile field or client request. After obtaining the intended account's UUID from `/v1/me`, an administrator can run `INSERT INTO forum_moderators(user_id) VALUES ('<account-uuid>') ON CONFLICT DO NOTHING;`. Revoke access with `DELETE FROM forum_moderators WHERE user_id='<account-uuid>';`. No moderator is assigned automatically by migrations or demo seeding. Use distinct authenticated accounts for multi-user manual validation.

Reopen Community discussions after granting access. **Moderation reports** shows reported snapshots alongside current content. Enter a decision reason, then dismiss the report or remove the reported content. Decisions are recorded in `forum_moderation_actions`. Ordinary users cannot access the queue or submit decisions, even by calling the API. Revocation is checked on every queue/action request. Removed content cannot be restored by editing, reopening or retrying its original creation request.

Validation: try modifying another person's reply, save conflicting edits from two sessions, report content then edit it, remove it as moderator, and verify it disappears after refresh. Existing screens must be refreshed to discard already loaded content. Moderator tools deliberately have access to reported content regardless of personal blocks. Bulk actions, appeals, restoration, notifications and permanent-erasure workflows remain pending.

### Creating and browsing

Apply migration 010 with `npm run db:migrate`, connect the app to the API, and open **Community → Community discussions**.

1. Publish a title and opening message. Close/reopen the screen or restart the API; the discussion must remain.
2. Open it, send a reply, and use **Refresh discussion** to reload. Use **More discussions/replies** when a page contains more than 20 items.
3. As the thread author, close the discussion. New replies must fail, while existing replies remain readable. Reopen it to allow replies again. Other accounts cannot close or reopen your discussion.
4. Block another participant using the existing report-author control. Refresh discussions: their threads and replies disappear. A blocked user cannot reply to your thread, even by retrying an earlier submission.

Discussion titles are limited to 120 characters, opening messages to 5,000, and replies to 2,000. Retrying the same creation request ID and unchanged content creates only one record; retries after editing or removal may be rejected and never restore content. Threads are newest-first; replies are oldest-first. The app supports manual refresh rather than realtime forum notifications. Drafts are kept only while the screen is open. Local-only mode does not show discussions; a connected JSON API returns an explanatory PostgreSQL requirement error.

## Outing cohosts

For PostgreSQL, run `npm run db:migrate` to apply migration 009. Cohost controls also work in the local demo.

1. As organizer, approve a participant, then select **Make cohost** beside their entry on the outing card. Pending participants cannot be promoted.
2. As that participant, check the **You are a cohost** label and approve another pending request. Capacity and block rules still apply.
3. Confirm cohosts cannot cancel the outing, issue invitations, appoint other cohosts or promote themselves. These remain organizer permissions.
4. As organizer, select **Remove cohost**. Subsequent approvals by that person must fail, including requests from a stale screen.
5. A cohost can leave normally. Rejoining creates an ordinary pending membership; it does not restore their role.

With local demo identity, use an outing you organize to test assignment/removal. Testing the other person's UI requires separate authenticated accounts; the automated database suite tests those actors without an external provider. Blocking between the organizer, cohost and applicant prevents delegated approval; removing a role remains available after blocking or cancellation.

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
