# S9_EVIDENCE.md

Independent re-run of `npx ts-node scripts/s9-bench.ts` against live `http://127.0.0.1:3000` after `SearchIndexTrgm` (pg_trgm GIN) + btree indexes. SQL `SYN9/%` current count = 20000. Fake ECONNREFUSED catch is gone.

```
◇ injected env (22) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
generated_vouchers=20000 bytes=1706790
Uploading...
batchId=345 ingest_ms=64 publish_ms=0 acceptedRows=20000

shape          n    p50_ms    p95_ms    p99_ms    hits_min
vch            100  80        114       132       1
party          100  83        135       148       1
amount         100  95        129       132       20

Worst p95: 135 ms
```

Host: Windows, CPU=11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz. Gate 24 uses worst p95 = 135 ms (party).

A prior noisy run on the same script reported worst p95 = 228 ms (amount). That table is superseded by this re-run.
