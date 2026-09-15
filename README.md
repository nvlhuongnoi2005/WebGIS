# WebGIS

## Authentication and API gateway

The application is split into `fe/` (Vite/React client) and `be/`
(Node/Express authentication gateway).
It replaces the former browser-only account store: passwords, refresh tokens,
and account data are never stored in `localStorage`.

```
Browser/mobile -> /auth and /api/gateway -> auth gateway -> private worker
                                     |                 |
                              Ed25519 JWT check    PostGIS (login/refresh only)
                                     ^
                         durable revoke-event cache
```

Normal gateway requests verify the short-lived EdDSA JWT, scope, and local
revoke cache only; they do **not** look up `users` or call an auth service per
request. The route worker is invoked only after `route:calculate` and an atomic
quota reservation succeed. In production, do not publish worker ports such as
Valhalla `8002` to client networks. The gateway builds fresh internal headers
(`user_id`, `session_id`, `scopes`, `plan`, `request_id`, `trace_id`) and never
forwards client-supplied identity headers.

### Database

`be/migrations/001_auth.sql` adds `users`, `sessions`,
`refresh_token_history`, `auth_events`, `auth_event_checkpoints`, and
`user_quotas` to an existing PostGIS database without changing spatial tables.
The migration was applied to the currently running `nominatim-db-1` database
(`nominatim`) after confirming that it did not already have conflicting auth
table names.

For another environment, configure a private `DATABASE_URL`, then run:

```bash
npm run auth:migrate
```

The current PostGIS Docker container does not publish port 5432 to Windows, so
the auth process must either run on its Docker network or use a deliberately
private PostgreSQL port mapping. Do not expose Postgres publicly. For a gateway
container on the same Docker network, use the database service DNS name and
the existing Postgres credentials from that deployment's secret store.

### Run locally

1. Copy `be/.env.example` to the ignored `be/.env`, then set a real
   `DATABASE_URL` and `AUTH_REFRESH_TOKEN_PEPPER`. Never prefix backend secrets
   with `VITE_`. The frontend's non-secret Vite variables remain in root `.env`.
2. For local development only, keep `AUTH_DEV_EPHEMERAL_KEYS=true`. It creates
   an in-memory Ed25519 key and intentionally invalidates all access tokens on
   restart. For production, set `AUTH_JWT_PRIVATE_KEY` and
   `AUTH_JWT_PUBLIC_KEY` from a secret manager, set `AUTH_SECURE_COOKIES=true`,
   and terminate HTTPS before the gateway.
3. Start the gateway with `npm run auth:dev`, and the client with `npm run dev`.

The public verification key is available as a cacheable JWKS response at
`GET /auth/.well-known/jwks.json`. Gateways must permit only `EdDSA`, issuer
`auth-service`, audience `api-gateway`, and known `kid` values. Rotate signing
keys by deploying the new active pair while retaining the previous public key
in `AUTH_JWT_PREVIOUS_PUBLIC_KEYS` for at least the access-token lifetime.

### Auth API

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/register` | Validates registration and stores an Argon2id password hash. |
| `POST /auth/login` | Rate-limited login; returns a 15-minute Bearer token and sends a rotating HttpOnly refresh cookie. |
| `POST /auth/refresh` | Rotates refresh token; replay revokes the session. Web clients send `X-CSRF-Token`; mobile may send `refresh_token` from secure storage. |
| `POST /auth/logout`, `/auth/logout-all` | Revoke the current session or all sessions. |
| `POST /auth/change-password` | Requires current password, revokes all sessions, increments auth version. |
| `GET`/`PATCH /auth/me` | Read/update the authenticated user profile. |
| `POST /api/gateway/route` | Gateway-protected Valhalla route call requiring `route:calculate`. |

`POST /api/admin/users/:userId/disable` requires `admin:manage-users`. It emits
`UserDisabled`, which blocks the account from every synchronized gateway.

### Security model and limits

- Passwords use Argon2id (`m=19456 KiB`, `t=2`, `p=1`, random 16-byte salt,
  32-byte output). Existing hashes are rehashed after successful login when
  configured work factors increase. Passwords/hashes/tokens never enter logs.
- Refresh tokens are 48 random bytes. The database stores only an HMAC-SHA-256
  hash with a server-side pepper. Rotation history detects token reuse.
- Login has per-IP and per-identity rate limiting plus a bounded Argon2 work
  semaphore. For multiple gateway replicas, move this limiter to Redis.
- Revocation uses the durable Postgres event outbox locally. On boot a gateway
  replays events and stores an offset before `/health` becomes ready; it becomes
  unready again if the event stream cannot be synchronized. For
  production multi-node delivery, replace this adapter with Redis Streams,
  NATS JetStream, or Kafka; plain Redis Pub/Sub is not sufficient.
- Quota is distinct from authentication. `user_quotas` is an atomic Postgres
  fallback for the protected route. Use Redis Lua/ledger storage for
  high-volume or billable traffic.
- The requested self-service "reset by email only" UI was removed: it would
  permit account takeover. A verified email-reset-token delivery flow is still
  needed if password recovery is required.

Run checks with:

```bash
npm test
npm run lint
npm run build
```

## Valhalla routing

The routing tool connects to the Valhalla container through `POST /route`. With the
standard Docker port mapping (`8002:8002`), leave `VITE_VALHALLA_URL` empty and run
the frontend in development; Vite proxies `/api/valhalla` to `http://localhost:8002`.
Set `VITE_VALHALLA_URL` to a public or reverse-proxied Valhalla URL for a production
build. Open the routing tool, click the map twice to choose A and B, select a vehicle,
then click `Tìm đường`.

## Tile server basemap

The Layers panel can switch to the Docker tile server and load the available datasets. Set `VITE_TILE_SERVER_URL` to the tile-server URL; it defaults to `http://localhost:8080`. The current server exposes its dataset catalog at `/`, while an optional JSON catalog endpoint can be configured with `VITE_TILE_SERVER_CATALOG_URL`.

The catalog endpoint must return JSON in this shape:

```json
[
  {
    "id": "asia_full",
    "label": "Asia full",
    "tilePath": "/datas/asia_full/{z}/{x}/{y}.png",
    "maxzoom": 7,
    "tileSize": 256
  }
]
```

After selecting `Tile server` in the Layers panel, click `Load datasets`, then select the dataset to display. New datasets become available after reloading the catalog; the frontend does not need a code change.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./fe/tsconfig.node.json', './fe/tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./fe/tsconfig.node.json', './fe/tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
