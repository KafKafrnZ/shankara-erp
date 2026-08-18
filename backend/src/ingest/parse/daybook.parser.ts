import { detectDayBook } from '../detect/daybook.detector';
import { ParseResult, ParsedVoucher, ParseReject, ParsedLine } from './types';
import { parseIndianAmount } from './amount';
import { parseTallyDate } from './date';
import { normalizeVchNo } from './vch-no';
import * as fs from 'fs';
import * as readline from 'readline';

function parseCsvLine(line: string): string[] {
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  cols.push(cur.trim());
  return cols;
}

export function parseDayBook(rows: string[][]): ParseResult {
  const detect = detectDayBook(rows);
  if (!detect.ok) {
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
  const debitCol = columns['debit'];
  const creditCol = columns['credit'];

  let currentVoucher: ParsedVoucher | null = null;
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
    const rawDebit = row[debitCol] || '';
    const rawCredit = row[creditCol] || '';

    const lowerPart = rawPart.trim().toLowerCase();
    
    // Skip opening/closing/totals
    if (skipKeywords.includes(lowerPart)) {
      continue;
    }

    // New voucher detection
    const isNewVoucher = rawVchNo.trim() !== '' || (rawDate.trim() !== '' && currentVoucher !== null);

    if (isNewVoucher) {
      // Must have date, vchType, vchNo to start a valid voucher. But wait, if vchNo is empty and date is there,
      // it is a new voucher if currentVoucher is not null. BUT the rule says:
      // "Header row of a voucher: date, vchType, vchNo required. Missing any of those on a row that looks like a new voucher -> reject that row"
      const date = parseTallyDate(rawDate);
      if (!date) {
        rejects.push({ sourceRowNo: i + 1, code: 'MISSING_VCH_DATE', message: 'Missing date', raw: {} });
        continue;
      }
      if (!rawVchType.trim()) {
        rejects.push({ sourceRowNo: i + 1, code: 'MISSING_VCH_TYPE', message: 'Missing type', raw: {} });
        continue;
      }
      if (!rawVchNo.trim()) {
        rejects.push({ sourceRowNo: i + 1, code: 'MISSING_VCH_NO', message: 'Missing vchNo', raw: {} });
        continue;
      }

      const vTypeLower = rawVchType.trim().toLowerCase();
      let partyName: string | null = rawPart.trim();
      if (vTypeLower === 'contra') {
        partyName = null;
      }

      currentVoucher = {
        vchNo: rawVchNo.trim(),
        vchNoNorm: normalizeVchNo(rawVchNo.trim()),
        vchType: rawVchType.trim(),
        vchDate: date,
        partyName,
        totalAmount: '0.00',
        narration: null,
        sourceRowNo: i + 1,
        extra: {},
        lines: [],
      };
      
      // Keep extra fields from header row
      for (const [colName, colIdx] of Object.entries(columns)) {
        if (!['date', 'particulars', 'vchType', 'vchNo', 'debit', 'credit'].includes(colName)) {
          if (row[colIdx]) currentVoucher.extra[colName] = row[colIdx];
        }
      }

      vouchers.push(currentVoucher);
      
      // A header row might also be a line if it has amount
      const dAmt = parseIndianAmount(rawDebit);
      const cAmt = parseIndianAmount(rawCredit);

      if (dAmt === null && rawDebit.trim() !== '') {
        rejects.push({ sourceRowNo: i + 1, code: 'UNPARSEABLE_AMOUNT', message: 'Bad debit', raw: {} });
        continue;
      }
      if (cAmt === null && rawCredit.trim() !== '') {
        rejects.push({ sourceRowNo: i + 1, code: 'UNPARSEABLE_AMOUNT', message: 'Bad credit', raw: {} });
        continue;
      }

      if ((dAmt || cAmt) && rawPart.trim()) {
        const val = dAmt || cAmt || '0.00';
        const sideInFile = dAmt ? 'debit' : 'credit';
        currentVoucher.extra._headerSide = sideInFile; // internal use
        
        const line: ParsedLine = {
          lineNo: currentVoucher.lines.length + 1,
          ledgerName: rawPart.trim(),
          debit: sideInFile === 'debit' ? val : '0.00',
          credit: sideInFile === 'credit' ? val : '0.00',
          extra: {},
        };
        for (const [colName, colIdx] of Object.entries(columns)) {
          if (!['date', 'particulars', 'vchType', 'vchNo', 'debit', 'credit'].includes(colName)) {
            if (row[colIdx]) line.extra[colName] = row[colIdx];
          }
        }
        currentVoucher.lines.push(line);
      }
    } else {
      // It's a line belonging to currentVoucher
      if (!currentVoucher) continue;

      const dAmt = parseIndianAmount(rawDebit);
      const cAmt = parseIndianAmount(rawCredit);

      if (dAmt === null && rawDebit.trim() !== '') {
        rejects.push({ sourceRowNo: i + 1, code: 'UNPARSEABLE_AMOUNT', message: 'Bad debit', raw: {} });
        continue;
      }
      if (cAmt === null && rawCredit.trim() !== '') {
        rejects.push({ sourceRowNo: i + 1, code: 'UNPARSEABLE_AMOUNT', message: 'Bad credit', raw: {} });
        continue;
      }

      if (!dAmt && !cAmt && rawPart.trim()) {
        // Narration
        if (currentVoucher.narration) {
          currentVoucher.narration += '\n' + rawPart.trim();
        } else {
          currentVoucher.narration = rawPart.trim();
        }
      } else if ((dAmt || cAmt) && rawPart.trim()) {
        const val = dAmt || cAmt || '0.00';
        const headerSide = currentVoucher.extra._headerSide || 'debit';
        const assignedSide = headerSide === 'debit' ? 'credit' : 'debit';

        const line: ParsedLine = {
          lineNo: currentVoucher.lines.length + 1,
          ledgerName: rawPart.trim(),
          debit: assignedSide === 'debit' ? val : '0.00',
          credit: assignedSide === 'credit' ? val : '0.00',
          extra: {},
        };
        for (const [colName, colIdx] of Object.entries(columns)) {
          if (!['date', 'particulars', 'vchType', 'vchNo', 'debit', 'credit'].includes(colName)) {
            if (row[colIdx]) line.extra[colName] = row[colIdx];
          }
        }
        currentVoucher.lines.push(line);
      }
    }
  }

  // Calculate total amounts and fix receipt partyName
  for (const v of vouchers) {
    delete v.extra._headerSide;
    
    let sumD = 0;
    let sumC = 0;
    for (const l of v.lines) {
      sumD += parseFloat(l.debit);
      sumC += parseFloat(l.credit);
    }
    const maxAmount = Math.max(sumD, sumC);
    
    // Fallback if 0
    if (maxAmount === 0 && v.lines.length > 0) {
      // should not happen if lines have amounts
    } else {
      v.totalAmount = maxAmount.toFixed(2);
    }

    if (v.vchType.toLowerCase() === 'receipt' && v.lines.length > 0) {
      // Required: party_name is Cash (first particulars on the header row)
      // We already set partyName = rawPart from header row. We keep it as is.
      // Wait, rule: "party_name is Cash (first particulars on the header row)"
      if (v.partyName && v.lines[0]) {
        v.partyName = v.lines[0].ledgerName;
      }
    }
  }

  return { detect, vouchers, rejects };
}

export async function parseDayBookFile(filePath: string): Promise<ParseResult> {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  
  if (ext === '.xlsx' || ext === '.xls') {
    const exceljs = require('exceljs');
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    const rows: string[][] = [];
    worksheet.eachRow((row: any, rowNumber: number) => {
      const rowData: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any) => {
        let val = cell.value;
        if (val && typeof val === 'object' && val.result !== undefined) {
          val = val.result; // Formula result
        }
        if (val instanceof Date) {
          // Keep ISO or let it be parsed
          val = val.toISOString().split('T')[0];
        }
        rowData.push(val === null || val === undefined ? '' : String(val));
      });
      rows.push(rowData);
    });
    return parseDayBook(rows);
  } else {
    // CSV
    const rows: string[][] = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      rows.push(parseCsvLine(line));
    }
    return parseDayBook(rows);
  }
}
