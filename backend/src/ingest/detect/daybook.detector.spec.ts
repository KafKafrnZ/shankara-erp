import { detectDayBook } from './daybook.detector';
import * as fs from 'fs';
import * as path from 'path';

function parseCsvBasic(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    // VERY simple split for tests, handles simple quotes
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

describe('DayBook Detector', () => {
  it('detects sample-daybook.csv', () => {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/daybook/sample-daybook.csv'), 'utf8');
    const rows = parseCsvBasic(csv);
    const result = detectDayBook(rows);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.periodFrom).toBe('2025-04-01');
      expect(result.periodTo).toBe('2025-04-30');
      expect(result.titleCompany).toContain('Shankara');
      expect(result.headerRowIndex).toBeGreaterThan(0);
    }
  });

  it('rejects not-a-daybook.csv', () => {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/daybook/not-a-daybook.csv'), 'utf8');
    const rows = parseCsvBasic(csv);
    const result = detectDayBook(rows);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('UNRECOGNIZED_LAYOUT');
    }
  });

  it('rejects tiny.csv', () => {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/daybook/tiny.csv'), 'utf8');
    const rows = parseCsvBasic(csv);
    const result = detectDayBook(rows);
    expect(result.ok).toBe(false);
  });
});
