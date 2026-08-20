import 'dotenv/config';

async function run() {
  if (!process.env.SEED_STEWARD_PASSWORD || !process.env.SEED_FINANCE_PASSWORD) {
    console.error('Missing SEED passwords');
    process.exit(1);
  }

  const login = async (email: string, pass: string) => {
    const r = await fetch('http://127.0.0.1:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const d = await (r.json() as any);
    return d.accessToken;
  };

  const steward = await login('steward@shankara.local', process.env.SEED_STEWARD_PASSWORD);
  const finance = await login('finance@shankara.local', process.env.SEED_FINANCE_PASSWORD);

  // Reindex as finance should fail (403)
  const f = await fetch('http://127.0.0.1:3000/api/index/reindex', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${finance}` }
  });
  if (f.status !== 403) {
    console.error(`Finance reindex should be 403, got ${f.status}`);
    process.exit(1);
  }
  console.log('Finance reindex 403 OK');

  // Reindex as steward should succeed
  const s = await fetch('http://127.0.0.1:3000/api/index/reindex', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${steward}` }
  });
  
  if (!s.ok) {
    const text = await s.text();
    console.error(`Steward reindex failed: ${s.status} ${text}`);
    process.exit(1);
  }

  const data = await s.json();
  console.log(`Reindex result: ${JSON.stringify(data)}`);
}

run().catch(console.error);
