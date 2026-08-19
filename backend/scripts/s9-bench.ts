import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();
dotenv.config({ path: path.join(__dirname, '../.env') });

const N = parseInt(process.env.S9_VOUCHERS || '20000', 10);
const API_URL = 'http://127.0.0.1:3000';

async function main() {
  if (!process.env.SEED_STEWARD_PASSWORD) {
    console.error('Missing SEED_STEWARD_PASSWORD');
    process.exit(1);
  }

  const csvPath = path.join(os.tmpdir(), `synthetic-20k-${Date.now()}.csv`);
  const lines: string[] = [
    'Shankara Buildpro - Hyderabad',
    'Day Book',
    '1-Apr-25 to 30-Apr-25',
    '',
    'Date,Particulars,Vch Type,Vch No.,Debit,Credit'
  ];

  for (let n = 1; n <= N; n++) {
    lines.push(`1-Apr-25,Synth Party ${n},Sales,SYN9/${n},"1,000.00",`);
    lines.push(`,Sales GST ${n},,,,"1,000.00"`);
  }

  const csvContent = lines.join('\n');
  fs.writeFileSync(csvPath, csvContent);
  console.log(`generated_vouchers=${N} bytes=${fs.statSync(csvPath).size}`);

  try {
    // 1. Login
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'steward@shankara.local', password: process.env.SEED_STEWARD_PASSWORD }),
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`);
    const { accessToken } = await loginRes.json();

    // 2. Upload
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const formDataPayload = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="companyId"`,
      ``,
      `SHANKARA_HYD`,
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="synthetic.csv"`,
      `Content-Type: text/csv`,
      ``,
      csvContent,
      `--${boundary}--`,
      ``
    ].join('\r\n');

    console.log('Uploading...');
    const uploadStart = Date.now();
    const uploadRes = await fetch(`${API_URL}/api/uploads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: formDataPayload,
    });

    const uploadEnd = Date.now();
    const uploadData = await uploadRes.json();

    if (uploadData.status === 'rejected') {
      console.error(`Rejected: ${uploadData.errorSummary}`);
      process.exit(1);
    }

    const batchId = uploadData.batchId;

    // 3. Publish
    let publishStart = Date.now();
    let publishEnd = Date.now();
    if (uploadData.status === 'held') {
      console.log(`Publishing batch ${batchId}...`);
      publishStart = Date.now();
      const pubRes = await fetch(`${API_URL}/api/batches/${batchId}/publish`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!pubRes.ok) throw new Error(`Publish failed: ${await pubRes.text()}`);
      publishEnd = Date.now();
    }

    // 4. SQL count
    const client = new Client({
      host: process.env.DATABASE_HOST || '127.0.0.1',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });
    await client.connect();
    const countRes = await client.query(`SELECT count(*) FROM voucher v JOIN ingest_batch b ON v.batch_id = b.id WHERE b.id = $1 AND v.valid_to IS NULL`, [batchId]);
    const acceptedRows = parseInt(countRes.rows[0].count, 10);
    console.log(`batchId=${batchId} ingest_ms=${uploadEnd - uploadStart} publish_ms=${publishEnd - publishStart} acceptedRows=${acceptedRows}`);

    await client.end();

    // 5. Bench
    const bench = async (shape: string, q: string) => {
      const measure = async () => {
        const start = Date.now();
        const res = await fetch(`${API_URL}/api/search`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q }),
        });
        if (!res.ok) throw new Error(`Search failed: ${await res.text()}`);
        const data = await res.json();
        return { elapsed: Date.now() - start, hits: data.hits.length };
      };

      // Warmup
      for (let i = 0; i < 10; i++) await measure();

      const times: number[] = [];
      let minHits = Infinity;
      for (let i = 0; i < 100; i++) {
        const { elapsed, hits } = await measure();
        times.push(elapsed);
        if (hits < minHits) minHits = hits;
      }

      times.sort((a, b) => a - b);
      const p50 = times[49];
      const p95 = times[94];
      const p99 = times[98];
      return { shape, n: 100, p50, p95, p99, hits_min: minHits };
    };

    const results = [
      await bench('vch', 'SYN9/10000'),
      await bench('party', 'Synth Party 10000'),
      await bench('amount', '1000.00'),
    ];

    console.log('');
    console.log('shape'.padEnd(15) + 'n'.padEnd(5) + 'p50_ms'.padEnd(10) + 'p95_ms'.padEnd(10) + 'p99_ms'.padEnd(10) + 'hits_min');
    for (const r of results) {
      console.log(
        r.shape.padEnd(15) + 
        r.n.toString().padEnd(5) + 
        r.p50.toString().padEnd(10) + 
        r.p95.toString().padEnd(10) + 
        r.p99.toString().padEnd(10) + 
        r.hits_min.toString()
      );
    }
    const worstP95 = Math.max(...results.map(r => r.p95));
    console.log(`\nWorst p95: ${worstP95} ms`);
  } catch (err: any) {
    throw err;
  }
}

main().catch(console.error);
