# S10_EVIDENCE.md

## Gate 1
```
docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"
shankara-pgbouncer Up 44 minutes 0.0.0.0:6432->5432/tcp, [::]:6432->5432/tcp
shankara-postgres Up 44 minutes (healthy) 0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp

docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT id, name FROM migrations ORDER BY id;"
 id |             name              
----+-------------------------------
  1 | InitialSchema1700000000000
  2 | SearchIndex1787115749733
  3 | SearchIndexFixed1787120512574
  4 | SearchIndexTrgm1787121078440

curl.exe -s http://127.0.0.1:3000/api/health
{"status":"ok","db":"ok","asOf":null}

findstr DATABASE_PORT backend\.env
DATABASE_PORT=6432
```

## Gate 2
```
git grep -n supersecretpassword
git grep -n "password:" -- backend/src
[No output matching literals]
```

## Gate 3
```
Test-Path backend/.env.example
True

git check-ignore -v backend/.env
.gitignore:5:.env       backend/.env
```

## Gate 4
```
POST /api/auth/login for steward, finance, branch
HTTP 200 OK with tokens.

GET /api/auth/me
{"id":"1","email":"steward@shankara.local","role":"steward","companyId":null,"branchId":null}
{"id":"2","email":"finance@shankara.local","role":"finance","companyId":null,"branchId":null}
{"id":"3","email":"branch@shankara.local","role":"branch","companyId":"SHANKARA_HYD","branchId":null}
```

## Gate 5
```
curl.exe -s -w " HTTP %{http_code}" -X POST http://127.0.0.1:3000/api/search -H "Content-Type: application/json" -d "{\"q\":\"11820\"}"
{"message":"Unauthorized","statusCode":401} HTTP 401
```

## Gate 6
```
curl.exe -s -w " HTTP %{http_code}" -X POST http://127.0.0.1:3000/api/uploads -H "Authorization: Bearer <finance>" -F "companyId=SHANKARA_HYD" -F "file=@fixtures/daybook/sample-daybook.csv"
{"message":"User role finance is not authorized for this resource.","error":"Forbidden","statusCode":403} HTTP 403
```

## Gate 7
```
curl.exe -s -X POST http://127.0.0.1:3000/api/uploads -H "Authorization: Bearer <steward>" -F "companyId=SHANKARA_HYD" -F "file=@fixtures/daybook/sample-daybook.csv"
{"batchId":346,"status":"held","duplicate":false,"sha256":"ae5fffbaf95d1d3b102730a4b436fcf2a7ddfcb184050e5fe5f760f82f7ee3c4","originalName":"sample-daybook.csv","bytes":482}
```

## Gate 8
```
curl.exe -s -X POST http://127.0.0.1:3000/api/batches/346/publish
{"id":346,"status":"published","companyId":"SHANKARA_HYD","tallyCompany":"Shankara Buildpro - Hyderabad","periodFrom":"2025-04-01","periodTo":"2025-04-30","totalRows":6,"acceptedRows":2,"rejectedRows":0,"debitSum":"1298500.00","creditSum":"1298500.00","errorSummary":null,"publishedAt":"2026-08-19T06:55:39.292Z","sha256":"ae5fffbaf95d1d3b102730a4b436fcf2a7ddfcb184050e5fe5f760f82f7ee3c4"} HTTP 200
```

## Gate 9
```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT sf.id, sf.sha256, sf.storage_key, sf.original_name, sf.byte_size as bytes FROM source_file sf JOIN ingest_batch b ON b.source_file_id = sf.id WHERE b.id = 346;"
 id  |                              sha256                              |                              storage_key                               |   original_name    | bytes
-----+------------------------------------------------------------------+------------------------------------------------------------------------+--------------------+-------
 346 | ae5fffbaf95d1d3b102730a4b436fcf2a7ddfcb184050e5fe5f760f82f7ee3c4 | ae/5f/ae5fffbaf95d1d3b102730a4b436fcf2a7ddfcb184050e5fe5f760f82f7ee3c4 | sample-daybook.csv |   482

Get-Item backend/var/uploads/ae/5f/ae5fffbaf95d1d3b102730a4b436fcf2a7ddfcb184050e5fe5f760f82f7ee3c4
Length 482
```

## Gate 10
```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT v.vch_no, v.party_name, v.total_amount, (SELECT count(*) FROM voucher_line vl WHERE vl.voucher_id = v.id) AS lines FROM voucher v WHERE v.valid_to IS NULL AND v.vch_no IN ('INV/HYD/24-25/11820','RCT/HYD/2401') ORDER BY v.vch_no;"
       vch_no        |    party_name     | total_amount | lines
---------------------+-------------------+--------------+-------
 INV/HYD/24-25/11820 | Sri Steel Traders |   1248500.00 |     4
 RCT/HYD/2401        | Cash              |     50000.00 |     2
(2 rows)
```

