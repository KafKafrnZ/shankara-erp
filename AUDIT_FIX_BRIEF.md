# Independent Audit — Fix Brief

**Scope:** External code audit of Phase 1 as it stands at commit `6c5a5e1`. Not one of the S0–S10 work orders — this is a review artifact, kept separate from `S*_BRIEF.md` / `S*_EVIDENCE.md` so it doesn't collide with that numbering.
**Author:** Independent reviewer (not the S0–S10 implementer).
**Status:** Open. Nothing in this file has been fixed yet.
**How to use this file:** Same discipline as the S-briefs — don't mark something fixed in chat, fix it, run the verification steps listed under each item, and keep evidence (test output, a repro that now passes) before calling it closed. When you come back for re-audit, this file is what gets checked line by line.

---

## 0. Priority tiers

| Tier | Meaning | Items |
|---|---|---|
| **P0 — fix before any real company data touches this** | Silent data loss or wrong numbers, with no error surfaced anywhere | §1 Float money math, §2 Silent voucher drop |
| **P1 — fix before pitching this as "solves Tally import"** | Works on the fixture, will very likely fail on real exports | §3 Parser/detector fragility, §4 Date validation gap |
| **P2 — fix before this is multi-tenant / before it's trusted as an access-control boundary** | Currently fine for a single-company pilot, will not hold once scope grows | §5 Steward `companyId` has no authorization check |
| **P3 — hygiene, cheap, do in one pass** | Doesn't change behavior today but is fragile or unprofessional if someone reads the source | §6 SQL LIMIT/OFFSET string interpolation, §7 `amount.ts` char-class stripping, §8 Leftover reasoning-comments, §9 `master_ledger` no-op upsert, §10 `is_deleted` not checked in `vouchers.service.ts` |

P0 and P1 are the two you asked me to go deep on, so those get full sections. P2/P3 get enough detail to act on but I'm not writing you a dissertation on each.

---

## 1. P0 — Money is computed as floating point (`totalAmount` and `parseIndianAmount`)

### 1.1 Where

- `backend/src/ingest/parse/amount.ts:17-21` — `parseIndianAmount()` does `parseFloat(cleaned)` then `.toFixed(2)`. Every single debit/credit cell in every uploaded file passes through this.
- `backend/src/ingest/parse/daybook.parser.ts:202-215` — the voucher-level `totalAmount` is computed by summing `parseFloat(l.debit)` / `parseFloat(l.credit)` across all lines in a plain JS `number` accumulator, then `.toFixed(2)`.

### 1.2 Why this is a real bug, not a style nitpick

JS `number` is an IEEE-754 double. `.toFixed(2)` does not implement a single documented rounding rule — it rounds based on the *binary* representation of the float, which for many decimal fractions is not exact. Two concrete, reproducible failures, both provable with plain `node -e`, no test framework needed:

```
$ node -e 'console.log((1.005).toFixed(2))'
1.00        # a naive reader expects 1.01 (round-half-up on the 3rd decimal)

$ node -e 'console.log((5.005).toFixed(2))'
5.00        # same failure
```

This is not a contrived edge case — it's the textbook IEEE-754 `.toFixed()` gotcha, and it sits directly in the one function every amount in every uploaded file flows through.

Where it can actually surface in this app, concretely:
- **`.xlsx` uploads with formula-derived GST amounts.** `daybook.parser.ts`'s `parseDayBookStream()` xlsx branch does `String(val)` on a cell's `.result` when the cell holds a formula (e.g. `=Base*0.18`). Formula results routinely come back as floats like `1125.4950000000001` rather than a clean `"1125.50"` string, because Excel/ExcelJS don't guarantee a clean decimal string for computed cells. That raw float string then goes through `parseIndianAmount` → `parseFloat` → `.toFixed(2)`, hitting exactly the class of bug shown above.
- **Multi-line accumulation drift.** `daybook.parser.ts:202-207` sums N line amounts in a float accumulator before formatting once at the end. I ran a 5,000-line synthetic accumulation test against this exact pattern and did *not* get a mismatch against exact cents — so for typical Day Book line counts and typical rupee magnitudes, this is a lower-probability failure today. I'm flagging it honestly as "provably unsafe pattern, not yet observed to misfire at Phase-1 scale" rather than claiming I reproduced a live accumulation failure, because I didn't and I'm not going to invent one. It's still the wrong tool for the job and risk grows with voucher size / line count / rupee magnitude as this scales past a pilot.

