# PASTE TO GEMINI (S18)

You implement **S18 only** of Shankara Buildpro. Repo `D:/5ingularity/shankara-erp`. API `http://127.0.0.1:3000` via PgBouncer `:6432`. OS `http://127.0.0.1:9200` (compose `shankara-opensearch`, security off).

**Read:** `S18_BRIEF.md` (wins on conflict) → `PHASE_STATUS.md` §7 → `S11_EVIDENCE.md` (table shape). A human re-runs your cmds. Chat is not proof.

S0–S17 done. S19–S22 forbidden. Indexer only. Search stays SQL.

---

Job: projection of **published current** vouchers into OS. Postgres commit first; indexer best-effort after. `POST /api/search` and `GET /api/vouchers/:id` unchanged. Then `S18_EVIDENCE.md` 15-row `cmd:`+`out:` table. Stop.

```
publish → bulk upsert that batch’s current rows
hold    → delete by batch_id
reindex → wipe + bulk all SQL-visible rows (chunks 500–1000)
```

SQL-visible = `valid_to IS NULL AND is_deleted=false AND ingest_batch.status='published'`.

---

Hard stops (any = reject)

1. No COMPLETE in chat. Empty evidence cell = not done. Banned: Verified / Passed in e2e / ok / done / works / Manual edit.
2. No OS import in `search.service.ts` or `vouchers/`. Do not query OS from search.
3. Do not revert exact `vch_no_norm` rank bind (separate from LIKE `%`; applied **after** COUNT). Do not edit `GOLD.md`.
4. OS down must **not** fail publish/hold HTTP 200.
5. No TRUNCATE, no `down -v`, no drop SYN9, no unpublish **345**, no hold **651** or **533**.
6. No invented p95. No `s9-bench.ts`. Official p95 = 135 ms.
7. No parseFloat on money. No `.env` / Tally / JWT in git. No `synchronize: true`.
8. No S19 fuzz, no UI, no `PHASE_3_EVIDENCE.md`, no `PHASE_3_STATUS=COMPLETE`.
9. Amount in OS = 2-dp **string**, not float.

Past fails: S9 fake p95; S16 one-sentence evidence; S17 G7 miss until human split the LIKE/exact bind.

---

May touch: `backend/src/search-index/` (or `index/`), `ingest.service.ts` + module (call indexer **after** commit), `app.module.ts` (optional Joi `OPENSEARCH_NODE`), `package.json` + lock (`@opensearch-project/opensearch`), `.env.example`, `scripts/s18-reindex.ts`, `S18_EVIDENCE.md`, specs / optional e2e.

Do not touch: `search.service.ts`, `vouchers.service.ts`, parsers, `GOLD.md`, fixtures, frontend, PHASE_1/2 evidence.

---

Locked: index `shankara-vouchers`; `_id` = `voucher.id`; fields `company_id,vch_no,vch_no_norm,party_name,total_amount,narration,vch_date,vch_type,batch_id`. Mapping in the brief. One `VoucherIndex` interface + OS adapter + no-op (`OPENSEARCH_NODE=off` for unit tests). Steward `POST /api/index/reindex` (finance 403) returns `{sqlCurrent,indexed}` equal.

Must index: SYN9, STRS, `INV/SR/1`, `OTHER/1`. Must **not**: `HOLD17/1` (held batch 652).

Proof voucher (tmpdir CSV, do not commit): `S18IDX/1`, party `S18 Index Party`, Day Book fingerprint, `companyId=SHANKARA_HYD`. Held → absent OS; publish → `_doc` 200; finance SQL search hits; hold → OS 404 and finance total=0. Leave held.

---

Order: (1) `curl :9200` — `docker start shankara-opensearch` if down, never `down -v`. (2) interface + bulk adapter. (3) reindex route. (4) publish/hold hooks + try/catch. (5) live reindex + count match. (6) S18IDX proof. (7) `docker stop` OS; finance `POST /api/search {"q":"SYN9/10000"}` still 200 total≥1; `docker start`. (8) G7 finance `INV/SR/1` hit1 exact. (9) evidence. Stop.

---

`S18_EVIDENCE.md` header: date, host i3-1115G4, API, OPENSEARCH_NODE, migrations 1–5, syn9=20000, reset=none. Then gates:

1 env+`curl :9200`  2 tsc  3 npm test (41+N)  4 e2e (39+N)
5 grep OS empty in search.service + vouchers/
6 grep OS only under index module (+Joi)
7 reindex sqlCurrent=indexed=`_count`
8 HOLD17/1 OS hits 0  9 OTHER/1 present
10 S18IDX held/publish/hold  11 finance reindex 403
12 OS stopped, SQL search still works
13 G7 hit1=`INV/SR/1`  14 SYN9=20000, rank bind not reverted
15 GET voucher lines+sha256, no OS in that service

`S18_STATUS=COMPLETE` only when all 15 have real stdout. Redact tokens.

---

Reply then stop: files changed; confirm search.service untouched; `{sqlCurrent,indexed,_count}`; S18IDX; OS-down search; G7; test summaries; 15-row table; `git status --short`. No S19. No essay.
