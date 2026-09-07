# WebGIS

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
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## PostGIS road preview

The map includes a development API for previewing OSM roads from the `osm_lines` table. Copy `.env.example` to `.env`, fill in the PostGIS connection values, then run `npm run dev`.

Open the Layers panel, enable `OSM roads`, and zoom to level 7 or closer. The client requests only the current map viewport and the API returns at most 500 road features per request.

The imported table is expected to have `way_id`, `name`, `tags` (`jsonb`), and `geom` in EPSG:4326, matching the current `vietnam.lua`. For better viewport queries, create indexes once in PostGIS:

```sql
CREATE INDEX IF NOT EXISTS osm_lines_geom_gix
  ON public.osm_lines USING GIST (geom);

CREATE INDEX IF NOT EXISTS osm_lines_tags_gin
  ON public.osm_lines USING GIN (tags);
```

The API endpoint is `GET /api/osm/roads?bbox=minLng,minLat,maxLng,maxLat&zoom=12&limit=500`. The `zoom` parameter keeps distant views focused on major roads and adds smaller roads as the user zooms in. It is implemented as a Vite development middleware; for production, expose the same query through your application backend rather than connecting PostgreSQL from the browser.

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
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
