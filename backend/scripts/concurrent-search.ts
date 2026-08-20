import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const API = 'http://127.0.0.1:3000';
const N = parseInt(process.env.CONCURRENT || '30', 10);
const q = process.env.Q || 'INV/SR/1';

async function main() {
  if (!process.env.SEED_FINANCE_PASSWORD) {
    console.error('Missing SEED_FINANCE_PASSWORD');
    process.exit(1);
  }
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'finance@shankara.local',
      password: process.env.SEED_FINANCE_PASSWORD,
    }),
  });
  if (!login.ok) {
    console.error('login', login.status, await login.text());
    process.exit(1);
  }
  const { accessToken } = await login.json();

  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: N }, async () => {
      const start = Date.now();
      const res = await fetch(`${API}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ q, limit: 5 }),
      });
      return { status: res.status, ms: Date.now() - start };
    }),
  );
  const wall = Date.now() - t0;
  const ok = results.filter((r) => r.status === 200).length;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const p = (i: number) => times[Math.min(i, times.length - 1)];
  console.log(
    JSON.stringify(
      {
        n: N,
        q,
        ok,
        wall_ms: wall,
        p50_ms: p(Math.floor(0.5 * (N - 1))),
        p95_ms: p(Math.floor(0.95 * (N - 1))),
        max_ms: times[times.length - 1],
      },
      null,
      2,
    ),
  );
  if (ok !== N) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
