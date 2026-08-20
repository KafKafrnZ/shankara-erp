# Mixed Day Book stress (10k) — local synthetic, 2026-08-20

**Not a replacement for the official S9 p95 (N=20000 SYN9, worst 135 ms).**  
This run checks a **richer Day Book layout** (several voucher types + GST split lines) at 10k, HTTP ingest + SQL search.

CSV was written to `os.tmpdir()` and is **not** in git. Replay: `cd backend && npx ts-node scripts/stress-daybook.ts` (needs live API + `SEED_*` in `.env`).

Host: Windows, 11th Gen Intel Core i3-1115G4 @ 3.00 GHz. Live `http://127.0.0.1:3000`.

---

## File

| | |
|---|---|
| Target N | 10000 |
| Generated | `generated_vouchers=10000 bytes=1175724` |
| Title | `Shankara Buildpro - Hyderabad` / `Day Book` / `1-Apr-25 to 30-Apr-25` |
| Mix | Sales 50%, Purchase 20%, Receipt 10%, Payment 10%, Journal 10% |
| Sales lines | party Debit + CGST/SGST/Sales GST Credit + narration row |
| Unique `vch_no` | `STRS/` `STRP/` `STRC/` `STPY/` `STJR/` so SYN9 / INV/SR are not versioned |

Opening Balance + Grand Total rows included; they must not become vouchers.

---

## Parse (in-process, before HTTP)

```
parse_ms=224
detectOk=true reportType=DAY_BOOK
vouchers=10000 lines=34000 rejects=0
vchTypes: Sales=5000 Purchase=2000 Receipt=1000 Payment=1000 Journal=1000
```

Detector accepted it as Day Book. Zero parse rejects.

---

## HTTP ingest + SQL

```
batchId=651 status=held ingest_ms=72482 publish_ms=35 sql_current=10000
sql_types: Journal 1000, Payment 1000, Purchase 2000, Receipt 1000, Sales 5000
```

Steward `POST /api/uploads` (default held) then `POST /api/batches/651/publish`.  
SYN9 current count **still 20000** after this run.

---

## Search bench (finance token, warmup 10, n=100)

```
shape          n    p50_ms    p95_ms    p99_ms    hits_min  total
vch            100  94        114       135       1         1
party          100  96        122       133       1         1
amount         100  93        118       156       1         1

Worst p95: 122 ms
```

Queries: `STRS/5000`, `Mix Party 5000`, `11800`.  
Bar from Phase 1 (≤ 200 ms) is met on this 10k mixed corpus **in addition to** the existing 20k SYN9 rows.

This **does not** replace gate 24 (135 ms on SYN9-only 20k).

---

## What this is not

- Not a live Shankara Tally export (still pending after Phase 3).
- Not concurrent load (calls are sequential, same as S9).
- CSV not committed.
