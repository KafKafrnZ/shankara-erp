import { useState, useEffect, useRef } from 'react';

type User = { id: string; email: string; role: string; companyId: string; branchId: string | null };
type Page = 'search' | 'upload';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('search');
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('sb.accessToken');
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => {
          if (u) {
            setUser(u);
            fetchAsOf(token);
          } else {
            sessionStorage.removeItem('sb.accessToken');
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const fetchAsOf = async (token: string) => {
    const res = await fetch('/api/meta/as-of', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setAsOf(data.asOf);
    }
  };

  const handleLogin = async (token: string) => {
    sessionStorage.setItem('sb.accessToken', token);
    const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!meRes.ok) {
      sessionStorage.removeItem('sb.accessToken');
      return;
    }
    const u = await meRes.json();
    setUser(u);
    setPage('search');
    fetchAsOf(token);
  };

  const handleLogout = async () => {
    const token = sessionStorage.getItem('sb.accessToken');
    if (token) {
      await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    }
    sessionStorage.removeItem('sb.accessToken');
    setUser(null);
  };

  if (loading) return <div>Loading...</div>;

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const navigate = (p: Page) => {
    if (p === 'upload' && user.role !== 'steward') {
      setPage('search');
    } else {
      setPage(p);
    }
  };

  const asOfText = asOf ? `Data as of ${new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(asOf))} IST` : 'No published data';

  return (
    <div className="container">
      <div className="header">
        <div className="nav">
          <button onClick={() => navigate('search')}>Search</button>
          {user.role === 'steward' && <button onClick={() => navigate('upload')}>Upload</button>}
        </div>
        <div className="nav">
          <span className="badge">{user.role}</span>
          <span style={{ color: asOf ? 'inherit' : '#888' }}>{asOfText}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>
      
      {page === 'search' && <Search />}
      {page === 'upload' && user.role === 'steward' && <Upload onPublish={() => fetchAsOf(sessionStorage.getItem('sb.accessToken')!)} />}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      await onLogin(data.accessToken);
    } else {
      const err = await res.json();
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="container" style={{ maxWidth: '400px', marginTop: '100px' }}>
      <h2>Login</h2>
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required />
        </div>
        <button type="submit">Login</button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}

function highlightText(text: string | null | undefined, q: string) {
  if (text == null || text === '') return text ?? '';
  const needle = q.trim();
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'ig'));
  const lower = needle.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === lower ? (
      <mark className="search-hl" key={i}>{part}</mark>
    ) : (
      part
    ),
  );
}

