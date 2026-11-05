# Full Circle

Full Circle is a food inventory and food-sharing web application. It helps households keep track of groceries across the fridge, freezer, and pantry, use food before it expires, find recipes for available ingredients, and pass surplus food to neighbours.

## Project goals

The application aims to make household food easier to manage by:

- Keeping one searchable inventory for food stored in different places.
- Highlighting food that is approaching or past its recorded use-by date.
- Helping users decide where to store groceries and what to cook with them.
- Making it easier to offer extra food locally and coordinate collection.
- Showing users the food activity and waste they have recorded over time.

## Features

- **Accounts and dashboard:** Register, log in and out, update profile details, and view an overview of tracked food, urgent items, recipe suggestions, and unread rescue messages.
- **Smart Fridge:** View food in a visual fridge, freezer, and pantry; search storage; add, edit, remove, and move items; and see expiry labels and storage guidance. Food can be dragged between supported storage areas.
- **Receipt and manual food entry:** Upload a receipt image for OCR and parsing, or enter items manually. Review and correct the suggested items before saving them to inventory. The review flow includes quantity, category, storage location, purchase date, and expiry details where available.
- **Freshness and recipes:** Review items by freshness and expiry, get ingredient-based recipe suggestions, explore and search recipes, inspect recipe details, filter and sort suggestions, and save or mark recipes as cooked.
- **Neighbour Food Rescue:** Browse and filter local food listings on a map or in a list, create and manage listings, add listing photos, request collection, and coordinate through messages and pickup proposals.
- **Food waste analytics:** Record consumed, discarded, shared, and rescued food activity. Review summaries and history, compare date ranges, and see recorded weights and values, community activity, and foods most often discarded.
- **Food icons and storage advice:** Categorised food icons and rule-based storage suggestions help users organise inventory. Optional AI assistance can enrich some unknown food items.

## Technology and integrations

- **Client:** Vue 3, Vite, Vue Router, Pinia, Bootstrap 5, Axios, and Leaflet.
- **Server:** Node.js with Express 5, MongoDB through Mongoose, JWT-based authentication, password hashing with `bcryptjs`, session storage with `express-session` and `connect-mongo`, and `dotenv` configuration.
- **Receipt processing:** Multer handles image uploads; Sharp preprocesses images; PaddleOCR is used by default with Tesseract.js as a fallback.
- **External services:** TheMealDB supplies recipe data; Anthropic Claude supports optional AI-assisted enrichment and recipe recommendations; OneMap provides Singapore address search and reverse lookup; MapTiler supplies map tiles.

## Prerequisites

- Node.js **22.18.x** or **24.12.0 or newer**, matching the client package's declared engine range.
- `pnpm` for dependency installation.
- A MongoDB database and connection URI. The server will not start its API until it connects to MongoDB.
- Internet access for external recipe, address, map, and optional AI services. The first Tesseract OCR fallback may also need to download English language data.

## Environment configuration

Set these required variables in `server/config.env`:

```dotenv
DB=mongodb://<username>:<password>@<host>:27017/<database>?authSource=admin
SECRET=replace-with-a-long-random-session-secret
JWT_SECRET=replace-with-a-different-long-random-signing-secret
```

Use the connection URI supplied for your MongoDB instance. Replace every placeholder locally; do not commit real database credentials or signing secrets. Although the code has a fallback JWT value, configure `JWT_SECRET` for local use as well.

Optional server variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables optional AI item enrichment and recipe recommendations. Rule-based item details and non-AI recommendations remain available when AI is not configured. |
| `ANTHROPIC_MODEL` | Model identifier used by Anthropic-backed features. Set a model available to your account. |
| `ICON_AI_API_KEY` | Separate optional key for AI food-icon classification. |
| `ICON_AI_MODEL` | Optional model override for icon classification; otherwise the configured model or application default is used. |
| `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | OneMap credentials for Singapore address search and reverse lookup in pickup flows. |
| `OCR_ENGINE` | Set to `tesseract` to force the OCR fallback instead of trying PaddleOCR first. |
| `OCR_LANG_PATH` | Optional local folder or URL for Tesseract language data when its default CDN cannot be reached. |
| `OCR_DOWNLOAD_TIMEOUT_MS`, `OCR_SETUP_TIMEOUT_MS` | Optional Tesseract download and startup timeout overrides. |
| `DNS_SERVERS` | Optional comma-separated DNS server list; the server has defaults when this is unset. |
| `JWT_EXPIRES_IN` | Optional JWT lifetime; defaults to `7d`. |

The example config also lists optional `ICON_AI_*` tuning settings such as token limits, effort, timeout, refusal fallback, classification batch size, cache size, and manifest path. Leave them at their documented defaults unless you need to adjust icon classification. For a separately hosted client, `VITE_API_BASE_URL` can override the rescue API base URL; local development uses `/api` by default.

## Install and run locally

1. From the repository root, create and edit `server/config.env` as described above.
2. In a terminal, install the server dependencies and start the API:

   ```powershell
   cd server
   pnpm install
   node server.js
   ```

   The API listens on `http://localhost:3000` after the database connection succeeds. The package's `dev` script calls `nodemon`, which is not declared in the server dependencies; `node server.js` runs the entry point directly.

