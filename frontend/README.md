# Tennis AI Playground – frontend

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui. Talks to the Python backend on `127.0.0.1:8000` through `/api` (proxied in dev).

- `npm run dev` – dev server on http://127.0.0.1:5173 (proxies `/api`)
- `npm run build` – type-checks and writes `dist/` (committed; served by the backend)
- `npx biome check --write src` – lint and format

Structure: `src/api` (contract types, fetch client, SSE), `src/i18n/en.ts` (every user-visible string), `src/pages` (one file per route), `src/components/common` (chips, rating, metrics, states), `src/components/charts` (recharts), `DESIGN.md` (tokens, type, layout and the reasoning behind them).
