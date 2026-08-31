import { describe, expect, it } from 'vitest';
import { isSpreadsheetFilename } from './spreadsheet-filename.ts';

describe('isSpreadsheetFilename', () => {
  it('accepts xlsx, xls, and csv', () => {
    expect(isSpreadsheetFilename('MASTER.xlsx')).toBe(true);
    expect(isSpreadsheetFilename('export.XLS')).toBe(true);
    expect(isSpreadsheetFilename('tally.csv')).toBe(true);
  });

  it('rejects other types', () => {
    expect(isSpreadsheetFilename('notes.txt')).toBe(false);
    expect(isSpreadsheetFilename('scan.pdf')).toBe(false);
    expect(isSpreadsheetFilename('no-extension')).toBe(false);
  });
});
