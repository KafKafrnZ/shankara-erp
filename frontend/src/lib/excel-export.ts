import { formatSheetCell } from './format.ts';

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

// The Tally block shared by the office master sheets (American Standards
// starts it at column AC; Absolute Enterprises at AK). Prefix columns to
// the left of Stock Item Name are internal/SAP and are not copied.
// Duplicate labels ("Expiry Date") are Tally's own, reproduced as-is.
// `extraKey` only when the displayed label differs (trailing space on
// "Conversion1 ").
const TALLY_COLUMNS: Array<{
  label: string;
  key?: Exclude<keyof ExportableRow, 'extra'>;
  extraKey?: string;
}> = [
  { label: 'Stock Item Name', key: 'itemName' },
  { label: 'Alias', key: 'alias' },
  { label: 'Main Group', key: 'mainGroup' },
  { label: 'Sub Group', key: 'subGroup' },
  { label: 'UOM', key: 'uom' },
  { label: 'Alt UOM 1' },
  { label: 'Alt UOM 2' },
  { label: 'Alt UOM 3' },
  { label: 'Conversion1 ', extraKey: 'Conversion1' },
  { label: 'Conversion2' },
  { label: 'Category' },
  { label: 'Part No' },
  { label: 'MRP Value' },
  { label: 'Opening Quantity' },
  { label: 'Opening Rate' },
  { label: 'Op Godown Name' },
  { label: 'Op Batch Name' },
  { label: 'Expiry Date' },
  { label: 'Mfg Date' },
  { label: 'Op Batch Qty' },
  { label: 'Op Batch Rate' },
  { label: 'Opening Amount' },
  { label: 'Applicable Date' },
  { label: 'Std Selling Rate' },
  { label: 'Description' },
  { label: 'Remarks' },
  { label: 'Maintain Batch Wise' },
  { label: 'Track Date Of MFG' },
  { label: 'Expiry Date' },
  { label: 'Applicable From' },
  { label: 'HSN Description', key: 'hsnDescription' },
  { label: 'HSN No' },
  { label: 'Is Non GST Good' },
  { label: 'Taxability' },
  { label: 'Is Reverse Charge Applicable' },
  { label: 'Is Ineligible for Input Credit' },
  { label: 'Set / Alter Tax Details' },
  { label: 'Integrated Tax' },
  { label: 'Central Tax' },
  { label: 'State Tax' },
  { label: 'Cess Tax' },
  { label: 'Type Of Supply' },
];

function tallyColumnValue(
  row: ExportableRow,
  col: (typeof TALLY_COLUMNS)[number],
): string {
  const raw = col.key ? (row[col.key] ?? '') : (row.extra?.[col.extraKey ?? col.label] ?? '');
  const shown = formatSheetCell(col.extraKey ?? col.label, raw);
  return shown === '—' ? '' : shown;
}

function tsvCell(value: unknown): string {
  // A literal tab or newline inside a cell would otherwise split it across
  // columns/rows on paste — flatten to a single space instead.
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/** Tab-separated header row + one row per item, in Tally's own stock-item
 *  column order. Pasted into an open Excel sheet, this lands as real
 *  columns instantly — no manual re-splitting, which is what a plain
 *  "Label: value" text block would force. */
export function buildExcelPasteText(rows: ExportableRow[]): string {
  if (rows.length === 0) return '';
  const header = TALLY_COLUMNS.map((c) => c.label);
  const lines = [header.map(tsvCell).join('\t')];
  for (const row of rows) {
    const values = TALLY_COLUMNS.map((c) => tallyColumnValue(row, c));
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
