export const ITEM_SKIP_CODES: Record<string, string> = {
  UNRECOGNIZED_SHEET: 'This sheet did not match any known Item Master layout.',
  MISSING_ITEM_CODE: 'Row is missing a required item code, catalogue no, or alias.',
  MISSING_ITEM_NAME: 'Row is missing a required item name.',
};

export function describeItemSkip(code: string): string {
  return ITEM_SKIP_CODES[code] || 'Unrecognized error format.';
}

/**
 * Batch-level failures, in words a non-technical user can act on.
 * The raw values here come from a spreadsheet parser and read like
 * "invalid signature: 0x73696874" — never show those directly.
 */
export function describeItemBatchError(raw: string | null | undefined): string {
  if (!raw) return 'This file could not be processed.';

  if (raw === 'NO_RECOGNIZED_SHEETS') {
    return "None of the sheets in this file matched a layout we know. Check that it's the Item Master or Catalog export from Tally, not a different report.";
  }
  if (raw === 'ZERO_ACCEPTED_ROWS') {
    return 'This file was read successfully but contained no usable item rows.';
  }
  // ExcelJS reports a non-spreadsheet file as a bad ZIP/OLE signature.
  if (/signature|zip|corrupt|end of central directory|not a valid/i.test(raw)) {
    return "This file doesn't look like a readable Excel or CSV file. It may be a different file type, or the download may have been incomplete — try exporting it from Tally again.";
  }
  if (/password|encrypted/i.test(raw)) {
    return 'This file appears to be password-protected. Please remove the protection and upload it again.';
  }
  return 'This file could not be read. Please re-export it from Tally and try again — if it keeps failing, contact your steward with the file name.';
}
