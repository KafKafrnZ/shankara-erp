import { DetectResult } from '../parse/types';
import { parseTallyDate } from '../parse/date';

function cleanHeader(val: string): string {
  if (!val) return '';
  return val.trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
}

export function detectSalesRegister(rows: string[][]): DetectResult {
  let hasSalesRegister = false;
  let hasDayBook = false;
  let titleCompany: string | null = null;
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  let headerRowIndex = -1;
  const columns: Record<string, number> = {};

  const scanLimit = Math.min(rows.length, 20);

  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    const rowText = row.join(' ').toLowerCase();

    if (rowText.includes('sales register')) {
      hasSalesRegister = true;
    }
    if (rowText.includes('day book')) {
      hasDayBook = true;
    }

    // Try to find period
    for (const cell of row) {
      if (!cell) continue;
      const match = cell.trim().match(/^(.+?)\s+to\s+(.+)$/i);
      if (match && !cell.toLowerCase().includes('sales register') && !periodFrom) {
        const fromDate = parseTallyDate(match[1]);
        const toDate = parseTallyDate(match[2]);
        if (fromDate && toDate) {
          periodFrom = fromDate;
          periodTo = toDate;
        }
      }
    }

    if (!titleCompany && !rowText.includes('sales register') && periodFrom === null) {
      const candidate = row.find(c => c && c.trim().length > 0);
      if (candidate && !candidate.toLowerCase().includes(' to ')) {
        titleCompany = candidate.trim();
      }
    }

    // Header detection
    const normalizedRow = row.map(cleanHeader);
    const hasDate = normalizedRow.includes('date');
    const hasParticulars = normalizedRow.includes('particulars') || normalizedRow.includes('party') || normalizedRow.includes('party\'s name') || normalizedRow.includes('party name');
    const hasVchType = normalizedRow.includes('vch type') || normalizedRow.includes('voucher type');
    const hasVchNo = normalizedRow.includes('vch no') || normalizedRow.includes('voucher no') || normalizedRow.includes('invoice no');
    const hasAmount = normalizedRow.includes('invoice amount') || normalizedRow.includes('total') || normalizedRow.includes('debit') || normalizedRow.includes('credit') || normalizedRow.includes('taxable value');

    if (hasDate && hasParticulars && hasVchType && hasVchNo && hasAmount) {
      if (headerRowIndex === -1) {
        headerRowIndex = i;
        for (let j = 0; j < normalizedRow.length; j++) {
          const col = normalizedRow[j];
          if (!col) continue;
          if (col === 'date') columns['date'] = j;
          else if (col === 'particulars' || col === 'party' || col === 'party\'s name' || col === 'party name') columns['particulars'] = j;
          else if (col === 'vch type' || col === 'voucher type') columns['vchType'] = j;
          else if (col === 'vch no' || col === 'voucher no' || col === 'invoice no') columns['vchNo'] = j;
          else {
            columns[row[j].trim()] = j;
          }
        }
      }
    }
  }

  if (headerRowIndex === -1 || !hasSalesRegister || hasDayBook) {
    return { ok: false, error: 'UNRECOGNIZED_LAYOUT' };
  }

  return {
    ok: true,
    reportType: 'SALES_REGISTER',
    titleCompany,
    periodFrom,
    periodTo,
    headerRowIndex,
    columns,
  };
}