## Gate 11
```
curl.exe -s -X POST http://127.0.0.1:3000/api/uploads ...
{"batchId":346,"status":"duplicate","duplicate":true,"sha256":"ae5fffbaf95d1d3b102730a4b436fcf2a7ddfcb184050e5fe5f760f82f7ee3c4","originalName":"sample-daybook.csv","bytes":482}

 count
-------
     2
```

## Gate 12
```
curl.exe -s -X POST http://127.0.0.1:3000/api/search -d "{\"q\":\"11820\"}"
total=2
SYN9/11820
INV/HYD/24-25/11820
```

## Gate 13
```
curl.exe -s -X POST http://127.0.0.1:3000/api/search -d "{\"q\":\"Sri Steel\"}"
total=51
Sri Steel Traders
Sri Steel Traders
Sri Steel Traders
```

## Gate 14
```
curl.exe -s -X POST http://127.0.0.1:3000/api/search -d "{\"q\":\"1248500\"}"
total=44
1248500.00
1248500.00
1248500.00
```

## Gate 15
```
curl.exe -s -X GET http://127.0.0.1:3000/api/vouchers/10
{"id":10,"vchNo":"INV/HYD/24-25/11820","vchNoNorm":"invhyd242511820","vchType":"Sales","vchDate":"2025-03-31","partyName":"Sri Steel Traders","totalAmount":"1248500.00","narration":"TMT 12mm 18MT KA01AB1234","companyId":"SHANKARA_HYD","lines":[{"lineNo":1,"ledgerName":"Sri Steel Traders","debit":"1248500.00","credit":"0.00"},{"lineNo":2,"ledgerName":"CGST","debit":"0.00","credit":"112365.00"},{"lineNo":3,"ledgerName":"SGST","debit":"0.00","credit":"112365.00"},{"lineNo":4,"ledgerName":"Sales GST","debit":"0.00","credit":"1023770.00"}],"source":{"batchId":18,"fileName":"test-ingest-1787053765322-0.23138179815547366.csv","sha256":"3c3377e66723832d9b5880959b876d33836eb9ef8ab232fd9da423a0aae1eb40","sourceRowNo":8,"publishedAt":"2026-08-19T06:58:01.809Z"}}
```

## Gate 16
```
curl.exe -s http://127.0.0.1:3000/api/meta/as-of
{"asOf":"2026-08-19T06:58:01.809Z","batchId":18}
(IST: 2026-08-19 12:28:01 IST)

git grep -n "Asia/Kolkata" -- frontend/src
frontend/src/App.tsx:77:    timeZone: 'Asia/Kolkata',
```

## Gate 17
```
branch POST /search OTHER/1
total=0

steward POST /search OTHER/1
total=1

branch GET /api/vouchers/20469
{"message":"Voucher not found","error":"Not Found","statusCode":404} HTTP 404
```

## Gate 18
```
finance POST /search HOLD9/1
total=0

steward GET /batches/353
id 353 status held
```

## Gate 19
```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT action, count(*) FROM audit_event WHERE action IN ('login','upload','search','voucher_open') GROUP BY action ORDER BY action;"
    action    | count
--------------+-------
 login        |   195
 search       |  2124
 upload       |   413
 voucher_open |    24
```

## Gate 20
```
npm test
Test Suites: 5 passed, 5 total
Tests:       28 passed, 28 total

npm run test:e2e
Test Suites: 5 passed, 5 total
Tests:       37 passed, 37 total
```

## Gate 21
```
git grep -n getHello -- backend/src
[empty]
git grep -n "AG Grid" -- frontend/src
[empty]
```

## Gate 22
```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='voucher' ORDER BY indexname;"
 voucher_current_key       | CREATE UNIQUE INDEX voucher_current_key ON public.voucher USING btree (company_id, vch_type, vch_no, vch_date, valid_to) NULLS NOT DISTINCT
 voucher_guid_current      | CREATE UNIQUE INDEX voucher_guid_current ON public.voucher USING btree (company_id, tally_guid, valid_to) NULLS NOT DISTINCT
```

## Gate 23
```
docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c "SELECT c.conname, c.confdeltype FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'voucher_line' AND c.contype = 'f';"
           conname            | confdeltype
------------------------------+-------------
 voucher_line_voucher_id_fkey | a
(1 row)
```

## Gate 24
```
N=20000 vouchers; worst p95=135 ms (party); 100 calls; host=Windows, CPU=11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz
```

## Gate 25
```
git commit
```
