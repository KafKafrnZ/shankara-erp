# Phase 1 — current status (read this first)

**Date:** 2026-08-19  
**Repo HEAD after this commit is the source of truth.**  
**Phase 1 is complete.** Product Phase 2 has **not** started.

This file replaces `AUDIT_FIX_BRIEF.md`. That brief was a genuine post-Phase-1 code review. The items below were either **fixed in this pass** or **left open on purpose**. Do not re-implement S0–S10. Do not treat old `S*_BRIEF.md` “S10 is forbidden” / “do not start Phase 2” lines as current work orders — those steps are **closed history**.

---

## Note for Claude (and any other agent)

You are not starting Phase 1. You are not writing another S-brief.

- **Closed:** S0–S10, `PHASE_1_STATUS=COMPLETE`, official search p95 = **135 ms** (see `PHASE_1_RESULTS.md` and `S9_EVIDENCE.md`). Do not invent a new p95. Do not re-run `s9-bench.ts` unless a money-math change moved fixture totals (it must not).
- **Binding history:** `PHASE_1_AUDIT.md`, `S3_BRIEF.md`–`S10_BRIEF.md`, `S*_EVIDENCE.md`. Useful if you need *why* a rule exists. Ignore their “next step is forbidden” sentences; they were sequential locks.
- **Current product law:** Tally is the book of record. Read-only ingest / search / retrieve. Day Book only. SQL search. No OpenSearch client. No AG Grid. No “Create Voucher.” Steward is a **global** role (`company_id` null) and may set `companyId` on upload — that is intentional, not a missing grants table.
- **This pass (post-audit):** integer paise money, voucher-drop reject, parameterized `LIMIT`/`OFFSET`, `is_deleted` on GET voucher, `master_ledger` `DO NOTHING`, calendar check on `DD-MM-YYYY` / `D-MMM-YY` / ISO dates, leftover reasoning-comments removed.
- **Still open (do not “fix” unless a human asks):**
  1. No **real Tally Day Book** from a live company has been parsed yet. Do not invent extra header aliases without a real file.
  2. `GET /api/vouchers/:id` can still show `vchDate` one calendar day earlier than SQL (`toISOString()` UTC). SQL date is correct (`2025-04-01`).
  3. `GET /api/health` `asOf` is always `null`. Real as-of is `GET /api/meta/as-of`.
  4. Search still **ORs** `ILIKE '%q%'` on every query so party names with digits match. Amount search for `1000` still counts all SYN9 rows. Fine at 20k.
  5. E2e clones inflate `Sri Steel` / `1248500` hit totals. Do **not** `TRUNCATE voucher`.
- If you are asked to start Phase 2, write a **new** brief. Do not reopen S9/S10. Do not add OpenSearch.

---

## What we just changed (this commit)

| Item (from the audit) | Action |
|---|---|
| P0 float money (`parseFloat` / `.toFixed`) | **Fixed.** `backend/src/ingest/parse/money.ts` — integer paise, round-half-up on the 3rd decimal. `parseIndianAmount` is a wrapper. Parser totals use `bigint`. Shared `formatCents` in ingest. |
| P0 silent voucher drop | **Fixed.** `VOUCHER_HAS_NO_VALID_LINES` reject when 0 valid lines. Fixture `fixtures/daybook/voucher-all-lines-invalid.csv`. Test asserts the code, not just a count. |
| P1 real Tally files | **Open.** Needs a human-supplied export. Not coded blindly. |
| P1 invalid `DD-MM-YYYY` | **Fixed.** Calendar check; `31-02-2025` / `31-Feb-25` / `2025-02-31` → null. Excel serial path unchanged. |
| P2 steward `companyId` | **Documented as intended.** Global steward. Comment in `ingest.service.ts`. |
| P3 `LIMIT`/`OFFSET` interpolation | **Fixed.** Bound parameters. |
| P3 `Dr`/`Cr` character class | **Fixed.** Trailing `Dr`/`Cr` suffix only. |
| P3 leftover spec-quoting comments | **Removed.** Search ILIKE-always is a one-line decision. |
| P3 `master_ledger` no-op upsert | **Fixed.** `ON CONFLICT … DO NOTHING`. |
| P3 GET voucher ignores `is_deleted` | **Fixed.** `AND v.is_deleted = false`. |

Existing `EXPECTED.md` sample numbers are unchanged (`1248500.00`, `112365.00`). New fixture is an **added** case only.

---

## How to verify

```
cd backend
npx tsc --noEmit -p tsconfig.build.json
npm test
npm run test:e2e
```

Verified this pass: `tsc` exit 0; unit **34/34**; e2e **37/37**.

---

## Deleted

- `AUDIT_FIX_BRIEF.md` — replaced by this file so agents do not treat an open punch-list as unfinished Phase 1.