3. In a second terminal, install the client dependencies and start Vite:

   ```powershell
   cd client
   pnpm install
   pnpm dev
   ```

4. Open `http://localhost:5173`. Vite proxies `/api` requests to the local server at port `3000`.

## Deployed URL, Git Hub repo, and demo video

Deployed website: http://161.118.223.167/
GitHub Repo: https://github.com/JoeverLiao/WAD2-Project
Demo Video: https://youtu.be/ksG4yL16ogo

## Basic user guide

1. Register an account or log in from the home page. Most application pages require authentication.
2. Add groceries from **Receipt & Product Scanning** by uploading a receipt image or choosing manual entry. Review the parsed or suggested details and save the items to your inventory.
3. Open **Smart Fridge** to search, edit, move, or remove items and review their storage guidance and expiry dates.
4. Use **Freshness & Recipes** to focus on food that needs attention, find recipes based on ingredients, and save or record recipes you have cooked.
5. Open **Neighbour Food Rescue** to browse nearby listings or create one for food you can share. Use the listing and pickup tools to coordinate with another user.
6. Record food activity and visit **Food Waste Analytics** to review the activity history and summaries. Update your profile from **Profile** when needed.

## Demo account that was used in video

Email: example@gmail.com
Password: 12345678

## Project structure

```text
.
|-- client/
|   |-- public/                 # Public images and static assets
|   |-- src/
|   |   |-- components/         # Shared and feature-specific Vue components
|   |   |-- composables/        # Reusable Vue composition logic
|   |   |-- icons/              # Food icon assets and classification rules
|   |   |-- router/             # Client-side routes
|   |   |-- services/           # API clients and frontend services
|   |   |-- stores/             # Shared Pinia state
|   |   |-- views/              # Account, fridge, scanning, recipe, rescue, analytics pages
|   |   |-- utils/              # Validation, date, and feature helpers
|   |   `-- styles/             # Global and feature styles
|   |-- tests/
|   |      |-- e2e/       
|   |-- package.json
|   `-- vite.config.js
|-- server/
|   |-- config/                 # Database and icon configuration
|   |-- controllers/            # HTTP request handlers
|   |-- middleware/             # Authentication and upload handling
|   |-- models/                 # Mongoose models
|   |-- routes/                 # Express API routes
|   |-- services/               # OCR, inventory, recipe, rescue, and other logic
|   |-- tests/                  # Server test files
|   |-- config.env.example      # Safe environment template
|   |-- package.json
|   `-- server.js               # Server entry point
|-- package.json
`-- package-lock.json
```

## Limitations and notes

- Receipt upload accepts JPG, PNG, and WEBP images up to 8 MB. OCR and receipt parsing can misread poor-quality photos, so check all items before saving. PaddleOCR is attempted first; if it cannot start, the server falls back to Tesseract.js.
- Suggested expiry dates, storage locations, and weights are estimates or guidance. Review and correct them for the actual product and storage conditions.
- Recipe browsing depends on TheMealDB availability. AI-assisted features need valid Anthropic configuration; address search needs OneMap credentials. Map tiles also require internet access.
- OneMap address lookup is intended for Singapore addresses.
- The local Vite proxy and server CORS configuration are set up for `localhost:5173` and `localhost:3000`; deployments need corresponding frontend hosting and API routing configuration.

## End-to-end tests

Start the frontend and backend using the local setup instructions above.
Run these commands from the folder containing `playwright.config.js`.

Install Chromium once:

```sh
npx playwright install chromium
```

Run all tests without opening a browser window:

```sh
npx playwright test --config playwright.config.js
```

Run all tests with the browser visible:

```sh
npx playwright test --config playwright.config.js --headed
```

Run a single feature:

```sh
npx playwright test rescue.spec.js --config playwright.config.js
```

Replace `rescue.spec.js` with another test filename as needed.
Add `--headed` to see the browser.

View the test report:

```sh
npx playwright show-report playwright-report
```

Tests use the real backend and external services, so the database and required
APIs must be configured. Use a test database because tests create and modify data.