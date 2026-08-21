const PLAIN: Record<string, string> = {
  MISSING_VCH_DATE: 'Row missing a date',
  MISSING_VCH_NO: 'Row missing a voucher number',
  MISSING_VCH_TYPE: 'Row missing a voucher type (Sales/Receipt/etc.)',
  UNPARSEABLE_AMOUNT: "Couldn't read this row's amount as a number",
  BOTH_SIDES: 'Row has both a debit and a credit amount — expected only one',
  VOUCHER_HAS_NO_VALID_LINES: "None of this voucher's lines could be read",
  MAX_PARSE_ROWS: 'File has more rows than can be processed in one batch',
};

const UPLOAD_SUMMARY: Record<string, string> = {
  UNRECOGNIZED_LAYOUT: "This doesn't look like a Day Book or Sales Register export",
  COMPANY_MISMATCH: "This file's company doesn't match this system",
  ZERO_VOUCHERS: 'No vouchers could be read from this file',
};

export function rejectPlainLanguage(code: string, fallback?: string): string {
  return PLAIN[code] ?? fallback ?? `Couldn't read this row (${code})`;
}

export function uploadErrorPlain(errorSummary: string | null | undefined): string {
  if (!errorSummary) return 'Upload was rejected';
  const code = errorSummary.split(':')[0]?.trim() ?? errorSummary;
  return UPLOAD_SUMMARY[code] ?? errorSummary;
}
