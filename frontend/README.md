# Shankara ERP — frontend

Vite + React 19 + TypeScript. Routes: `/login`, `/` (search), `/upload` (steward). Spec: repo-root `FRONTEND_BUILD_SPEC.md`.

```bash
docker compose up -d          # from repo root
# API on :3000
npm ci
npm run dev                   # http://127.0.0.1:5173  (proxies /api → :3000)
```

`npm run build` and `npm run lint` must stay clean. No component library. Brand tokens live in `src/styles/tokens.css`.
