# Shankara ERP

Read-only Tally data access layer for **Shankara Buildpro**. Tally remains the book of record. This app ingests Day Book / Sales Register exports, validates them, and makes **published** vouchers searchable.

Start with **`PHASE_STATUS.md`**. UI contract: **`FRONTEND_BUILD_SPEC.md`**.

## Run

```bash
docker compose up -d
cd backend && npm ci && npm run start:dev    # http://127.0.0.1:3000/api/health
cd frontend && npm ci && npm run dev         # http://127.0.0.1:5173
```

Seed emails: `steward@shankara.local`, `finance@shankara.local`, `branch@shankara.local`.  
Passwords: `SEED_*_PASSWORD` in `backend/.env` (never commit `.env` or JWTs).

## What it is not

No Create Voucher, no posting back to Tally, no Purchase Register, no GST filing, no mobile layout.
