# Generated core API client

`api/core.openapi.json` is the source contract for the core client. It covers profile, trail list/detail, outings, saved trails, feed pagination, comments, and all core command mutations (22 operations total, including blocking and invitations). It is a partial specification, not a complete description of every API route.

The mobile OIDC resource loader and core command dispatch use `openapi-fetch` with generated types in `apps/mobile/src/api/schema.d.ts`. Local demo storage and connected-demo aggregate endpoints keep their existing behavior. Other requests continue through the existing adapter until their contracts are added.

## Updating the contract

1. Update the contract alongside the corresponding server implementation and validation.
2. Run `npm run api:generate` and commit the generated types.
3. Run `npm run api:check`, `npm run typecheck`, and `npm test`.

CI runs the freshness check before typechecking. It detects stale generated output, not every possible server-contract mismatch. The HTTP API test exercises core read and mutation operations against a real local API process. Generated response types are compile-time contracts, not runtime JSON validation. The trail adapter separately validates coordinate pairs before passing them to the core model.

Tokens are read for each request so sign-in state is not captured during module initialization. API failures preserve their HTTP status and structured message; non-JSON failures receive a generic message. No automatic mutation retry is introduced.

## Remaining coverage

Forums/moderation, route import, and chat HTTP endpoints still need contract coverage and client migration. Socket.IO events need their own event contracts. Live OIDC and native-device behavior still require external validation.

Generator and client documentation: https://openapi-ts.dev/introduction and https://openapi-ts.dev/openapi-fetch/.
The nine added mutation request schemas are derived from server command validators. Tests compare them to those validators to catch drift. The command adapter preserves retry IDs and rejects unsupported profile-level or report-condition values before sending; server validation and authorization remain authoritative.

Blocking and invitation calls now use the generated client. The PostgreSQL integration suite starts a real HTTP API to verify block/unblock, blocked invitation rejection, invitation creation, and repeat acceptance. Invitation tokens remain in request bodies, never query parameters.
