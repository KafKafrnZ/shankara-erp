import { describe, it, expect } from 'vitest';
import { buildExcelPasteText } from './excel-export.ts';
import type { ExportableRow } from './excel-export.ts';

describe('buildExcelPasteText', () => {
  it('returns an empty string for no rows', () => {
    expect(buildExcelPasteText([])).toBe('');
  });

  it('builds a tab-separated header and one row per item', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'ABC-1', itemName: 'Item One', brand: 'Kohler' },
    ];
    const text = buildExcelPasteText(rows);
    const [header, row1] = text.split('\n');
    expect(header.split('\t')[0]).toBe('Item Code');
    expect(header.split('\t')[1]).toBe('Item Name');
    expect(row1.split('\t')[0]).toBe('ABC-1');
    expect(row1.split('\t')[1]).toBe('Item One');
  });

  it('appends extra columns in first-seen order, not alphabetically', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'A', itemName: 'A', extra: { Zeta: 'z1' } },
      { itemCode: 'B', itemName: 'B', extra: { Alpha: 'a1' } },
    ];
    const text = buildExcelPasteText(rows);
    const header = text.split('\n')[0].split('\t');
    // The API pads extra in sheet-header order. Sorting here would put
    // Alpha before Zeta and scramble columns relative to the file.
    expect(header.slice(-2)).toEqual(['Zeta', 'Alpha']);
  });

  it('keeps a padded empty extra column so a blank sheet field still exports', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'A', itemName: 'A', extra: { 'MRP Value': '', 'HSN No': '123' } },
    ];
    const text = buildExcelPasteText(rows);
    const header = text.split('\n')[0].split('\t');
    const data = text.split('\n')[1].split('\t');
    const mrpIdx = header.indexOf('MRP Value');
    expect(mrpIdx).toBeGreaterThan(-1);
    expect(data[mrpIdx]).toBe('');
    expect(header).toContain('SAP Item Code');
  });

  it('pads a blank cell for an extra key a given row has no value for', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'A', itemName: 'A', extra: { Color: 'red' } },
      { itemCode: 'B', itemName: 'B', extra: {} },
    ];
    const text = buildExcelPasteText(rows);
    const lines = text.split('\n');
    const colorIdx = lines[0].split('\t').indexOf('Color');
    expect(lines[1].split('\t')[colorIdx]).toBe('red');
    expect(lines[2].split('\t')[colorIdx]).toBe('');
  });

  it('flattens a tab or newline inside a cell so it cannot split into extra columns/rows on paste', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'A', itemName: 'Name\twith\ttabs and\nnewlines' },
    ];
    const text = buildExcelPasteText(rows);
    const dataLine = text.split('\n')[1];
    // Only 10 fixed columns worth of tabs should exist on this line — a
    // literal tab in the cell would otherwise add an 11th field.
    expect(dataLine.split('\t')).toHaveLength(10);
  });

  it('renders a missing field as an empty cell, not "null"/"undefined"', () => {
    const rows: ExportableRow[] = [{ itemCode: 'A', itemName: 'A' }];
    const text = buildExcelPasteText(rows);
    const cells = text.split('\n')[1].split('\t');
    expect(cells).not.toContain('null');
    expect(cells).not.toContain('undefined');
  });
});
