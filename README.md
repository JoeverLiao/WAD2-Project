# Full Circle

Run these commands from this repository root (`WAD2-Project`):

```sh
pnpm install
pnpm dev:all
```

The root install command also installs the application dependencies in
`WAD2G5T3-Project`. `dev:all` starts Vue and Express together. Use `pnpm dev`
for just Vue or `pnpm dev:server` for just Express.

The frontend is available at `http://localhost:5173`. The home page is empty;
navigation opens plain feature pages showing their title and assigned teammate.

The private backend config is already set up on this machine. On a fresh clone,
copy `WAD2G5T3-Project/server/config.example.js` to
`WAD2G5T3-Project/server/config.js` and enter your MongoDB connection details.

Build and check from the root with `pnpm build`, `pnpm test:unit --run`, and
`pnpm test:server`.

See the [application README](WAD2G5T3-Project/README.md) for feature assignments
and the [backend README](WAD2G5T3-Project/server/README.md) for database setup.
