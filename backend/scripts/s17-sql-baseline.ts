import 'dotenv/config';

if (!process.env.SEED_STEWARD_PASSWORD || !process.env.SEED_FINANCE_PASSWORD || !process.env.SEED_BRANCH_PASSWORD) {
  console.error('Missing SEED passwords in env');
  process.exit(1);
}

const login = async (email: string, pass: string) => {
  const r = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  if (!r.ok) throw new Error(`Login failed for ${email}`);
  const data = await (r.json() as any);
  return data.accessToken;
};

const run = async () => {
  const steward = await login('steward@shankara.local', process.env.SEED_STEWARD_PASSWORD!);
  const finance = await login('finance@shankara.local', process.env.SEED_FINANCE_PASSWORD!);
  const branch = await login('branch@shankara.local', process.env.SEED_BRANCH_PASSWORD!);

  const queries = [
    { id: 'G1', q: '11820', role: 'finance', expected: 'INV/HYD/24-25/11820', rule: 'vch_in_top3' },
    { id: 'G2', q: 'INV/HYD/24-25/11820', role: 'finance', expected: 'INV/HYD/24-25/11820', rule: 'vch_in_top3' },
    { id: 'G3', q: 'RCT/HYD/2401', role: 'finance', expected: 'RCT/HYD/2401', rule: 'vch_in_top3' },
    { id: 'G4', q: 'KA01AB1234', role: 'finance', expected: 'KA01AB1234', rule: 'top_hit_narration' },
    { id: 'G5', q: 'STRS/5000', role: 'finance', expected: 'STRS/5000', rule: 'vch_in_top3' },
    { id: 'G6', q: 'Mix Party 5000', role: 'finance', expected: 'STRS/5000', rule: 'vch_in_top3' },
    { id: 'G7', q: 'INV/SR/1', role: 'finance', expected: 'INV/SR/1', rule: 'vch_in_top3' },
    { id: 'G8', q: 'INV/SR/2', role: 'finance', expected: 'INV/SR/2', rule: 'vch_in_top3' },
    { id: 'G9', q: 'Apex Pipes', role: 'finance', expected: 'Apex Pipes', rule: 'top_hit_party' },
    { id: 'G10', q: 'SYN9/10000', role: 'finance', expected: 'SYN9/10000', rule: 'vch_in_top3' },
    { id: 'T1', q: 'shankra', role: 'finance', rule: 'measure' },
    { id: 'T2', q: 'inv sr 1', role: 'finance', rule: 'measure' },
    { id: 'T3', q: 'apex pipe', role: 'finance', rule: 'measure' },
    { id: 'A1', q: '1248500', role: 'finance', rule: 'measure' },
    { id: 'A2', q: '59000', role: 'finance', rule: 'measure' },
    { id: 'N1', q: 'HOLD17/1', role: 'finance', rule: 'total_0' },
    { id: 'N2', q: 'OTHER/1', role: 'branch', rule: 'total_0' },
    { id: 'N3', q: 'OTHER/1', role: 'steward', rule: 'total_not_0' },
    { id: 'N4', q: '11820', role: 'none', rule: 'http_401' },
  ];

  console.log('| id | q | role | http | total | top3 vchNo | partyName (G9) | pass | sql_baseline_ms |');
  console.log('|---|---|---|---|---|---|---|---|---|');

  for (const q of queries) {
    let token = '';
    if (q.role === 'steward') token = steward;
    else if (q.role === 'finance') token = finance;
    else if (q.role === 'branch') token = branch;

    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const start = Date.now();
    const r = await fetch('http://127.0.0.1:3000/api/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({ q: q.q, limit: 20 })
    });
    const ms = Date.now() - start;

    let http = r.status;
    let data: any = null;
    let total: number | string = '-';
    let top3 = '-';
    let partyG9 = '-';
    let pass = false;

    if (r.ok) {
      data = await r.json();
      total = data.total;
      const hits = data.hits || [];
      const top3Arr = hits.slice(0, 3).map((h: any) => h.vchNo);
      top3 = top3Arr.join(', ') || '-';
      if (q.id === 'G9') partyG9 = hits[0]?.partyName || '-';
      if (q.id === 'G4') partyG9 = hits[0]?.narration || '-';

      if (q.rule === 'vch_in_top3') {
        pass = top3Arr.includes(q.expected);
      } else if (q.rule === 'top_hit_party') {
        pass = partyG9 === q.expected;
      } else if (q.rule === 'top_hit_narration') {
        pass = String(hits[0]?.narration || '').includes(String(q.expected ?? ''));
      } else if (q.rule === 'measure') {
        pass = true; // measure only
      } else if (q.rule === 'total_0') {
        pass = total === 0;
      } else if (q.rule === 'total_not_0') {
        pass = (total as number) > 0;
      }
    } else {
      if (q.rule === 'http_401') {
        pass = http === 401;
      }
    }

    // A1 and A2 want amounts recorded
    if (q.id === 'A1' || q.id === 'A2') {
      const top3Amounts = (data?.hits || []).slice(0, 3).map((h: any) => h.totalAmount).join(', ');
      partyG9 = top3Amounts; // hijack column to print amounts
    }

    console.log(`| ${q.id} | \`${q.q}\` | ${q.role} | ${http} | ${total} | ${top3} | ${partyG9} | ${pass} | ${ms} ms |`);
    
    // Stop if a G row fails
    if (q.id.startsWith('G') && !pass) {
        console.error(`Row ${q.id} failed!`);
        process.exit(1);
    }
  }

  // Print SYN9 count
  import('child_process').then(cp => {
    cp.exec("docker exec shankara-postgres psql -U shankara_admin -d shankara_erp -c \"SELECT count(*) FROM voucher WHERE valid_to IS NULL AND vch_no LIKE 'SYN9/%';\"", (err, stdout) => {
        console.log('\nSYN9 Count:\n' + stdout.trim());
    });
  });
};

run().catch(console.error);
