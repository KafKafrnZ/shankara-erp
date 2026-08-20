# Shankara Buildpro — Independent Readiness Assessment (pre–Phase 3)

**Type:** Verification log + gap analysis, not a work order.
**Scope:** Everything verified this session, on a fresh Docker/Postgres stack on Linux — code claims re-derived from source, tests actually run, one live-reproduced fix applied and re-verified. Not a re-read of the project's own status docs.
**Date:** 2026-08-20
**Verdict up front:** the engineering underneath is genuinely good — better than the "college demo" bar `PHASE_1_AUDIT.md` was written to reject, and it earns most of Phase 1+2's claims. But it is not yet enterprise-grade, for reasons that are mostly about *proof*, not code: nothing has touched a real Tally export, nothing has been load-tested under concurrency, and the one P0 found this session shows the evidence-capture process itself has a gap that will recur unless changed. Fix that process gap before Phase 3, not just this one bug.

---

## 1. What "verified" means here

Every item below was checked one of three ways, marked per row:
- **[code]** — read the actual source, cited file:line
- **[run]** — executed for real this session (fresh containers, `migration:run`, `seed`, no reused volume) and the output is quoted
- **[doc]** — cross-checked a brief's stated acceptance criteria against its evidence file's actual content

Nothing here is "the docs say so."

---

## 2. Fixed this session

### P0 — Sales Register upload 500'd on any fresh clone

`ingest_batch_report_type_check` (`InitialSchema` migration) only ever allowed `'DAY_BOOK'`. No Phase 2 migration widened it, but the ingest path inserts `'SALES_REGISTER'`. Every sales upload on a database built purely from committed migrations hit Postgres error `23514`.

**[run]** Reproduced 3 ways from a genuinely fresh stack: e2e went **37/39** (not the claimed 39/39), `\d ingest_batch` showed the narrow constraint, and a live curl upload returned `{"statusCode":500}`.

**Cause, most likely:** the S13/S14/S16 evidence captures (batch IDs 533, 610 in `PHASE_2_EVIDENCE.md`) ran against a long-lived local Postgres volume that had been hand-patched at some point in that session — a fix that never became a committed migration. The schema in git — the only thing a fresh deploy or teammate actually gets — never supported Phase 2's headline feature.

**Fixed [run]:** added `backend/src/database/migrations/1787200000000-WidenReportTypeCheck.ts`, ran it, re-ran e2e → **39/39, genuinely**, re-ran the exact failing curl → clean `held` batch. Full writeup and fix in `PHASE_2_UPDATES.md`.

**Why this matters more than the bug itself:** this is the specific failure mode `PHASE_1_AUDIT.md` §0 exists to prevent — evidence that doesn't survive an independent run — and it happened *after* a first audit already fixed two P0s. That means the fix didn't include fixing the thing that let a P0 slip past evidence capture in the first place. See §5.

---

## 3. Confirmed solid (re-derived from source + live runs, not assumed)

| Area | Finding | How verified |
|---|---|---|
| Money | Integer paise, `bigint` arithmetic throughout, round-half-up on 3rd decimal (`1.005→1.01` correct) | [code] `money.ts`, spec assertions |
| Voucher-drop reject | `VOUCHER_HAS_NO_VALID_LINES` is a real reject code with 3 assertions on `.code` itself | [code] `daybook.validator.ts:34` |
| Calendar validity | `31-Feb-25`, `2025-02-31` genuinely rejected via `Date.UTC` roundtrip, not regex shape | [code] `date.ts` |
| SQL injection surface | Zero string interpolation of data into SQL anywhere in `search.service.ts`, including `LIMIT`/`OFFSET` — all `$N` bound params | [code] full file read |
| RBAC — search | `branch` role gets `AND voucher.company_id = $N` **in the SQL WHERE**, not JS post-filter | [code] `search.service.ts` |
| `master_ledger` upsert | `ON CONFLICT (company_id, ledger_name) DO NOTHING` | [code] `ingest.service.ts:228-231` |
| `GET voucher` soft-delete | `AND v.is_deleted = false` present | [code] `vouchers.service.ts` |
| Sales Register parser | Hand-traced both fixture invoices; debits = credits; matches `EXPECTED.md` exactly | [code] parser + fixture + spec |
| Detect priority | Day Book wins when both title strings present — enforced twice (router order + `sales-register.detector.ts` explicit bail) | [code] |
| Date formatting | `vchDate` built from local Y-M-D, not `.toISOString()` — no IST off-by-one | [code] `search.service.ts`, `vouchers.service.ts` |
| Secrets | `JWT_SECRET` is `Joi.string().min(32).required()`, no fallback anywhere; no committed passwords | [code] `app.module.ts` env schema |
| Auth hygiene | bcrypt cost 10; `git grep -in opensearch -- backend/src` empty (checked case-insensitive + `package.json` deps) | [code] |
| Extension allowlist | `.xlsx .xls .csv .zip` enforced server-side (`ingest.service.ts:52-54`), not just client hint | [code] |
| Upload size cap | `MAX_UPLOAD_BYTES` (default 50MB) actually wired into multer `limits.fileSize` in `ingest.module.ts:33`, not just declared in `.env.example` | [code] |
| Build/test | `tsc --noEmit` exit 0; unit **40/40**; frontend `npm run build` exit 0 | [run] |
| Live RBAC | Unauth `POST /api/search` → 401; finance `POST /api/uploads` → 403 | [run] curl |
| Bench honesty | `s9-bench.ts` does real HTTP round trips, real percentile sort, no fake fallback-number pattern | [code] full file read |

