export const ITEM_SKIP_CODES: Record<string, string> = {
  UNRECOGNIZED_SHEET: 'This sheet did not match any known Item Master layout.',
  MISSING_ITEM_CODE: 'Row is missing a required item code, catalogue no, or alias.',
  MISSING_ITEM_NAME: 'Row is missing a required item name.',
};

export function describeItemSkip(code: string): string {
  return ITEM_SKIP_CODES[code] || 'Unrecognized error format.';
}
