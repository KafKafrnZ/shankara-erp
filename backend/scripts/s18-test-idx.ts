import 'dotenv/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

async function run() {
  const login = async (email: string, pass: string) => {
    const r = await fetch('http://127.0.0.1:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const d = await (r.json() as any);
    return d.accessToken;
  };
  const steward = await login('steward@shankara.local', process.env.SEED_STEWARD_PASSWORD!);
  const finance = await login('finance@shankara.local', process.env.SEED_FINANCE_PASSWORD!);

  const randomId = Math.floor(Math.random() * 1000000);
  const csv = `"Shankara Buildpro"\n"Day Book"\n"Date","Vch Type","Vch No.","Particulars","Debit","Credit"\n"15-05-2024","Sales","S18IDX/1","S18 Index Party ${randomId}","100.00",""\n"","","","Sales Account","","100.00"`;
  const file = path.join(os.tmpdir(), 's18idx.csv');
  fs.writeFileSync(file, csv);

  // Upload
  console.log('Uploading...');
  const form = new FormData();
  form.append('companyId', 'SHANKARA_HYD');
  const blob = new Blob([fs.readFileSync(file)]);
  form.append('file', blob, 's18idx.csv');
  
  const uploadRes = await fetch('http://127.0.0.1:3000/api/uploads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${steward}`,
    },
    body: form,
  });
  const upData = await uploadRes.json();
  const batchId = upData.batchId;
  console.log(`Uploaded batch ${batchId}, status: ${upData.status}`);

  // OS must be absent
  const checkOS = async () => {
    const r = await fetch('http://127.0.0.1:9200/shankara-vouchers/_search?q=vch_no:S18IDX/1');
    const d = await r.json();
    return d.hits?.total?.value || 0;
  };

  let osHits = await checkOS();
  console.log(`OS hits while held: ${osHits}`);

  // Publish
  console.log('Publishing...');
  const pubRes = await fetch(`http://127.0.0.1:3000/api/batches/${batchId}/publish`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${steward}` }
  });
  console.log(`Publish HTTP: ${pubRes.status}`);
  if (!pubRes.ok) console.log(await pubRes.text());

  // Check OS
  // Wait a sec for OS refresh
  await new Promise(r => setTimeout(r, 1500));
  osHits = await checkOS();
  console.log(`OS hits after publish: ${osHits}`);

  // Fetch from OS directly to see doc
  const rSearchOS = await fetch('http://127.0.0.1:9200/shankara-vouchers/_search?q=vch_no:S18IDX/1');
  const osData = await rSearchOS.json();
  if (osData.hits?.hits?.length > 0) {
    const docId = osData.hits.hits[0]._id;
    const rDoc = await fetch(`http://127.0.0.1:9200/shankara-vouchers/_doc/${docId}`);
    console.log(`GET _doc 200: ${rDoc.status}, _id=${docId}`);
  }

  // Finance search
  const finSearch = await fetch('http://127.0.0.1:3000/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${finance}` },
    body: JSON.stringify({ q: 'S18IDX/1', limit: 20 })
  });
  const finData = await finSearch.json();
  console.log(`Finance search total after publish: ${finData.total}`);

  // Hold
  console.log('Holding...');
  const holdRes = await fetch(`http://127.0.0.1:3000/api/batches/${batchId}/hold`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${steward}` }
  });
  console.log(`Hold HTTP: ${holdRes.status}`);
  if (!holdRes.ok) console.log(await holdRes.text());

  // Check OS
  await new Promise(r => setTimeout(r, 1500));
  osHits = await checkOS();
  console.log(`OS hits after hold: ${osHits}`);
  
  if (osData.hits?.hits?.length > 0) {
    const docId = osData.hits.hits[0]._id;
    const rDocHold = await fetch(`http://127.0.0.1:9200/shankara-vouchers/_doc/${docId}`);
    console.log(`GET _doc after hold: ${rDocHold.status}`);
  }

  const finSearch2 = await fetch('http://127.0.0.1:3000/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${finance}` },
    body: JSON.stringify({ q: 'S18IDX/1', limit: 20 })
  });
  const finData2 = await finSearch2.json();
  console.log(`Finance search total after hold: ${finData2.total}`);
}

run().catch(console.error);
