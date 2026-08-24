# Shankara ERP — frontend

Vite + React 19 + TypeScript. Catalog-only — routes are `/login`, `/catalog`
(find an item), `/catalog/upload` (steward), `/admin/users` (steward). The
root `/` redirects to `/catalog` once signed in.

See `../docs/ARCHITECTURE.md` for the full system reference. This file is
just how to run it.

```bash
docker compose up -d          # from repo root — Postgres/pgbouncer/redis
cd ../backend && npm run start:dev   # API on :3000
npm ci
npm run dev                   # http://127.0.0.1:5173  (proxies /api → :3000)
```

`npm run build` and `npm run lint` should stay clean. No component library —
everything in `src/components/` is hand-built. Brand tokens (colors, type,
radius) live in `src/styles/tokens.css`; the rest of the design system is in
`src/index.css`.
