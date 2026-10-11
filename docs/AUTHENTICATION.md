# Configurable OIDC development mode

Demo mode remains the default. OIDC mode requires a provider that issues RS256 or ES256 JWT access tokens for a dedicated TrekTribe API audience. No provider account or credentials are bundled. Provider login and native redirect handling have not yet been tested against a live tenant.

## Backend

Apply migrations with `npm run db:migrate` and `DATABASE_URL` set. `DEMO_MODE=true` additionally seeds sample trails/users; without it, migration does not seed data. Existing data is preserved. The server still refuses `NODE_ENV=production`.

Export these settings before `npm run api`:

```text
AUTH_MODE=oidc
DEMO_MODE=false
DATABASE_URL=postgres://...
OIDC_ISSUER=https://your-provider.example/
OIDC_AUDIENCE=your-trektribe-api-audience
OIDC_JWKS_URL=https://your-provider.example/keys
```

Copy the exact issuer and JWKS URL from your provider. JWT verification requires a trusted signature, issuer, audience, subject, issued-at, and expiry. Expired/not-yet-valid tokens are rejected. Identity mapping uses `(issuer, subject)`, never an email or user ID supplied by the client. Account provisioning is transactional and safe across simultaneous first requests. Demo endpoints and the static demo token are unavailable in OIDC mode.

User endpoints include `GET/POST /v1/me`, saved trails, posts, likes, comments, and outing creation/join/leave/approval/cancellation. Inputs reject unknown identity fields. Profiles preserve server-owned identity and activity fields. Saved trails are only returned for the authenticated user.

## Client

Configure `apps/mobile/.env.local` with public settings only:

```text
EXPO_PUBLIC_AUTH_MODE=oidc
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_OIDC_ISSUER=https://your-provider.example/
EXPO_PUBLIC_OIDC_CLIENT_ID=your-public-client-id
EXPO_PUBLIC_OIDC_AUDIENCE=your-trektribe-api-audience
```

Register a public authorization-code client with PKCE. Allow the callback returned by Expo AuthSession: the native development build uses the `trektribe` scheme and `/auth` path; the web callback uses the running web origin and `/auth`. Configure separate native/web public clients if required by the provider. Never embed a client secret. The optional audience parameter must match your provider's authorization endpoint contract.

Access tokens are stored in OS secure storage on native and in memory on web. Expiry requires signing in again; refresh tokens are not requested or stored. Sign-out clears the local session, not the provider's browser session. Web reload requires sign-in again. OIDC native sign-in requires an app build configured with the custom scheme; Expo Go is not proof of that flow.

The client uses resource endpoints in OIDC mode and displays the first 50 feed posts. Blocking, private visibility, moderation, full feed navigation, and production hardening remain subsequent work; do not expose this development API publicly.
