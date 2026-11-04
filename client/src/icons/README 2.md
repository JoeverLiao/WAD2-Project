# Food icons

Every food in the app gets an icon and a colour chosen by Claude from a fixed icon set.
Claude only **chooses**. It never invents icons or draws SVG.

```
client/src/icons/
  manifest.json     single source of truth: every icon, the palette, the fallback icon
  svg/*.svg         one drawing per icon (filled with currentColor)
  iconRules.js      prompt + JSON schema built from the manifest, and answer validation
                    (shared: the server imports this file too)
  manifest.js       loads the manifest and the SVG files
  iconResolver.js   asks the backend once per food name; caching, batching, fallback
  config.js         client settings (VITE_ variables, see client/.env.example)
components/FoodIcon.vue   the only way icons are drawn

server/
  config/iconConfig.js          server settings (see server/config.env.example)
  services/iconClassifier.js    calls Claude with the generated prompt and schema
  controllers/iconController.js POST /api/icons/classify  { names: [...] }
```

## How an icon is chosen

1. `<FoodIcon name="Banana" />` asks `iconResolver.js`, which shows a loading placeholder.
2. The name is normalised (trimmed, lowercased). If it is cached in memory or localStorage,
   that answer is used and nothing is sent.
3. Otherwise names are batched and posted to `/api/icons/classify`. Repeated requests for a
   name already on its way share that request.
4. The server sends Claude a system prompt listing every icon's `id` and `description` from the
   manifest, with a structured-output schema whose `icon` enum is the manifest's ids and whose
   `color` enum is the palette. It has its own cache, too.
5. Both the server and the client check each answer: the icon must be in the manifest and the
   colour must be a hex value from the palette. A failed request or an invalid answer gives the
   `fallbackIcon` in `VITE_ICON_FALLBACK_COLOR`. Nothing crashes and an icon is always drawn.

## Add a new icon

1. Draw it on a 70 x 70 canvas and save it as `svg/<id>.svg`. Use two paths, like the others:
   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" fill="none" stroke="#123f3b" stroke-linecap="round" stroke-linejoin="round">
     <path class="food-shape" d="..." fill="currentColor" stroke-width="3.2"/>
     <path class="food-line" d="..." stroke-width="2.5"/>
   </svg>
   ```
   `food-shape` is filled with the chosen colour; `food-line` is the ink detail on top.
   Don't put a fixed fill colour on `food-shape`.
2. Add an entry to `manifest.json`:
   ```json
   {
     "id": "durian",
     "label": "Durian",
     "type": "specific",
     "category": "fruit",
     "description": "Durians. Use for large spiky fruit.",
     "file": "svg/durian.svg",
     "color": "#E8D27A"
   }
   ```
   - `type`: `specific` (one food, or foods of the same shape), `category` (any food of a group
     without its own icon) or `fallback` (only one, named by `fallbackIcon`).
   - `description` is what Claude reads to decide when to use the icon. Shape rules belong here
     ("Use for long, curved fruit"), not in code.
   - `color` is used only when a page draws the icon directly with `<FoodIcon kind="durian" />`.
   - Two entries may share one SVG file (the category icons do).
3. Restart the server so it reloads the manifest. Names already cached keep their icon. To
   reclassify everything, change `VITE_ICON_CACHE_KEY` (and restart the server).

To change the colours Claude may use, edit `palette` in `manifest.json`. With an empty palette
Claude may return any hex colour.

## Using the component

```vue
<FoodIcon name="Mango" />            <!-- Claude chooses icon and colour -->
<FoodIcon :item="inventoryItem" />   <!-- uses item.name -->
<FoodIcon kind="ice" />              <!-- a manifest icon in its own colour -->
<FoodIcon name="Mango" color="#FFB35C" />  <!-- override the colour -->
```

Size and line weight come from CSS variables on `.food-icon` in `FoodIcon.vue`
(`--food-icon-size`, `--food-icon-outline`, `--food-icon-detail`).

## Run it

```sh
# server: needs ANTHROPIC_API_KEY in server/config.env
cd server && pnpm install && pnpm dev
# client
cd client && pnpm install && pnpm dev
```

Without an API key, or when not logged in (the endpoint requires a session), every food shows
the fallback icon.

## Tests

```sh
cd client && npx vitest run src/__tests__/IconRules.spec.js src/__tests__/IconResolver.spec.js src/__tests__/FoodIcon.spec.js
cd server && pnpm test:icons
```

The Claude API and the backend are mocked; no tests make real API calls.