function Search() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [activeVoucherId, setActiveVoucherId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const doSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!q.trim()) return;
    const token = sessionStorage.getItem('sb.accessToken');
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ q: q.trim(), limit: 20 }),
    });
    if (res.ok) {
      const data = await res.json();
      setHits(data.hits);
      setSearched(true);
    } else if (res.status === 401) {
      window.location.reload();
    }
  };

  const handleRowClick = (id: string) => {
    setActiveVoucherId(id);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') handleRowClick(id);
  };

  return (
    <div>
      <form onSubmit={doSearch} style={{ marginBottom: '2rem' }}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search vouchers…"
          aria-label="Search vouchers"
          style={{ width: '400px', padding: '0.5rem' }}
        />
        <button type="submit" style={{ marginLeft: '1rem', padding: '0.5rem 1rem' }}>Search</button>
      </form>

      {searched && hits.length === 0 && <div>No vouchers</div>}
      {hits.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Voucher No</th>
              <th>Type</th>
              <th>Date</th>
              <th>Party</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {hits.map(h => (
              <tr 
                key={h.id} 
                className="clickable" 
                onClick={() => handleRowClick(h.id)}
                onKeyDown={e => handleRowKeyDown(e, h.id)}
                tabIndex={0}
              >
                <td>{highlightText(h.vchNo, q)}</td>
                <td>{h.vchType}</td>
                <td>{h.vchDate}</td>
                <td>{highlightText(h.partyName, q)}</td>
                <td>{highlightText(String(h.totalAmount ?? ''), q)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeVoucherId && <VoucherPane id={activeVoucherId} onClose={() => setActiveVoucherId(null)} />}
    </div>
  );
}

function VoucherPane({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const token = sessionStorage.getItem('sb.accessToken');
    fetch(`/api/vouchers/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (r.ok) setData(await r.json());
        else if (r.status === 404) setError('Not found or unpublished');
        else if (r.status === 401) window.location.reload();
        else setError('Failed to load');
      })
      .catch(() => setError('Failed to load'));
  }, [id]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <button className="close-btn" onClick={onClose}>Close</button>
        {error ? (
          <div>{error}</div>
        ) : !data ? (
          <div>Loading...</div>
        ) : (
          <div>
            <h2>{data.vchNo} ({data.vchType})</h2>
            <p><strong>Date:</strong> {data.vchDate}</p>
            <p><strong>Party:</strong> {data.partyName}</p>
            <p><strong>Total:</strong> {data.totalAmount}</p>
            <p><strong>Narration:</strong> {data.narration}</p>
            
            <h3>Lines</h3>
            <table>
              <thead>
                <tr>
                  <th>Line No</th>
                  <th>Ledger</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l: any, i: number) => (
                  <tr key={i}>
                    <td>{l.lineNo}</td>
                    <td>{l.ledgerName}</td>
                    <td>{l.debit}</td>
                    <td>{l.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Source</h3>
            <p><strong>File:</strong> {data.source.fileName}</p>
            <p><strong>Row:</strong> {data.source.sourceRowNo}</p>
            <p><strong>Published:</strong> {data.source.publishedAt}</p>
            <p><strong>SHA256:</strong> <code style={{ wordBreak: 'break-all' }}>{data.source.sha256}</code></p>
          </div>
        )}
      </div>
    </>
  );
}

function Upload({ onPublish }: { onPublish: () => void }) {
  const [companyId, setCompanyId] = useState('SHANKARA_HYD');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [batchInfo, setBatchInfo] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);

  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xls') && !lower.endsWith('.xlsx') && !lower.endsWith('.zip')) {
      setError('Accept .xlsx, .xls, .csv, .zip only');
      return;
    }
    setError('');
    setFile(f);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setStatus('uploading');
    setError('');
    setBatchInfo(null);

    const token = sessionStorage.getItem('sb.accessToken');
    const fd = new FormData();
    fd.append('companyId', companyId);
    fd.append('file', file);

    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    if (res.ok || res.status === 202) {
      const data = await res.json();
      
      if (res.status === 202 && data.status === 'held') {
        setStatus('');
        await fetchBatch(data.batchId);
      } else if (res.status === 202 && data.status === 'rejected') {
        setStatus('rejected');
        setError(data.errorSummary || 'Rejected');
      } else if (res.status === 200 && data.duplicate) {
        setStatus('');
        await fetchBatch(data.batchId);
      }
    } else {
      const err = await res.json();
      setStatus('');
      setError(err.message || 'Upload failed');
      if (res.status === 401) window.location.reload();
    }
  };

  const fetchBatch = async (id: string) => {
    const token = sessionStorage.getItem('sb.accessToken');
    const res = await fetch(`/api/batches/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setBatchInfo(await res.json());
    }
  };

  const doPublish = async (id: string) => {
    const token = sessionStorage.getItem('sb.accessToken');
    setStatus('publishing');
    const res = await fetch(`/api/batches/${id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setStatus('published');
      await fetchBatch(id);
      onPublish();
    } else {
      const err = await res.json();
      setStatus('rejected');
      setError(err.message || 'Publish failed');
    }
  };

  return (
    <div>
      <h2>Upload</h2>
      <form onSubmit={handleUpload} style={{ marginBottom: '2rem' }}>
        <div className="form-group">
          <label>Company ID</label>
          <input value={companyId} onChange={e => setCompanyId(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>File (.csv, .xls, .xlsx, .zip)</label>
          <div
            className={`dropzone${dragOver ? ' dragover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              acceptFile(e.dataTransfer.files[0]);
            }}
          >
            <p>{file ? file.name : 'Drop a file here, or choose one'}</p>
            <input
              type="file"
              accept=".csv,.xls,.xlsx,.zip"
              onChange={e => acceptFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <button type="submit" disabled={status === 'uploading' || status === 'publishing'}>Upload</button>
      </form>

      {status && <div>Status: <strong>{status}</strong></div>}
      {error && <div className="error">{error}</div>}
      
      {batchInfo && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.05)' }}>
          <h3>Batch {batchInfo.id} - {batchInfo.status}</h3>
          <p>Accepted: {batchInfo.acceptedRows} | Rejected: {batchInfo.rejectedRows}</p>
          {batchInfo.errorSummary && batchInfo.errorSummary.startsWith('OUT_OF_BALANCE') && (
            <p style={{ color: 'orange' }}>Warning: {batchInfo.errorSummary}</p>
          )}
          {batchInfo.status === 'held' && (
            <button onClick={() => doPublish(batchInfo.id)} disabled={status === 'publishing'}>Publish</button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
