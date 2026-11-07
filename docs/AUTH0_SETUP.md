# Set up Auth0 for TrekTribe development

Prepared 2026-11-07. This guide matches the existing Expo AuthSession authorization-code/PKCE flow; no Auth0 SDK or client secret needs to be added to the app. The tenant and live login have not been configured or verified. Start with web validation while physical-device testing is deferred.

## 1. Create the API and public applications

Create an Auth0 account/tenant, then use **Applications → APIs → Create API**. Name it `TrekTribe development`, choose an identifier such as `https://trektribe.local/api`, the Auth0 JWT profile and **RS256**. The identifier is an audience, not the address of the running API, and must match exactly in client/server settings. Configure the API's user-flow access policy to authorize the TrekTribe public applications. See [Auth0 API registration](https://auth0.com/docs/get-started/auth0-overview/set-up-apis).

Create two applications: `TrekTribe Web` as **Single Page Application**, and `TrekTribe Native` as **Native**. Enable a database/password connection for test users. Use authorization code with PKCE and public-client token endpoint authentication (no client secret). Auth0 documents this flow for [native and single-page clients](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/call-your-api-using-the-authorization-code-flow-with-pkce).

Use these values for this repository:

| Application | Allowed Callback URLs | Allowed Web Origins / Allowed Origins (CORS) |
| --- | --- | --- |
| Web, Metro port 8081 | `http://localhost:8081/auth` | `http://localhost:8081` |
| Native development build | `trektribe://auth` | Not needed for the native client |

If web uses another hostname or port, register that exact origin and `/auth` callback instead. Do not copy callback paths from the Auth0 React Native SDK examples: TrekTribe uses Expo AuthSession and its own `trektribe` scheme. Callback/origin allowlists are configured in [Auth0 application settings](https://auth0.com/docs/get-started/applications/application-settings). Keep the public **Domain** and the two **Client IDs**; do not copy a client secret into the repository or chat.

## 2. Configure the local API

Open `https://YOUR_TENANT_DOMAIN/.well-known/openid-configuration` in your browser. Copy its exact `issuer` and `jwks_uri`. Keep the trailing slash on the issuer if discovery includes it. Use the same tenant/domain consistently.

In a PowerShell terminal at the repository root, set these environment variables with your values:

```powershell
$env:NODE_ENV = 'development'
$env:AUTH_MODE = 'oidc'
$env:DEMO_MODE = 'false'
$env:DATABASE_URL = 'YOUR_LOCAL_POSTGRES_CONNECTION_STRING'
$env:OIDC_ISSUER = 'https://YOUR_TENANT_DOMAIN/'
$env:OIDC_JWKS_URL = 'COPY_JWKS_URI_FROM_DISCOVERY'
$env:OIDC_AUDIENCE = 'https://trektribe.local/api'
$env:CORS_ORIGINS = 'http://localhost:8081'
npm run db:migrate
npm run api
```

Use your existing local PostgreSQL/PostGIS configuration. Migrations preserve existing data; `DEMO_MODE=false` does not seed sample trails. An empty development database can therefore show no trails. Backend `.env` files are not automatically loaded, so set the variables in the terminal running these commands. Production startup remains disabled.

## 3. Configure the web client first

Merge these public values into `apps/mobile/.env.local`, preserving the existing Mapbox token and unrelated settings:

```dotenv
EXPO_PUBLIC_AUTH_MODE=oidc
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_OIDC_ISSUER=https://YOUR_TENANT_DOMAIN/
EXPO_PUBLIC_OIDC_CLIENT_ID=YOUR_WEB_APPLICATION_CLIENT_ID
EXPO_PUBLIC_OIDC_AUDIENCE=https://trektribe.local/api
```

Restart Metro with `npm run web`. If its port changes, update both the Auth0 web callback/origin and backend `CORS_ORIGINS`. Sign in using two separate browser profiles, each with a different test user. Native testing later uses the **Native** client ID instead. For Android connected through ADB, `adb reverse tcp:3001 tcp:3001` lets the device reach this PC's localhost API; Metro requires its own reverse mapping. These are development-only URLs.

## 4. Verify two accounts

1. Create two test users through the enabled connection/hosted sign-up flow. Open browser profiles A and B independently and sign in.
2. Edit each TrekTribe profile; verify they stay separate after re-login. Save a trail in A and confirm B's saved list is unaffected.
3. Publish separate stories and like each other's stories. Try editing/deleting the other user's content: the API must reject it, not merely hide a UI button.
4. Create an outing with A. B must not change its organizer settings or approve participants without an explicitly granted cohost role. Test private invitations and blocking using the existing validation guide.
5. Test sign-out and expired sessions. Current sign-out clears TrekTribe's token only; it does not end the provider's browser session. No refresh token is requested, and web reload requires sign-in again.

For callback errors, compare the exact redirect URI with the allowlist. For token-exchange errors, check the application type, public-client authentication and authorization-code grant. For API 401s, check issuer, audience, RS256 and JWKS configuration; do not paste access tokens into logs or chat. Native callback handling, iOS and production release remain separate acceptance work.
