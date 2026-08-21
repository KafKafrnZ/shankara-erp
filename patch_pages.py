import re

# ItemDrawer.tsx
with open('frontend/src/components/ItemDrawer.tsx', 'r') as f:
    content = f.read()
content = content.replace(
    'api.get<ItemHistoryRow[]>(`/item-search/history/${encodeURIComponent(itemCode)}`)',
    'api<ItemHistoryRow[]>(`/api/item-search/history/${encodeURIComponent(itemCode)}`)'
)
with open('frontend/src/components/ItemDrawer.tsx', 'w') as f:
    f.write(content)

# CatalogPage.tsx
with open('frontend/src/pages/CatalogPage.tsx', 'r') as f:
    content = f.read()
content = content.replace(
    "import { useEffect, useState, useMemo, useRef, FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';",
    "import { useEffect, useState, useMemo, useRef } from 'react';\nimport type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';"
)
content = content.replace(
    "import { truncate } from '../lib/format.ts';",
    ""
)
content = content.replace(
    "api.get<Facets>('/item-search/facets')",
    "api<Facets>('/api/item-search/facets')"
)
content = content.replace(
    "await api.post<SearchResult>('/item-search', payload)",
    "await api<SearchResult>('/api/item-search', { method: 'POST', body: JSON.stringify(payload) })"
)
with open('frontend/src/pages/CatalogPage.tsx', 'w') as f:
    f.write(content)

# CatalogUploadPage.tsx
with open('frontend/src/pages/CatalogUploadPage.tsx', 'r') as f:
    content = f.read()
content = content.replace(
    "import { DragEvent, useEffect, useState } from 'react';",
    "import { useEffect, useState } from 'react';\nimport type { DragEvent } from 'react';"
)
content = content.replace(
    "await api.get<ItemBatch>(`/item-batches/${id}`)",
    "await api<ItemBatch>(`/api/item-batches/${id}`)"
)
content = content.replace(
    "await api.get<{ data: any[]; total: number }>(`/item-batches/${id}/skips`)",
    "await api<{ data: any[]; total: number }>(`/api/item-batches/${id}/skips`)"
)
content = content.replace(
    "await api.post<UploadResponse>('/item-uploads', formData)",
    "await api<UploadResponse>('/api/item-uploads', { method: 'POST', body: formData })"
)
content = content.replace(
    "await api.post<ItemBatch>(`/item-batches/${batch.id}/publish`, {})",
    "await api<ItemBatch>(`/api/item-batches/${batch.id}/publish`, { method: 'POST' })"
)
content = content.replace(
    "await api.post<ItemBatch>(`/item-batches/${batch.id}/hold`, {})",
    "await api<ItemBatch>(`/api/item-batches/${batch.id}/hold`, { method: 'POST' })"
)
with open('frontend/src/pages/CatalogUploadPage.tsx', 'w') as f:
    f.write(content)
