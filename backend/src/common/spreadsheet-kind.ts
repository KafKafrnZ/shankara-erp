/**
 * Door-check for catalog uploads. A renamed PDF used to pass a filename
 * check, get queued, and fail inside ExcelJS as "invalid signature: 0x…".
 * We sniff the real bytes here so the user gets a plain-language 400
 * before anything is stored.
 *
 *   .xlsx — ZIP local file header PK\x03\x04
 *   .xls  — OLE Compound File magic (Excel 97–2003)
 *   .csv  — text with a comma/tab/semicolon in the first 8KB
 */

export type SpreadsheetKind = 'xlsx' | 'xls' | 'csv';

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const EXT_BY_KIND: Record<SpreadsheetKind, string> = {
  xlsx: '.xlsx',
  xls: '.xls',
  csv: '.csv',
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot).toLowerCase();
}

export function isXlsxSignature(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(XLSX_MAGIC);
}

export function isXlsSignature(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_MAGIC);
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  let weird = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    if (b < 0x20 && b !== 0x0c) weird++;
  }
  return weird / sample.length < 0.05;
}

function decodeSample(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2, Math.min(buffer.length, 8192)).toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3, Math.min(buffer.length, 8192)).toString('utf8');
  }
  return buffer.subarray(0, Math.min(buffer.length, 8192)).toString('utf8');
}

export function isCsvPayload(buffer: Buffer): boolean {
  if (isXlsxSignature(buffer) || isXlsSignature(buffer)) return false;
  if (!looksLikeText(buffer)) return false;
  const sample = decodeSample(buffer);
  return /[,;\t]/.test(sample);
}

export function detectSpreadsheetKind(buffer: Buffer): SpreadsheetKind | null {
  if (isXlsxSignature(buffer)) return 'xlsx';
  if (isXlsSignature(buffer)) return 'xls';
  if (isCsvPayload(buffer)) return 'csv';
  return null;
}

/**
 * Extension and bytes have to agree. A .xlsx that isn't a ZIP, or a .csv
 * that's actually a PDF, is the same 400 — not two different failure modes.
 */
export function matchUpload(
  filename: string,
  buffer: Buffer,
): SpreadsheetKind | null {
  const ext = extensionOf(filename);
  const kind = detectSpreadsheetKind(buffer);
  if (!kind) return null;
  if (EXT_BY_KIND[kind] !== ext) return null;
  return kind;
}

export const UPLOAD_ERROR =
  "isn't a spreadsheet we can read. Please upload an Excel workbook (.xlsx or .xls) or a CSV exported from Tally.";