The part that makes this worth fixing now rather than later: **`ingest.service.ts:159-160` and `:238-243` already does this correctly** — batch-level debit/credit totals are summed as `BigInt` paise (`dSumCents += BigInt(line.debit.replace('.', ''))`) and formatted back with a local `formatCents()` helper. The codebase already knows the right pattern. It's just not applied where the per-voucher `totalAmount` is computed, which is the number search matches on (`voucher.total_amount = $n::numeric` in `search.service.ts:52`) and the number finance sees on the voucher pane. Two different arithmetic strategies for the same class of value, in the same codebase, one correct and one not, is itself worth eliminating even before you count the bug.

### 1.3 How to fix it

Move all amount arithmetic to integer paise (`bigint`), and only ever format to a `"N.NN"` string at the output boundary. Concretely:

**Step 1 — create `backend/src/ingest/parse/money.ts`** (new file; keeps `amount.ts`'s public API intact so nothing else has to change signature):

```ts
export function parseAmountToCents(raw: string): bigint | null {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.replace(/[₹,DrCr\s]/g, '');
  if (!cleaned) return null;

  let isNegative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    cleaned = cleaned.slice(1, -1);
  } else if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  }

  // Reject anything that isn't a plain decimal number, instead of letting
  // parseFloat silently coerce garbage (e.g. "12.34.56", "abc") into NaN
  // three lines later where it's easy to miss.
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const [intPartRaw, fracPartRaw = ''] = cleaned.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;

  // Round-half-up at the 2nd decimal, using string/integer math only —
  // no float ever enters this calculation.
  const frac = fracPartRaw.padEnd(3, '0');
  const twoDigits = frac.slice(0, 2);
  const roundDigit = frac.charCodeAt(2) - 48;

  let cents = BigInt(intPart) * 100n + BigInt(twoDigits);
  if (roundDigit >= 5) cents += 1n;

  return isNegative ? -cents : cents;
}

export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const s = abs.toString().padStart(3, '0');
  return sign + s.slice(0, -2) + '.' + s.slice(-2);
}
```

**Step 2 — `amount.ts` becomes a thin wrapper**, so every existing caller (`daybook.parser.ts`, `search.service.ts`, both spec files) keeps working unchanged:

```ts
import { parseAmountToCents, formatCents } from './money';

export function parseIndianAmount(raw: string): string | null {
  const cents = parseAmountToCents(raw);
  return cents === null ? null : formatCents(cents);
}
```

**Step 3 — `daybook.parser.ts:200-215`**, replace the float accumulator:

```ts
for (const v of vouchers) {
  let sumD = 0n;
  let sumC = 0n;
  for (const l of v.lines) {
    sumD += parseAmountToCents(l.debit) ?? 0n;
    sumC += parseAmountToCents(l.credit) ?? 0n;
  }
  const maxCents = sumD > sumC ? sumD : sumC;
  if (maxCents !== 0n || v.lines.length === 0) {
    v.totalAmount = formatCents(maxCents);
  }
  // ... existing receipt partyName logic unchanged
}
```

(`l.debit` / `l.credit` are already normalized `"N.NN"` strings by this point — output of the fixed `parseIndianAmount` — so re-parsing them with `parseAmountToCents` is exact, no precision is lost going string → cents → string again.)

**Step 4 — `ingest.service.ts:238-243`**, delete the locally-defined `formatCents` and import the shared one from `money.ts` instead. Not strictly required for correctness (that code path is already right), but you now have two copies of the same 5-line function; keep one.

### 1.4 Setbacks / things you need to decide, not just code

1. **You have to pick a rounding rule, and that's a business decision, not a coding one.** I used round-half-up on the 3rd decimal above because it's the common convention and it's deterministic, but confirm this against what Tally itself does and what your company's GST rounding convention actually is. If Tally rounds half-to-even, or truncates, or the source file never has a 3rd decimal in practice (likely, if Tally always exports pre-rounded 2-decimal strings) — this decision matters less than it looks, but you should still make it on purpose and write it down, because right now there is no documented rule at all, just accidental IEEE-754 behavior.
2. **All three call sites of `parseIndianAmount` need the fix to land together**, not just the parser. `search.service.ts:50` parses the user's typed search query the same way — if you fix the parser but not that, a boundary-value search could fail to match a voucher whose amount was affected by the old bug pre-fix, or diverge from stored data in an edge case post-fix if the two ever use different logic. Since `amount.ts` becomes a wrapper around the shared `money.ts`, this is automatic as long as you don't duplicate the old float logic anywhere else — grep for `parseFloat` and `toFixed` in `backend/src` after the change to confirm nothing was missed.
3. **Existing fixture numbers should not change**, but you must verify that, not assume it. `1248500.00`, `112365.00` etc. in `EXPECTED.md` are clean 2-decimal values with no 3rd-decimal ambiguity, so the fix should be a no-op for the committed fixtures. Re-run `npm test` and diff the fixture-driven assertions — if any fixture number moves, something in the fix is wrong, not the fixture (same rule you already have: don't edit `EXPECTED.md` to match the code).
4. **Add a regression test that would have caught this.** Neither `amount-date-vch.spec.ts` nor `daybook.parser.spec.ts` currently tests a `.xx5`-boundary value. Add at minimum: `parseIndianAmount('1.005')` (and confirm your chosen rounding rule's expected output), and a multi-line sum test with values chosen so a float accumulator would visibly drift (e.g. many lines of `0.10`, `0.20`, `0.30` — the classic float-additive case) asserted against exact cents.
5. **No data migration needed.** Nothing has been ingested from a real company file yet (per Phase 1 status, this is still dev/synthetic data), so there's no "fix the parser but the DB still has wrong historical totals" problem *yet*. This is exactly why it's P0 — it's nearly free to fix now and gets progressively more annoying to fix retroactively once real batches exist that you'd need to re-ingest or backfill.
6. **BigInt is slightly slower than native float arithmetic** — irrelevant at Day Book line counts (thousands, not millions), not worth worrying about, mentioning only so it doesn't become a reason to hesitate.

### 1.5 Verification checklist (fill before you call this closed)

- [ ] `node -e "require('./dist/...')..."` or a unit test proves `parseIndianAmount('1.005')` now returns your chosen rounding rule's answer, not `'1.00'` by accident.
- [ ] New unit test for multi-line summation drift added and passing.
- [ ] `npm test` — still 28/28 (or N/N with your new tests added), no fixture numbers changed.
- [ ] `grep -rn "parseFloat\|\.toFixed(" backend/src --include=*.ts` reviewed — confirm nothing money-related still routes through float math outside `money.ts`'s internal use of `BigInt`.
- [ ] `npx tsc --noEmit -p tsconfig.build.json` exit 0.
- [ ] Re-run `s9-bench.ts` once — confirm the 20k-row ingest/search numbers aren't meaningfully affected by the BigInt change (they shouldn't be, but you claimed a specific p95 number before, so re-prove it after a money-math change touches every row).

---

## 2. P0 — A voucher can vanish with zero audit trail

### 2.1 Where

`backend/src/ingest/validate/daybook.validator.ts:28-31`:

```ts
if (validLines.length > 0) {
  v.lines = validLines;
  acceptedVouchers.push(v);
}
// else: v is silently dropped. No reject record is created for v itself.
```

### 2.2 Why this is a real bug

Your own product law, stated in `PHASE_1_RESULTS.md` §1: *"Store what the file said... Every fact row points at `batch_id` + `source_row_no`."* This function violates that law in exactly one path, and it's a path that's reachable two different ways:

1. **Every line on a voucher gets individually rejected.** Each bad line does get a `BOTH_SIDES` reject row (`sourceRowNo` of the header, not the line — that's a separate minor gap, the reject can't be traced to which specific line row was bad if a voucher has more than one). But the fact that the *voucher itself* then disappeared from `acceptedVouchers` — the fact that a voucher which existed in the source Day Book produced zero output rows in your system — is recorded nowhere.
2. **A voucher header row parses with zero lines to begin with** (e.g. the header row had no debit/credit and no subsequent data rows attached before the next voucher started). `v.lines` is `[]` on entry, the `for (const line of v.lines)` loop runs zero times, `validLines` stays `[]`, same silent drop, and in this path there isn't even a line-level reject to look at — nothing is written to `rejects` at all for this voucher.

I confirmed this against your own test, not just by reading the code. `daybook.validator.spec.ts:38-52`, `'drops voucher when every line is invalid'`, asserts:

```ts
expect(res.vouchers.length).toBe(0);
expect(res.rejects.length).toBe(1);
```

That `1` is the `BOTH_SIDES` line reject — the test never checks for a distinct "this voucher was dropped" record, because none exists. The test name promises more than the assertions verify.

**Why this matters more than a normal test gap:** this is a finance-facing system. If a real voucher from a real company's Day Book fails to make it into search results, the failure mode right now is indistinguishable from "that voucher was never in the file." Nobody — steward, finance, auditor — has anywhere to look to find out it happened. `GET /batches/:id/rejects` exists specifically so a steward can review what got rejected and why; a dropped-with-no-trace voucher bypasses that safety net entirely.

### 2.3 How to fix it

```ts
export function validateDayBook(parsed: ParseResult): { vouchers: ParsedVoucher[], rejects: ParseReject[] } {
  const rejects: ParseReject[] = [...parsed.rejects];
  const acceptedVouchers: ParsedVoucher[] = [];

  for (const v of parsed.vouchers) {
    const validLines: any[] = [];

    for (const line of v.lines) {
      const dZero = line.debit === '0.00' || line.debit === '0';
      const cZero = line.credit === '0.00' || line.credit === '0';
      const dPos = !dZero && !line.debit.startsWith('-');
      const cPos = !cZero && !line.credit.startsWith('-');

      if (dPos && cPos) {
        rejects.push({
          sourceRowNo: v.sourceRowNo,
          code: 'BOTH_SIDES',
          message: 'Line has both debit and credit',
          raw: line as any,
        });
      } else {
        validLines.push(line);
      }
    }

    if (validLines.length > 0) {
      v.lines = validLines;
      acceptedVouchers.push(v);
    } else {
      rejects.push({
        sourceRowNo: v.sourceRowNo,
        code: 'VOUCHER_HAS_NO_VALID_LINES',
        message: `Voucher ${v.vchNo} (${v.vchType}, ${v.vchDate}) dropped: 0 of ${v.lines.length} line(s) valid`,
        raw: { vchNo: v.vchNo, vchType: v.vchType, vchDate: v.vchDate, originalLineCount: v.lines.length } as any,
      });
    }
  }

  return { vouchers: acceptedVouchers, rejects };
}
```

New reject code, distinct from `BOTH_SIDES`, so a steward reviewing `GET /batches/:id/rejects` can tell "one line was skipped but the voucher still landed" apart from "the whole voucher disappeared."

### 2.4 Setbacks / things to check after fixing

1. **`ingest.service.ts:234-236`** — `batch.rejectedRows = validated.rejects.length` will now be one higher whenever a whole voucher drops (previously a voucher with exactly one bad line already contributed 1 to `rejectedRows`; after the fix it contributes 2 — the line reject and the new voucher reject). Note that `totalRows` (`totalLines` in the code) only ever counted lines from *accepted* vouchers to begin with (`totalLines += v.lines.length` runs inside the accepted-vouchers loop only) — so the relationship between `totalRows`, `acceptedRows`, and `rejectedRows` was already not a clean "these three sum to the row count in the file" identity before this fix. Don't try to make the fix also fix that accounting relationship — that's a separate, smaller decision (do you want `totalRows` to mean "rows in file" or "rows that made it into an accepted voucher"?) — just be aware the numbers on a batch's summary will shift slightly for any file containing a fully-dropped voucher, and that's expected, not a regression.
2. **No fixture currently exercises this at the parser/ingest level**, only at the unit level with a hand-built mock voucher in `daybook.validator.spec.ts`. Add a real fixture CSV — e.g. `fixtures/daybook/voucher-all-lines-invalid.csv`, one voucher whose only line has both a debit and credit value — and add its expected outcome to `EXPECTED.md` (new entry, don't repurpose an existing one, matching your own "don't edit EXPECTED.md to match a lazy implementation" rule — here you're adding a new documented case, not weakening an existing one). This gets you an end-to-end proof through `parseDayBook` + `validateDayBook` together, not just the validator in isolation.
3. **Update the existing test's assertions**, not just its behavior — `daybook.validator.spec.ts:50-51` should assert `res.rejects.some(r => r.code === 'VOUCHER_HAS_NO_VALID_LINES')` explicitly, not just a bumped count, or a future refactor can silently break this again without any test noticing (which is exactly how this bug happened to look "tested" while not actually being covered).
4. **No schema/migration change** — `ingest_reject` already stores arbitrary `code`/`message`/`raw`, this is purely additive. `GET /batches/:id/rejects` (`ingest.controller.ts`) will surface the new code with zero frontend changes.
5. **Low risk, ship this one first** — smaller and more contained than the money-math fix, good first PR to warm up on before the bigger one.

---

## 3. P1 — Parser/detector only proven against one hand-built fixture

Not asked for the same depth here, but since this is the actual "solves Tally import/export" value proposition, it's worth stating plainly: every test, the 20k-row benchmark, and all e2e coverage run against data shaped exactly like `fixtures/daybook/sample-daybook.csv` or synthetic clones of it. Nothing has been run against an actual Day Book pulled from a real Tally instance.

Two concrete gaps, both in code you already have:

- `backend/src/ingest/detect/daybook.detector.ts:61` requires all six headers (`Date`, `Particulars`/`Ledger`, `Vch Type`/`Voucher Type`, `Vch No`/`Voucher No`, `Debit`, `Credit`) to appear verbatim (after lowercasing/trimming) in a single row. Any real export using different column naming — which varies across Tally versions and report customizations — gets a full-file `UNRECOGNIZED_LAYOUT` rejection. No partial ingest, no "3 of 6 expected columns found" diagnostic.
- `backend/src/ingest/parse/date.ts` only recognizes `YYYY-MM-DD`, `D-MMM-YY`/`DD-MMM-YYYY`, and `DD-MM-YYYY`. Any other real-world Tally date export format fails as `MISSING_VCH_DATE` even though a valid date is present.

**Fix approach:** before writing more code here, pull 2-3 real Day Book exports (CSV and XLSX) from an actual Tally instance — yours or a willing pilot company's — and run them through `detectDayBook` / `parseDayBook` directly (a small throwaway script, not through the HTTP API) to see what actually breaks. Fixing this blind, without real sample files, risks over-fitting to imagined formats instead of the ones you'll actually receive. This is the single highest-leverage thing you can do before presenting this internally — it's the difference between "the pipeline works" and "the pipeline works on our data."

Secondary, smaller bug in the same file: `date.ts:43-47`, the `DD-MM-YYYY` branch does zero calendar validation — no bounds check on day/month, no round-trip through `new Date()` — unlike the `YYYY-MM-DD` branch a few lines above it, which does validate. A malformed date (e.g. day=31, month=02) currently passes parsing and would only fail later as a raw Postgres error at insert time, inside the ingest transaction, instead of a clean row-level `INVALID_DATE` reject. Easy fix: add the same `new Date(...)` round-trip check the ISO branch already uses, before returning.

---

## 4. P1 — folded into §3 above

(Kept as a subsection there rather than splitting it out — it's the same root cause: parser only tested against synthetic/fixture-shaped input.)

---

## 5. P2 — Steward uploads have no `companyId` authorization check

`backend/src/ingest/ingest.controller.ts:15-20` and `ingest.service.ts` take `dto.companyId` straight from the request body with no check that the uploading steward is authorized for that company. Seed data has `steward.company_id = null`, which suggests steward is meant to be a global back-office role — if so, this may be intentional, not a bug. But it's currently a silent default rather than a deliberate, documented decision, and it's the one place in the app where the otherwise-careful "RBAC is in the SQL WHERE" principle isn't applied. Decide on purpose: either (a) confirm steward is genuinely meant to write into any company and document that explicitly as a product rule (like the other locked rules in `PHASE_1_RESULTS.md` §1), or (b) add a check — e.g. a `steward_company_grants` table or a simple allow-list on the user record — before this becomes a real multi-company deployment.

---

## 6-10. P3 — Hygiene pass (do together, one PR)

| # | Where | Issue | Fix |
|---|---|---|---|
| 6 | `search/search.service.ts:96` | `LIMIT ${limit} OFFSET ${offset}` is string-interpolated into raw SQL. Not currently exploitable — the global `ValidationPipe({transform:true})` plus `@IsInt()` on `SearchDto` closes it — but it's one refactor away from becoming exploitable if that DTO validation is ever loosened or another caller bypasses it. | Parameterize: `LIMIT $${paramIdx} OFFSET $${paramIdx+1}` with `limit`/`offset` pushed into `params` like every other value in this query. |
| 7 | `ingest/parse/amount.ts:4` (now `money.ts` after §1's fix) | `raw.replace(/[₹, DrCr\s]/g, '')` is a character class — it strips any standalone `D`, `r`, `C` character anywhere in the string, not the literal substrings `"Dr"`/`"Cr"`. Works today only because amount fields don't otherwise contain those letters. | Replace with an explicit suffix strip: `cleaned.replace(/\s*(Dr|Cr)$/i, '')` before stripping symbols/commas, so it only removes an actual trailing Dr/Cr indicator. |
| 8 | `daybook.parser.ts:86-88`, `daybook.detector.ts:44-46,62-65`, `search.service.ts:58` | Leftover reasoning-comments quoting the spec back at itself mid-function (e.g. `if (signals.length === 0 \|\| true) { // "otherwise" or combine? The brief says...`). Reads as unfinished thinking left in shipped code. | Five-minute pass: resolve the actual question each comment is asking (in the `search.service.ts` case, decide on purpose whether ILIKE should always OR in, and say so in one line, not three lines of doubt), delete the rest. |
| 9 | `ingest.service.ts:224-231` | `ON CONFLICT (company_id, ledger_name) DO UPDATE SET extra = master_ledger.extra` is a no-op update (sets a column to itself) used to avoid `DO NOTHING`'s lack of a target. Works, but confusing and does an unnecessary row lock/write on every conflict. | Just use `ON CONFLICT (company_id, ledger_name) DO NOTHING` unless you actually intend to merge `extra` going forward, in which case do a real merge (e.g. `extra || excluded.extra`) instead of a no-op. |
| 10 | `vouchers/vouchers.service.ts:13-18` | The voucher-detail query doesn't filter `is_deleted = false`, unlike `search.service.ts:16` which does. No live impact today — nothing in the app ever sets `is_deleted = true`, there's no delete feature in Phase 1 — but it's an inconsistency that will bite the day someone adds a soft-delete path and forgets this file exists. | Add `AND v.is_deleted = false` to the query now, while it's a zero-risk no-op change, instead of relying on remembering it later. |

---

## Cross-cutting notes

- **None of P0/P1/P2 require a DB migration or schema change.** All fixes above are application-code-only. That's good — it means you can ship §1 and §2 (the two P0s) fast without touching migrations, and re-test against the same Docker/Postgres setup you already have.
- **§1 and §2 are independent of each other** — fix and test them separately, don't bundle into one PR. Easier to verify, easier for me to re-audit.
- **The one thing that actually blocks this from being a credible company pitch isn't in your code at all — it's the absence of real sample data.** Every number in `PHASE_1_RESULTS.md` is real and honestly reported, but every one of them was produced against synthetic or hand-built fixtures. Before the next internal presentation, running 2-3 genuine Tally exports through this (even just through the parser directly, not the full HTTP flow) would do more for the pitch's credibility than any of the fixes above — and would tell you which of §3's gaps actually matter versus which formats you'll never actually see.

---

## When you're ready for re-audit

Come back with:
1. Which items from this file you fixed (P0s at minimum).
2. Test output (`npm test`, `npx tsc --noEmit`) showing green.
3. Whether you ran any real Tally export through the parser, and what happened.

I'll re-read the diffs, not just take a "done" list at face value — same standard your own S10 re-proof held itself to.
