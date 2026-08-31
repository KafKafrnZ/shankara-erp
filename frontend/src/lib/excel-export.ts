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

/** First-seen extra key order across rows. The API pads `extra` in sheet
 *  order, so sorting here would scramble columns relative to the file. */
export function extraKeysInOrder(rows: ExportableRow[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.extra || {})) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/** Tab-separated header row + one row per item. Pasted into an open Excel
 *  sheet, this lands as real columns instantly — no manual re-splitting,
 *  which is what a plain "Label: value" text block would force. */
export function buildExcelPasteText(rows: ExportableRow[]): string {
  if (rows.length === 0) return '';
  const extraKeys = extraKeysInOrder(rows);
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
  const res = await fetch('/api/item-search/export', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
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

export type FilterExportQuery = {
  q?: string;
  mainGroup?: string;
  subGroup?: string;
  brand?: string;
  extra?: Record<string, string>;
};

/** Downloads everything matching the current search/filter, not just what's
 *  been hand-checked into the selection tray — for "export this whole
 *  brand/category" without ticking a box per row. `truncated` tells the
 *  caller whether the server's safety cap actually cut the file short, so
 *  the UI can say so honestly instead of quietly handing back a partial
 *  download. */
export async function exportFilteredToExcel(
  query: FilterExportQuery,
  filename: string,
): Promise<{ truncated: boolean; rowCount: number }> {
  const res = await fetch('/api/item-search/export-filtered', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query),
  });
  if (!res.ok) {
    throw new Error('Export failed');
  }
  const truncated = res.headers.get('X-Export-Truncated') === 'true';
  const rowCount = Number(res.headers.get('X-Export-Row-Count') ?? 0);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { truncated, rowCount };
}
