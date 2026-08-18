import { DetectResult } from '../parse/types';
import { parseTallyDate } from '../parse/date';

function cleanHeader(val: string): string {
  if (!val) return '';
  return val.trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
}

export function detectDayBook(rows: string[][]): DetectResult {
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

    if (rowText.includes('day book')) {
      hasDayBook = true;
    }

    // Try to find period
    for (const cell of row) {
      if (!cell) continue;
      const match = cell.trim().match(/^(.+?)\s+to\s+(.+)$/i);
      if (match && !cell.toLowerCase().includes('day book') && !periodFrom) {
        const fromDate = parseTallyDate(match[1]);
        const toDate = parseTallyDate(match[2]);
        if (fromDate && toDate) {
          periodFrom = fromDate;
          periodTo = toDate;
        }
      }
    }

    if (!titleCompany && !rowText.includes('day book') && periodFrom === null) {
      const candidate = row.find(c => c && c.trim().length > 0);
      if (candidate) {
        // Wait, the period might be detected in this row above.
        // Let's make sure it doesn't contain " to " if periodFrom wasn't parsed yet.
        if (!candidate.toLowerCase().includes(' to ')) {
          titleCompany = candidate.trim();
        }
      }
    }

    // Header detection
    const normalizedRow = row.map(cleanHeader);
    const hasDate = normalizedRow.includes('date');
    const hasParticulars = normalizedRow.includes('particulars') || normalizedRow.includes('ledger');
    const hasVchType = normalizedRow.includes('vch type') || normalizedRow.includes('voucher type');
    const hasVchNo = normalizedRow.includes('vch no') || normalizedRow.includes('voucher no');
    const hasDebit = normalizedRow.includes('debit');
    const hasCredit = normalizedRow.includes('credit');

    if (hasDate && hasParticulars && hasVchType && hasVchNo && hasDebit && hasCredit) {
      // If we find multiple headers, S4 requires us to pick the one that contains 'Vch No'/'Debit'. 
      // Since we just checked that, we take the first matching one or replace if needed?
      // "If two header-like rows, use the one that contains Vch No / Debit."
      // Since this check enforces both, the first one that matches all is the header.
      if (headerRowIndex === -1) {
        headerRowIndex = i;
        for (let j = 0; j < normalizedRow.length; j++) {
          const col = normalizedRow[j];
          if (!col) continue;
          if (col === 'date') columns['date'] = j;
          else if (col === 'particulars' || col === 'ledger') columns['particulars'] = j;
          else if (col === 'vch type' || col === 'voucher type') columns['vchType'] = j;
          else if (col === 'vch no' || col === 'voucher no') columns['vchNo'] = j;
          else if (col === 'debit') columns['debit'] = j;
          else if (col === 'credit') columns['credit'] = j;
          else {
            // Keep original case or just trimmed for extra columns
            columns[row[j].trim()] = j;
          }
        }
      }
    }
  }

  if (headerRowIndex === -1 || !hasDayBook) {
    return { ok: false, error: 'UNRECOGNIZED_LAYOUT' };
  }

  return {
    ok: true,
    reportType: 'DAY_BOOK',
    titleCompany,
    periodFrom,
    periodTo,
    headerRowIndex,
    columns,
  };
}
