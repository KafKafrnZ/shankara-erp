import { detectSalesRegister } from '../detect/sales-register.detector';
import { ParseResult, ParsedVoucher, ParseReject, ParsedLine } from './types';
import { parseIndianAmount } from './amount';
import { parseAmountToCents, formatCents } from './money';
import { parseTallyDate } from './date';
import { normalizeVchNo } from './vch-no';

export function parseSalesRegister(rows: string[][]): ParseResult {
  const detect = detectSalesRegister(rows);
  if (!detect.ok || detect.reportType !== 'SALES_REGISTER') {
    return { detect, vouchers: [], rejects: [] };
  }

  const MAX_PARSE_ROWS = parseInt(process.env.MAX_PARSE_ROWS || '500000', 10);
  const vouchers: ParsedVoucher[] = [];
  const rejects: ParseReject[] = [];

  const { columns, headerRowIndex } = detect;
  
  const dateCol = columns['date'];
  const partCol = columns['particulars'];
  const vchTypeCol = columns['vchType'];
  const vchNoCol = columns['vchNo'];

  // Find amount columns by checking keys case-insensitively
  let invoiceAmountCol = -1;
  let totalCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let taxableValueCol = -1;
  let cgstCol = -1;
  let sgstCol = -1;
  let igstCol = -1;
  let narrationCol = -1;

  for (const [colName, colIdx] of Object.entries(columns)) {
    const lower = colName.toLowerCase();
    if (lower === 'invoice amount') invoiceAmountCol = colIdx;
    else if (lower === 'total') totalCol = colIdx;
    else if (lower === 'debit') debitCol = colIdx;
    else if (lower === 'credit') creditCol = colIdx;
    else if (lower === 'taxable value') taxableValueCol = colIdx;
    else if (lower === 'cgst') cgstCol = colIdx;
    else if (lower === 'sgst') sgstCol = colIdx;
    else if (lower === 'igst') igstCol = colIdx;
    else if (lower === 'narration') narrationCol = colIdx;
  }

  const skipKeywords = ['opening balance', 'closing balance', 'grand total', 'total'];
  let rowCountAfterHeader = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    rowCountAfterHeader++;
    if (rowCountAfterHeader > MAX_PARSE_ROWS) {
      rejects.push({
        sourceRowNo: i + 1,
        code: 'MAX_PARSE_ROWS',
        message: `Exceeded maximum rows (${MAX_PARSE_ROWS})`,
        raw: {},
      });
      return { detect, vouchers: [], rejects };
    }

    const row = rows[i];
    // Check if empty row
    if (!row.some(c => c && c.trim().length > 0)) continue;

    const rawDate = row[dateCol] || '';
    const rawPart = row[partCol] || '';
    const rawVchType = row[vchTypeCol] || '';
    const rawVchNo = row[vchNoCol] || '';
    const lowerPart = rawPart.trim().toLowerCase();

    // Skip opening/closing/totals
    if (skipKeywords.includes(lowerPart)) {
      continue;
    }

    // Must have date, type, no for a voucher
    const date = parseTallyDate(rawDate);
    if (!date) {
      rejects.push({ sourceRowNo: i + 1, code: 'MISSING_VCH_DATE', message: 'Missing date', raw: {} });
      continue;
    }
    if (!rawVchNo.trim()) {
      rejects.push({ sourceRowNo: i + 1, code: 'MISSING_VCH_NO', message: 'Missing vchNo', raw: {} });
      continue;
    }
    if (!rawVchType.trim()) {
      rejects.push({ sourceRowNo: i + 1, code: 'MISSING_VCH_TYPE', message: 'Missing type', raw: {} });
      continue;
    }

    let rawTotalAmount = '';
    if (invoiceAmountCol !== -1 && row[invoiceAmountCol]) rawTotalAmount = row[invoiceAmountCol];
    else if (totalCol !== -1 && row[totalCol]) rawTotalAmount = row[totalCol];
    else if (debitCol !== -1 && row[debitCol]) rawTotalAmount = row[debitCol];
    else if (creditCol !== -1 && row[creditCol]) rawTotalAmount = row[creditCol];

    const totalAmountStr = parseIndianAmount(rawTotalAmount);
    if (!totalAmountStr) {
      rejects.push({ sourceRowNo: i + 1, code: 'UNPARSEABLE_AMOUNT', message: 'Bad total amount', raw: {} });
      continue;
    }

    const partyName = rawPart.trim() || null;
    let narration: string | null = null;
    if (narrationCol !== -1 && row[narrationCol] && row[narrationCol].trim()) {
      narration = row[narrationCol].trim();
    }

    const currentVoucher: ParsedVoucher = {
      vchNo: rawVchNo.trim(),
      vchNoNorm: normalizeVchNo(rawVchNo.trim()),
      vchType: rawVchType.trim(),
      vchDate: date,
      partyName,
      totalAmount: totalAmountStr,
      narration,
      sourceRowNo: i + 1,
      extra: {},
      lines: [],
    };

    // Extra fields
    for (const [colName, colIdx] of Object.entries(columns)) {
      const lower = colName.toLowerCase();
      if (!['date', 'particulars', 'vchtype', 'vchno', 'party', "party's name", 'party name', 'invoice amount', 'total', 'debit', 'credit', 'taxable value', 'cgst', 'sgst', 'igst', 'narration'].includes(lower)) {
        if (row[colIdx]) currentVoucher.extra[colName] = row[colIdx];
      }
    }

    // Lines
    // 1. Party -> debit = totalAmount, credit = 0.00
    if (partyName) {
      currentVoucher.lines.push({
        lineNo: currentVoucher.lines.length + 1,
        ledgerName: partyName,
        debit: totalAmountStr,
        credit: '0.00',
        extra: {}
      });
    }

    // 2. Taxable Value -> ledger Sales, debit 0.00, credit = taxable
    if (taxableValueCol !== -1 && row[taxableValueCol]) {
      const amt = parseIndianAmount(row[taxableValueCol]);
      if (amt && parseAmountToCents(amt) !== 0n) {
        currentVoucher.lines.push({
          lineNo: currentVoucher.lines.length + 1,
          ledgerName: 'Sales',
          debit: '0.00',
          credit: amt,
          extra: {}
        });
      }
    }

    // 3. CGST
    if (cgstCol !== -1 && row[cgstCol]) {
      const amt = parseIndianAmount(row[cgstCol]);
      if (amt && parseAmountToCents(amt) !== 0n) {
        currentVoucher.lines.push({
          lineNo: currentVoucher.lines.length + 1,
          ledgerName: 'CGST',
          debit: '0.00',
          credit: amt,
          extra: {}
        });
      }
    }

    // 4. SGST
    if (sgstCol !== -1 && row[sgstCol]) {
      const amt = parseIndianAmount(row[sgstCol]);
      if (amt && parseAmountToCents(amt) !== 0n) {
        currentVoucher.lines.push({
          lineNo: currentVoucher.lines.length + 1,
          ledgerName: 'SGST',
          debit: '0.00',
          credit: amt,
          extra: {}
        });
      }
    }

    // 5. IGST
    if (igstCol !== -1 && row[igstCol]) {
      const amt = parseIndianAmount(row[igstCol]);
      if (amt && parseAmountToCents(amt) !== 0n) {
        currentVoucher.lines.push({
          lineNo: currentVoucher.lines.length + 1,
          ledgerName: 'IGST',
          debit: '0.00',
          credit: amt,
          extra: {}
        });
      }
    }

    vouchers.push(currentVoucher);
  }

  return { detect, vouchers, rejects };
}
