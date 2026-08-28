/**
 * A renamed/malformed file (a PDF or screenshot saved as "export.xlsx")
 * used to pass the filename check, get hashed and queued, and only fail
 * deep inside ExcelJS's streaming parser with "invalid signature: 0x...".
 * .xlsx is a ZIP archive, so a real one always starts with a ZIP local
 * file header (PK\x03\x04) — checking that here rejects the file at the
 * door, before it's stored or queued, in the same plain-language error
 * the extension check already uses.
 *
 * PK\x05\x06 (empty archive) and PK\x07\x08 (spanned archive, data
 * descriptor first) are also valid ZIP signatures but never appear as
 * the first bytes of a real .xlsx workbook, so they're deliberately not
 * accepted here.
 */
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function isXlsxSignature(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(XLSX_MAGIC);
}
