# S16 WORK ORDER — FILL PHASE 2 EVIDENCE ONLY

**S15 must be accepted first.** This file wins on conflict.  
No new features. Live commands against `http://127.0.0.1:3000`.

---

## 0. HARD RULES

1. Fill `PHASE_2_EVIDENCE.md` from `PHASE_2_AUDIT.md` §5 gates 1–13. Empty cell = not done.
2. Do not invent HTTP. Paste cmd + stdout.
3. Do not `TRUNCATE`. Do not unpublish Day Book batch 345 / SYN9.
4. Do not write `PHASE_2_STATUS=COMPLETE` until 1–13 are filled.
5. Do not start Purchase, OpenSearch, mapping UI, or Phase 3.
6. Do not change official Phase 1 p95 (135 ms). Do not re-run `s9-bench.ts` unless the human asks.

---

## 1. WHAT S16 IS

Re-run:

- Day Book detect/parse still 2/6
- Sales fixture detect `SALES_REGISTER`, publish, search `INV/SR/1`, GET lines
- SHA re-upload sales: count unchanged
- 401 / 403
- `git grep opensearch` empty
- `tsc` + `npm test` + `npm run test:e2e`

Then commit **only** evidence docs (and this brief if needed). Do not `git push` unless the human asks.

---

## 2. FILES YOU MAY TOUCH

```
PHASE_2_EVIDENCE.md
S16_EVIDENCE.md
```

---

## 3. BANNED

- “Verified” / “Passed in e2e” as a cell
- OpenSearch
- Phase 3
- Editing Day Book EXPECTED numbers
