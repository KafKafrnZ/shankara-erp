import { TOKEN_KEY } from './api.ts';

export interface ExportableRow {
  itemCode: string;
  itemName: string;
  brand?: string | null;
  catalogueNo?: string | null;
  sapItemCode?: string | null;
  alias?: string | null;
  mainGroup?: string | null;
  subGroup?: string | null;
  uom?: string | null;
  hsnDescription?: string | null;
  extra?: Record<string, string> | null;
}

const FIXED_COLUMNS: Array<{ label: string; key: keyof ExportableRow }> = [
  { label: 'Item Code', key: 'itemCode' },
  { label: 'Item Name', key: 'itemName' },
  { label: 'Brand', key: 'brand' },
  { label: 'Catalogue No', key: 'catalogueNo' },
  { label: 'SAP Item Code', key: 'sapItemCode' },
  { label: 'Alias', key: 'alias' },
  { label: 'Main Group', key: 'mainGroup' },
  { label: 'Sub Group', key: 'subGroup' },
  { label: 'UOM', key: 'uom' },
  { label: 'HSN Description', key: 'hsnDescription' },
];

function tsvCell(value: unknown): string {
  // A literal tab or newline inside a cell would otherwise split it across
  // columns/rows on paste — flatten to a single space instead.
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/** Tab-separated header row + one row per item. Pasted into an open Excel
 *  sheet, this lands as real columns instantly — no manual re-splitting,
 *  which is what a plain "Label: value" text block would force. */
export function buildExcelPasteText(rows: ExportableRow[]): string {
  if (rows.length === 0) return '';
  const extraKeys = [...new Set(rows.flatMap((r) => Object.keys(r.extra || {})))].sort();
  const header = [...FIXED_COLUMNS.map((c) => c.label), ...extraKeys];
  const lines = [header.map(tsvCell).join('\t')];
  for (const row of rows) {
    const values = [
      ...FIXED_COLUMNS.map((c) => row[c.key] ?? ''),
      ...extraKeys.map((key) => row.extra?.[key] ?? ''),
    ];
    lines.push(values.map(tsvCell).join('\t'));
  }
  return lines.join('\n');
}

/** Downloads a real .xlsx built server-side (same column set as
 *  buildExcelPasteText) for the given item codes. */
export async function exportToExcel(itemCodes: string[], filename = 'catalog-export.xlsx'): Promise<void> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const res = await fetch('/api/item-search/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ itemCodes }),
  });
  if (!res.ok) {
    throw new Error('Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