This is a materially higher bar than the failure mode `PHASE_1_AUDIT.md` §0 opens with. Nothing here is theater.

---

## 4. Open findings — prioritized, none fixed this pass except the P0 above

| # | Severity | Finding | Why it matters |
|---|---|---|---|
| 1 | **P1** | `vouchers.service.ts:14-20` fetches a voucher by ID with **no `company_id` in the SQL WHERE**, then checks it in JS afterward and 404s on mismatch. Safe today (nothing leaks in the response), but directly violates the system's own stated law ("RBAC is in the query, not after," `PHASE_1_AUDIT.md` §1.7) and is inconsistent with `search.service.ts`'s correct in-query filter. | Phase 3 adds an index/candidate layer in front of Postgres retrieve. Any future refactor of this one function that reuses the same pattern elsewhere compounds the inconsistency. Fix now, while it's a one-file change. |
| 2 | **P2** | `ingest.service.ts:243` still uses `parseFloat` to read `DEBIT_CREDIT_TOLERANCE` from env. Not on the stored-money path (it's a threshold constant, not a fact row), but it directly contradicts `money.ts`'s own "no IEEE-754" framing and will confuse the next person auditing money-safety by grep. | Low blast radius, but cheap to fix and closes a "wait, why is there still a parseFloat" question. |
| 3 | **P2** | `sales-register.parser.spec.ts` asserts `lines.length === 4` for the Apex Pipes invoice but never asserts the individual ledger/debit/credit values on those 4 lines. | This is the exact bug *class* the first audit's P0 (float money) belonged to: a test that would pass even if CGST/SGST amounts were scrambled as long as the count stayed right. Tighten before Phase 3 touches this parser again. |
| 4 | **P3** | `UploadDto.autoPublish` is validated (`class-validator`) and accepted by the DTO, but never read anywhere in `ingest.service.ts`; frontend never sends it. | Dead field. Either wire it or delete it — as-is it's a documented API surface that lies about what it does. |
| 5 | **P3** | `S16_EVIDENCE.md` is one prose sentence, not a gate-by-gate table like every other `S*_EVIDENCE.md`. The real substance for S16 lives in `PHASE_2_EVIDENCE.md` instead. | Convention break, not a defect — but it's exactly the kind of thin evidence doc that let the report_type bug hide. Worth normalizing before Phase 3 produces 6 more evidence docs (S17-S22). |
| 6 | **P2 (new, this pass)** | No dependency vulnerability scan had been run. `npm audit --omit=dev` on `backend`: **2 moderate** — `uuid <11.1.1` (missing buffer bounds check) pulled in transitively via `exceljs`. Frontend: 0. | Fix requires `npm audit fix --force`, which downgrades `exceljs` to 3.4.0 (breaking) — needs a deliberate upgrade path, not a blind `--force`, since `exceljs` is on the Day Book parse path. Don't run `--force` unsupervised. |
| 7 | **P2 (new, this pass)** | No rate limiting / brute-force protection on `POST /api/auth/login`. `main.ts` has no `@nestjs/throttler` or equivalent; no `helmet()` either. Logout (`auth.service.ts:71`) is audit-only, no token denylist — this matches the original spec's explicit allowance ("invalidate if you use a denylist; otherwise client drops token"), so it's not a regression, but it means a leaked/stolen JWT is valid until natural expiry (`JWT_EXPIRES_IN=8h`) with no server-side kill switch. | Fine for a closed pilot with a handful of named users. Not fine at "enterprise, 1000+ users" scale without at minimum login rate-limiting; token revocation is a bigger design decision to defer deliberately, not by omission. |

---

## 5. The process gap (more important than any single bug above)

The report_type P0 didn't happen because nobody understood the schema — the fix was a two-line `ALTER TABLE`. It happened because **the evidence docs for S13/S14/S16 were captured against an environment that had silently diverged from what `migration:run` on a clean checkout actually produces**, and nothing in the workflow catches that divergence before the doc gets marked `COMPLETE`.

This is structural, not a one-off. Nothing currently forces an evidence capture to start from `docker compose down -v && up -d && migration:run && seed`. As long as a long-lived local dev volume exists, it is *easier* to capture evidence against convenient-but-drifted local state than against a truly fresh one — and the drift is invisible in the resulting Markdown, which just shows a passing curl output either way.

**Before Phase 3 generates six more evidence docs (S17-S22 per `PHASE_STATUS.md` §7.5), fix the ritual, not just this bug:**
- Evidence capture for any new S-step should state, as its first line, the exact reset command used (`down -v && up -d && migration:run && seed`) and the resulting migration count, the way this file's §2 does.
- Optionally, add a cheap CI job (even just a scheduled local script) that does that reset + `npm test && npm run test:e2e` on every push, so schema drift surfaces within minutes instead of at the next audit.

Without this, Phase 3's OpenSearch indexer — which by design becomes a second thing that can silently drift from Postgres — is exactly the kind of feature where this class of bug gets more expensive to catch, not less.

---

## 6. Enterprise-grade / Tally-weak-point gap analysis

This system's stated pitch is a read-only, versioned, RBAC'd, audited, searchable mirror of Tally exports — directly targeting Tally's well-known weak points (no real search, no audit trail, silent overwrite-on-edit, coarse access control, no API). Here's how much of that is actually true today versus still aspirational.

| Tally weak point | Addressed today? | Evidence | Residual gap |
|---|---|---|---|
| No real search (users scroll/filter manually) | **Yes**, for what's ingested | SQL search, 135-162ms p95 at 20k rows (two independent hardware runs, §7) | Only 2 of Tally's many report types ingested (Day Book, Sales Register); untested past 20k rows in one company |
| No audit trail | **Yes** | `audit_event` on login, upload, publish, search, voucher_open — e2e-tested | No retention/export policy for the audit table itself; no anomaly alerting |
| Silent overwrite on edit | **Partially** | Versioned upsert (`valid_to`) inside this system's own ingest layer, tested since S5 | This system can't see edits made *inside* Tally until the next export is re-ingested — its "history" is only as fine-grained as ingest cadence, which is entirely manual today (no scheduler) |
| Coarse RBAC | **Partially** | 3 roles, company_id scoping enforced in-query for search (finding #1 above is the one place it isn't) | No per-branch or per-ledger-group grants; MFA column exists but is unused by design (documented, not hidden) |
| No API / integration surface | **Yes** | Clean REST API, DTO-validated, RBAC-guarded | No API versioning, no service-to-service auth (JWT-only, human-login-shaped), no rate limiting (finding #7) |
| No proof against a real company's data | **No — open since Phase 1, still open** | Explicitly and repeatedly flagged in `PHASE_1_UPDATES.md` and `PHASE_STATUS.md` §6.1 | Every parser rule (title-block skip, split-line grouping, header aliases) is inferred from a spec, never proven against an actual Shankara Tally export. This is the single largest unknown in the whole system and should outrank Phase 3 in priority. |
| Concurrency / multi-user load | **No — untested** | `s9-bench.ts` is warmup(10) + 100 **sequential** calls per shape, not concurrent load | Nobody has thrown 20-50 simultaneous searches at this. The original spec explicitly and correctly bans claiming "5,000 concurrent users" without a load test — that ban is still honored (good), but it also means concurrency is simply unknown, not "fine." A real concurrent-load test (k6, autocannon) belongs before any capacity claim, informal or otherwise. |
| Backup / disaster recovery | **No** | Not mentioned anywhere in Phase 1/2 docs beyond an optional `pg_dump` note | No documented restore drill, no object-store backup story (local FS `{aa}/{bb}/{sha256}` — single disk, single host) |
| Dependency hygiene | **Mostly** | `npm audit`: 2 moderate (transitive, via `exceljs`), 0 frontend | Needs a deliberate `exceljs` upgrade path, not urgent |

**Read on this table:** the *architecture* decisions genuinely target Tally's real weak points and mostly hold up under scrutiny (RBAC-in-query, integer money, audit trail, lineage, versioning). What's missing to call this "enterprise-grade" is almost entirely **proof at scale and against reality** — a real file, real concurrency, a real DR story — not more features. Phase 3's plan (OpenSearch, typo tolerance) adds capability the system doesn't yet need more than it needs those three proofs.

---

## 7. This session's independent p95 (Linux, unofficial)

Re-ran `s9-bench.ts` for real (human explicitly authorized re-running it, which `PHASE_STATUS.md` otherwise forbids). Different hardware from the official Windows i3-1115G4 number — **not a replacement, a second data point**:

```
Host: Intel i7-9750H, 12 threads, Linux (this session's sandbox)
generated_vouchers=20000  ingest_ms=81055  publish_ms=15  acceptedRows=20000

shape    p50   p95   p99   hits_min
vch      53    58    61    1
party    60    67    75    1
amount   89    162   168   20

Worst p95: 162 ms  (amount shape)   vs.  official: 135 ms (party shape, Windows i3)
```

Both clear the ≤200ms bar. Worth noting: the *worst-case shape flipped* — `amount` is worst here, `party` was worst on Windows. This lines up with `PHASE_STATUS.md` §6 item 3's own flag that amount search doesn't benefit from the trigram GIN indexes the way party/narration do, and is planner-sensitive. Not a regression, but the kind of thing to watch as row counts grow past 20k, and a good candidate for the Phase 3 gold-set (§7.2.1 of `PHASE_STATUS.md`) to include an amount-heavy query explicitly.

---

## 8. Recommended order before Phase 3

1. **Fix the process gap (§5)** — cheapest, highest leverage, prevents this exact class of bug from recurring in every future S-step.
2. **Fix finding #1** (RBAC-after-query in `vouchers.service.ts`) — one file, closes the last query-vs-JS inconsistency.
3. **Get one real Tally export** from a live Shankara company and run it through unmodified. This has been "open" since Phase 1 and is the biggest real unknown in the system — everything else in this report is secondary to whether the parser survives contact with an actual file.
4. **A real concurrent-load test** (even 20-50 simultaneous virtual users against the 20k dataset) — cheap to run, and it's the one claim-shaped gap ("does this scale to a real finance team hitting search at once") that nobody has touched yet.
5. Clean up findings #2-#5 (parseFloat tolerance, weak parser spec assertion, dead `autoPublish` field, thin `S16_EVIDENCE.md`) — all small, batch them into one pass.
6. Decide deliberately on findings #6-#7 (dependency upgrade path, login rate-limiting / token revocation posture) rather than leaving them as silent gaps — even a one-line "deferred, here's why" in `PHASE_STATUS.md` §6 is better than the current silence.
7. Then start `S17_BRIEF.md` per the existing Phase 3 plan.

---

## 9. Bottom line

Going well, with one important caveat. The code discipline is real: integer money, parameterized SQL everywhere it counts, RBAC mostly in-query, honest benchmarking, versioned facts, a genuine audit trail — this is a system built by someone who read and internalized `PHASE_1_AUDIT.md` §0-1, not one that's performing completeness. Every P0/P1/P2/P3 item from the *first* audit actually got fixed, verifiably.

The catch is that the second audit found a new P0 in the exact same shape — a claim that didn't survive an independent run — which means the fix from the first audit addressed the bugs it found but not the *process* that let a bug like that reach a "COMPLETE" doc in the first place. That process fix (§5) is the single highest-leverage thing to do before Phase 3, because Phase 3 adds a second system (OpenSearch) that can drift from Postgres in exactly this way, at a scale where it'll be much harder to spot by hand.

Past that, "enterprise-grade, Tally-weak-point replacement" is the right target and the architecture is pointed at the right problems — but the system hasn't yet been proven against a real file or real concurrent load, and both of those matter more than anything Phase 3 currently plans to add.
