# Full Circle backend skeleton

Express 5 handles HTTP requests. Mongoose connects to MongoDB. All dependencies
and scripts are in the parent application's `package.json`; run commands there.

## What works now

- MongoDB connection on startup, with a five-second connection timeout.
- App-managed collection and index creation before the API starts accepting requests.
- `GET /api/health`: pings MongoDB, returning 200 when connected or 503 when unavailable.
- JSON parsing, a 1 MB request limit, JSON errors, and JSON 404 responses.
- Separate routers and controllers for each teammate's features.
- Starter Mongoose models with basic field validation and timestamps.
- Shutdown closes the HTTP server and MongoDB connection.

Feature endpoints deliberately return `501` with `{ "error": "Not implemented", "feature": "..." }`.
They do not read or write user data yet. The schemas are starting points for the
team to agree on, not finished domain models. Authentication, ownership checks,
request validation, and business logic must be implemented with each feature.

## Structure

```text
server/
  index.js             # Startup and shutdown
  config.js            # Private MongoDB URI, database name, DNS, port, and host (Git ignored)
  config.example.js    # Shareable config for teammates
  app.js               # Express middleware and mounted routes
  config/database.js   # Connect, initialize collections/indexes, ping, disconnect
  routes/              # URL/method definitions per feature
  controllers/         # Teammate TODOs; replace the 501 handlers here
  models/              # User, InventoryItem, FoodListing, FoodEvent
  tests/               # HTTP tests using an injected database health check
```

## Feature routes

All paths below have the `/api` prefix.

| Owner     | Router / controller | Endpoints                                                                            |
| --------- | ------------------- | ------------------------------------------------------------------------------------ |
| Sanjana   | `auth.js`           | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET/PATCH /auth/me` |
| Sanjana   | `dashboard.js`      | `GET /dashboard`                                                                     |
| Tarunikaa | `scanning.js`       | `POST /scanning/receipts`, `POST /scanning/products`, `POST /scanning/confirm`       |
| Thanesh   | `inventory.js`      | `GET/POST /inventory`, `GET/PATCH/DELETE /inventory/:id`                             |
| Viehha    | `freshness.js`      | `GET /freshness`, `GET /freshness/recipes`                                           |
| Gabriele  | `rescue.js`         | `GET/POST /rescue`, `GET/PATCH/DELETE /rescue/:id`, `POST/DELETE /rescue/:id/claim`  |
| Joevan    | `analytics.js`      | `GET /analytics`, `GET /analytics/history`, `POST /analytics/events`                 |

The `User` model intentionally has no password field until the authentication
approach is implemented. Determine the user from the authenticated session in
controllers; the `user` field in a request body is not proof of ownership.
Inventory `purchasePrice` is the total purchase price in SGD for that inventory
entry. Agree on quantities, units, and event handling before connecting features.

## Configuration and commands

The private `server/config.js` contains the supplied Atlas URI with its password
filled in. The URI keeps its trailing slash; `dbName: 'full_circle'` selects the
application database separately. The file is ignored by Git. New teammates copy
`server/config.example.js` to `server/config.js` and set their connection details.
The backend imports this config directly; no environment file is required.

Other settings are `port` (3000), `host` (127.0.0.1), and optional `dnsServers`.
This machine uses `['1.1.1.1', '8.8.8.8']` because Node's default local DNS resolver
refuses the Atlas SRV lookup. Set `dnsServers: []` to use your system's default
resolver. This setting only affects the running Node process, not Windows settings.

On every startup, the app connects, creates missing collections, and ensures the
indexes declared by the models. It then starts Express. Existing records and
unrelated indexes are preserved; no sample records are inserted. In MongoDB,
the equivalents of tables are collections:

| Model         | Collection in `full_circle` |
| ------------- | --------------------------- |
| User          | `users`                     |
| InventoryItem | `inventory_items`           |
| FoodListing   | `food_listings`             |
| FoodEvent     | `food_events`               |

Register additional models in `server/models/index.js` to initialize them at startup.
Initialization uses [Mongoose collection/index creation](https://mongoosejs.com/docs/api/model.html).

The optional `compose.yaml` runs local development MongoDB on the loopback
interface with persistent storage. Start Docker Desktop, then run
`docker compose up -d mongodb`. For Atlas, change `mongodbUri` in the config file instead.

```sh
pnpm dev:server   # Watch backend files
pnpm dev:all      # Vue and Express together
pnpm start:server # Backend without watch mode
pnpm test:server  # HTTP tests; no running MongoDB required
```

The automated tests simulate database availability and initialization failures.
To check the real Atlas connection and initialize collections, start the server, then open
`http://127.0.0.1:3000/api/health`.

Vue can call the shared helper without any page UI changes:

```js
import { apiRequest } from '@/services/api'

const health = await apiRequest('/health')
// Future example (currently returns 501):
// await apiRequest('/inventory', { method: 'POST', body: { ... } })
```

Vite proxies `/api` to port 3000, so no CORS setup is needed for this development
flow. If you change `port`, also update the proxy target in `vite.config.js`.
Production needs a reverse proxy that sends `/api` to Express and serves Vue
separately. Never expose MongoDB credentials through a `VITE_` variable.

Framework references: [Express error handling](https://expressjs.com/en/5x/guide/error-handling/)
and [Mongoose connections](https://mongoosejs.com/docs/connections.html).
