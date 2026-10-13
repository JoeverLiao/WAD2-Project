# Full Circle

Minimal Vue 3 + Vite skeleton for the group project. The home page is empty,
and the shared navbar links to every feature. Feature pages display only their
title and assigned Full Circle teammate, with TODO comments for implementation.
Only the navbar is styled; there is no sample data or feature logic.
Express and MongoDB (via Mongoose) provide the backend skeleton. Pinia is
registered for shared state when the team needs it.

## Run locally

Use Node.js `^22.18.0 || >=24.12.0` and pnpm. These commands work from either
the repository root or this application folder:

```sh
pnpm install
pnpm dev:all
```

This machine's `server/config.js` is configured for MongoDB Atlas. No Docker or
`.env` file is needed. The config contains credentials and is ignored by Git.
For a fresh clone, copy `server/config.example.js` to `server/config.js` and set
your connection string. In PowerShell: `Copy-Item server/config.example.js server/config.js`.
The app selects `full_circle` through `dbName` and creates its collections and
indexes before starting the API. No manual database or collection creation is needed.

Vue runs at `http://localhost:5173` and Express at `http://127.0.0.1:3000`.
The server connects to MongoDB before accepting requests. Visit
`http://localhost:5173/api/health` to check the frontend proxy and database connection.
Use `pnpm dev` and `pnpm dev:server` in separate terminals if preferred.
For local MongoDB instead, use the example config and run `docker compose up -d mongodb`
with Docker Desktop running. See [backend setup and routes](server/README.md) for teammate starting points.

Run all remaining commands from this application folder:

```sh
pnpm build
pnpm test:unit --run
pnpm test:server
pnpm lint
```

For browser tests, install the browser once with `pnpm exec playwright install chromium`,
then run `pnpm test:e2e --project=chromium`.

## Feature starting points

| Teammate  | Folder under `src/views/` | Routes                                          | Planned work                                                                   |
| --------- | ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Sanjana   | `account/`                | `/dashboard`, `/login`, `/register`, `/profile` | Authentication, logout, profiles, expiry alerts, inventory summaries           |
| Tarunikaa | `scanning/`               | `/scanning`                                     | Receipt upload, OCR, product scanning, corrections, inventory insertion        |
| Thanesh   | `fridge/`                 | `/fridge`                                       | Fridge/freezer/pantry, storage guidance, drag-and-drop, edit/remove items      |
| Viehha    | `freshness/`              | `/freshness-recipes`                            | Expiry tracking, Eat Soon, recipes, missing ingredients, filters               |
| Gabriele  | `rescue/`                 | `/food-rescue`                                  | Listings, search, map, pickup details, claim/unclaim                           |
| Joevan    | `analytics/`              | `/analytics`                                    | Waste metrics, savings, environmental impact, sharing history, weekly insights |

`src/views/HomeView.vue` is the blank landing page at `/`. Keep the account
dashboard separate from this landing page. All routes are currently accessible;
authentication and route protection are future work.

## Development configuration

The app uses ESLint for code checks and Prettier for consistent team formatting.
Run `pnpm lint` to check, `pnpm lint:fix` to apply lint fixes, or `pnpm format`
to format frontend and backend source. These commands also work from the repository root.

| File                                             | Purpose                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `vite.config.js`                                 | Vue build, `@` imports, and the backend development proxy                 |
| `jsconfig.json`                                  | Editor support for `@` imports                                            |
| `eslint.config.js`                               | JavaScript, Vue, and test code checks                                     |
| `.prettierrc.json`                               | Team formatting: single quotes, no semicolons, 100-character lines        |
| `.editorconfig`, `.gitattributes`                | Consistent indentation, encoding, and line endings across editors and Git |
| `vitest.config.js`, `playwright.config.js`       | Existing unit and browser tests                                           |
| `.gitignore`                                     | Excludes credentials and generated files                                  |
| Root `pnpm-workspace.yaml` and package lockfiles | Installs both project folders and records dependency versions             |

The editor and formatting configs are optional at runtime but useful for group work.

## Shared application files

- `src/App.vue`: shared navbar and routed page container.
- `src/components/AppNavbar.vue`: plain links generated from route `meta.navLabel`.
- `src/router/index.js`: routes and navigation labels. Unknown URLs return home.
- `src/stores/`: add Pinia stores when shared state is implemented.
- `src/main.js`: registers Vue Router and Pinia.

Work inside your feature folder, adding components and supporting modules as
needed. Coordinate changes to shared files and agree on inventory data fields
before connecting features. Use a separate branch per feature and merge through
pull requests. Feature controllers return HTTP 501 until implemented. Authentication,
authorization, OCR, recipes, and map integrations remain teammate work.

Production hosting must serve `index.html` for application routes because the
router uses HTML5 history mode. Route `/api` to Express in production as well;
the Vite development proxy is only active during development.
