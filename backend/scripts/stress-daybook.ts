/**
 * Mixed-type synthetic Day Book (local CSV in os.tmpdir, not committed).
 * N default 10000. Env STRESS_VOUCHERS to raise.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import { parseDayBookFile } from '../src/ingest/parse/daybook.parser';

dotenv.config();
dotenv.config({ path: path.join(__dirname, '../.env') });

const N = Math.max(10000, parseInt(process.env.STRESS_VOUCHERS || '10000', 10));
const API_URL = 'http://127.0.0.1:3000';

function inr(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dayLabel(n: number): string {
  const d = 1 + (n % 30);
  return `${d}-Apr-25`;
}

function buildCsv(): { csvPath: string; content: string } {
  const lines: string[] = [
    'Shankara Buildpro - Hyderabad',
    'Day Book',
    '1-Apr-25 to 30-Apr-25',
    '',
    'Date,Particulars,Vch Type,Vch No.,Debit,Credit',
    '1-Apr-25,Opening Balance,,,"0.00",',
  ];

  for (let n = 1; n <= N; n++) {
    const d = dayLabel(n);
    const k = n % 10;
    if (k < 5) {
      const taxable = 1000 + (n % 50) * 100;
      const cgst = Math.round(taxable * 0.09);
      const sgst = Math.round(taxable * 0.09);
      const total = taxable + cgst + sgst;
      lines.push(`${d},Mix Party ${n},Sales,STRS/${n},"${inr(total)}",`);
      lines.push(`,CGST,,,,"${inr(cgst)}"`);
      lines.push(`,SGST,,,,"${inr(sgst)}"`);
      lines.push(`,Sales GST,,,,"${inr(taxable)}"`);
      lines.push(`,TMT mix load ${n},,,,`);
    } else if (k < 7) {
      const taxable = 2000 + (n % 40) * 50;
      const cgst = Math.round(taxable * 0.09);
      const sgst = Math.round(taxable * 0.09);
      const total = taxable + cgst + sgst;
      lines.push(`${d},Mix Supplier ${n},Purchase,STRP/${n},,"${inr(total)}"`);
      lines.push(`,Purchase GST,,,,"${inr(taxable)}"`);
      lines.push(`,CGST Input,,,"${inr(cgst)}",`);
      lines.push(`,SGST Input,,,"${inr(sgst)}",`);
    } else if (k < 8) {
      const amt = 500 + (n % 20) * 25;
      lines.push(`${d},Cash,Receipt,STRC/${n},"${inr(amt)}",`);
      lines.push(`,Mix Party ${n},,,,"${inr(amt)}"`);
    } else if (k < 9) {
      const amt = 400 + (n % 15) * 20;
      lines.push(`${d},Mix Party ${n},Payment,STPY/${n},"${inr(amt)}",`);
      lines.push(`,Bank HDFC,,,,"${inr(amt)}"`);
    } else {
      const amt = 250 + (n % 10) * 10;
      if (n % 2 === 0) {
        lines.push(`${d},HDFC Bank,Contra,STCT/${n},"${inr(amt)}",`);
        lines.push(`,Cash,,,,"${inr(amt)}"`);
      } else {
        lines.push(`${d},Depreciation,Journal,STJR/${n},"${inr(amt)}",`);
        lines.push(`,Accumulated Dep,,,,"${inr(amt)}"`);
      }
    }
  }

  lines.push(`30-Apr-25,Grand Total,,,"0.00","0.00"`);
  const content = lines.join('\n');
  const csvPath = path.join(os.tmpdir(), `stress-daybook-${N}-${Date.now()}.csv`);
  fs.writeFileSync(csvPath, content);
  return { csvPath, content };
}

function pct(times: number[], p: number): number {
  const s = [...times].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main() {
  if (!process.env.SEED_STEWARD_PASSWORD) {
    console.error('Missing SEED_STEWARD_PASSWORD');
    process.exit(1);
  }

  const { csvPath, content } = buildCsv();
  console.log(`generated_vouchers=${N} path=${csvPath} bytes=${fs.statSync(csvPath).size}`);

  const parseStart = Date.now();
  const parsed = await parseDayBookFile(csvPath);
  const parseMs = Date.now() - parseStart;
  const det: any = parsed.detect;
  const types: Record<string, number> = {};
  for (const v of parsed.vouchers) {
    types[v.vchType] = (types[v.vchType] || 0) + 1;
  }
  const lineN = parsed.vouchers.reduce((a, v) => a + v.lines.length, 0);
  const rejectCodes: Record<string, number> = {};
  for (const r of parsed.rejects) rejectCodes[r.code] = (rejectCodes[r.code] || 0) + 1;
  console.log(
    JSON.stringify({
      parse_ms: parseMs,
      detectOk: det.ok,
      reportType: det.ok ? det.reportType : det.error,
      vouchers: parsed.vouchers.length,
      lines: lineN,
      rejects: parsed.rejects.length,
      rejectCodes,
      vchTypes: types,
    }),
  );

  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'steward@shankara.local',
      password: process.env.SEED_STEWARD_PASSWORD,
    }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`);
  const { accessToken } = await loginRes.json();

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const formDataPayload = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="companyId"`,
    ``,
    `SHANKARA_HYD`,
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="stress-daybook.csv"`,
    `Content-Type: text/csv`,
    ``,
    content,
    `--${boundary}--`,
    ``,
  ].join('\r\n');

  console.log('Uploading...');
  const uploadStart = Date.now();
  const uploadRes = await fetch(`${API_URL}/api/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: formDataPayload,
  });
  const ingestMs = Date.now() - uploadStart;
  const uploadData = await uploadRes.json();
  if (uploadData.status === 'rejected') {
    console.error(`Rejected: ${uploadData.errorSummary}`);
    process.exit(1);
  }
  const batchId = uploadData.batchId;

  let publishMs = 0;
  if (uploadData.status === 'held') {
    const t0 = Date.now();
    const pubRes = await fetch(`${API_URL}/api/batches/${batchId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!pubRes.ok) throw new Error(`Publish failed: ${await pubRes.text()}`);
    publishMs = Date.now() - t0;
  }

  const client = new Client({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: parseInt(process.env.DATABASE_PORT || '6432', 10),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });
  await client.connect();
  const countRes = await client.query(
    `SELECT count(*)::int AS n FROM voucher v WHERE v.batch_id = $1 AND v.valid_to IS NULL`,
    [batchId],
  );
  const sqlN = countRes.rows[0].n;
  const typeRes = await client.query(
    `SELECT vch_type, count(*)::int AS n FROM voucher WHERE batch_id = $1 AND valid_to IS NULL GROUP BY vch_type ORDER BY 1`,
    [batchId],
  );
  await client.end();
  console.log(
    `batchId=${batchId} status=${uploadData.status} ingest_ms=${ingestMs} publish_ms=${publishMs} sql_current=${sqlN}`,
  );
  console.log('sql_types', JSON.stringify(typeRes.rows));

  const financeLogin = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'finance@shankara.local',
      password: process.env.SEED_FINANCE_PASSWORD,
    }),
  });
  const { accessToken: finTok } = await financeLogin.json();

  const bench = async (shape: string, q: string) => {
    const measure = async () => {
      const start = Date.now();
      const res = await fetch(`${API_URL}/api/search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${finTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      if (!res.ok) throw new Error(`Search failed: ${await res.text()}`);
      const data = await res.json();
      return { elapsed: Date.now() - start, hits: (data.hits || []).length, total: data.total };
    };
    for (let i = 0; i < 10; i++) await measure();
    const times: number[] = [];
    let minHits = Infinity;
    let lastTotal = 0;
    for (let i = 0; i < 100; i++) {
      const r = await measure();
      times.push(r.elapsed);
      if (r.hits < minHits) minHits = r.hits;
      lastTotal = r.total;
    }
    times.sort((a, b) => a - b);
    return {
      shape,
      n: 100,
      p50: times[49],
      p95: times[94],
      p99: times[98],
      hits_min: minHits,
      total: lastTotal,
    };
  };

  const results = [
    await bench('vch', 'STRS/5000'),
    await bench('party', 'Mix Party 5000'),
    await bench('amount', '11800'),
  ];
  console.log('');
  console.log('shape'.padEnd(15) + 'n'.padEnd(5) + 'p50_ms'.padEnd(10) + 'p95_ms'.padEnd(10) + 'p99_ms'.padEnd(10) + 'hits_min'.padEnd(10) + 'total');
  for (const r of results) {
    console.log(
      r.shape.padEnd(15) +
        r.n.toString().padEnd(5) +
        r.p50.toString().padEnd(10) +
        r.p95.toString().padEnd(10) +
        r.p99.toString().padEnd(10) +
        r.hits_min.toString().padEnd(10) +
        r.total,
    );
  }
  const worst = Math.max(...results.map((r) => r.p95));
  console.log(`\nWorst p95: ${worst} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
