import { detectReport } from './report.detector';
import * as fs from 'fs';
import * as path from 'path';

function parseCsvBasic(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
      } else {
        cur += char;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

describe('Report Detector', () => {
  it('detects sample-daybook.csv as DAY_BOOK', () => {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/daybook/sample-daybook.csv'), 'utf8');
    const rows = parseCsvBasic(csv);
    const result = detectReport(rows);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reportType).toBe('DAY_BOOK');
    }
  });

  it('detects sample-sales-register.csv as SALES_REGISTER', () => {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/sales-register/sample-sales-register.csv'), 'utf8');
    const rows = parseCsvBasic(csv);
    const result = detectReport(rows);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reportType).toBe('SALES_REGISTER');
      expect(result.titleCompany).toContain('Shankara');
      expect(result.periodFrom).toBe('2025-04-01');
      expect(result.periodTo).toBe('2025-04-30');
    }
  });

  it('rejects not-a-sales-register.csv and tiny.csv as UNRECOGNIZED_LAYOUT', () => {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/sales-register/not-a-sales-register.csv'), 'utf8');
    const rows = parseCsvBasic(csv);
    const result = detectReport(rows);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('UNRECOGNIZED_LAYOUT');
    }
    
    const tiny = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/daybook/tiny.csv'), 'utf8');
    const tinyRows = parseCsvBasic(tiny);
    expect(detectReport(tinyRows).ok).toBe(false);
  });

  it('prioritizes DAY_BOOK if both strings exist', () => {
    const rows = [
      ['Shankara Buildpro - Hyderabad'],
      ['Day Book Sales Register'],
      ['1-Apr-25 to 30-Apr-25'],
      ['Date', 'Particulars', 'Vch Type', 'Vch No.', 'Debit', 'Credit'],
      ['1-Apr-25', 'Sri Steel Traders', 'Sales', 'INV/SR/1', '100', '']
    ];
    const result = detectReport(rows);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reportType).toBe('DAY_BOOK');
    }
  });
});
