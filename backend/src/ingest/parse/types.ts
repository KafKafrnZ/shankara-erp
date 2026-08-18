export type DetectResult =
  | {
      ok: true;
      reportType: 'DAY_BOOK';
      titleCompany: string | null;
      periodFrom: string | null; // YYYY-MM-DD
      periodTo: string | null;
      headerRowIndex: number;    // 0-based among extracted text rows
      columns: Record<string, number>; // canonical name → col index
    }
  | {
      ok: false;
      error: 'UNRECOGNIZED_LAYOUT';
    };

export type ParseReject = {
  sourceRowNo: number; // 1-based as in the file (row 1 = first line)
  code: string;
  message: string;
  raw: Record<string, string>;
};

export type ParsedLine = {
  lineNo: number;
  ledgerName: string;
  debit: string;  // numeric string 2 dp, e.g. "1248500.00"
  credit: string;
  extra: Record<string, string>;
};

export type ParsedVoucher = {
  vchNo: string;
  vchNoNorm: string;
  vchType: string;
  vchDate: string; // YYYY-MM-DD
  partyName: string | null;
  totalAmount: string;
  narration: string | null;
  sourceRowNo: number;
  extra: Record<string, string>;
  lines: ParsedLine[];
};

export type ParseResult = {
  detect: DetectResult;
  vouchers: ParsedVoucher[];
  rejects: ParseReject[];
};
