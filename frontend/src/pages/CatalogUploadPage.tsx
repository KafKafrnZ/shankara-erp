import { useState } from 'react';
import { LiveSourcePane } from '../components/LiveSourcePane.tsx';
import { ItemUploadFlow } from '../components/ItemUploadFlow.tsx';

export function CatalogUploadPage() {
  // Mirrors the batch id/status living inside ItemUploadFlow so
  // LiveSourcePane can refetch on every step (uploaded, held, published,
  // rejected) exactly as it did when this state lived directly on this page.
  const [batchKey, setBatchKey] = useState('');

  return (
    <div className="upload-page">
      <h1 className="page-title">Upload items</h1>
      <p className="muted page-lead">Item list from Tally. Excel (.xlsx or .xls) or CSV.</p>
      <LiveSourcePane refreshKey={batchKey} />

      <ItemUploadFlow
        persistParam="batch"
        onBatchChange={(b) => setBatchKey(b ? `${b.id}:${b.status}` : '')}
      />
    </div>
  );
}
