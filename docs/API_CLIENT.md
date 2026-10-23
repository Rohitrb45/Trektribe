# Generated core API client

`api/core.openapi.json` is the source contract for the first client stage. It covers profile, trail list/detail, outings, saved trails, feed pagination, comments, and save/like actions. It is a partial specification, not a complete description of every API route.

The mobile OIDC resource loader and save/like dispatch branches use `openapi-fetch` with generated types in `apps/mobile/src/api/schema.d.ts`. Local demo storage and connected-demo aggregate endpoints keep their existing behavior. Other requests continue through the existing adapter until their contracts are added.

## Updating the contract

1. Update the contract alongside the corresponding server implementation and validation.
2. Run `npm run api:generate` and commit the generated types.
3. Run `npm run api:check`, `npm run typecheck`, and `npm test`.

CI runs the freshness check before typechecking. It detects stale generated output, not every possible server-contract mismatch. The HTTP API test exercises all nine specified operations against a real local API process. Generated response types are compile-time contracts, not runtime JSON validation. The trail adapter separately validates coordinate pairs before passing them to the core model.

Tokens are read for each request so sign-in state is not captured during module initialization. API failures preserve their HTTP status and structured message; non-JSON failures receive a generic message. No automatic mutation retry is introduced.

## Remaining coverage

Profile edits, report/comment creation, outing mutations, blocking, forums/moderation, route import, invitations, and chat HTTP endpoints still need contract coverage and client migration. Socket.IO events need their own event contracts. Live OIDC and native-device behavior still require external validation.

Generator and client documentation: https://openapi-ts.dev/introduction and https://openapi-ts.dev/openapi-fetch/.