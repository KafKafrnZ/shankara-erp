import { describe, it, expect } from 'vitest';
import { buildExcelPasteText } from './excel-export.ts';
import type { ExportableRow } from './excel-export.ts';

describe('buildExcelPasteText', () => {
  it('returns an empty string for no rows', () => {
    expect(buildExcelPasteText([])).toBe('');
  });

  it('builds a tab-separated header in Tally\'s own stock-item column order', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'ABC-1', itemName: 'Item One', mainGroup: 'STEEL LONG' },
    ];
    const text = buildExcelPasteText(rows);
    const [header, row1] = text.split('\n');
    const cols = header.split('\t');
    expect(cols).toHaveLength(42);
    expect(cols[0]).toBe('Stock Item Name');
    expect(cols[1]).toBe('Alias');
    expect(cols[2]).toBe('Main Group');
    expect(cols[3]).toBe('Sub Group');
    expect(cols[4]).toBe('UOM');
    expect(cols.at(-1)).toBe('Type Of Supply');
    const cells = row1.split('\t');
    expect(cells[0]).toBe('Item One');
    expect(cells[2]).toBe('STEEL LONG');
  });

  it('reads a non-entity Tally column from extra by its exact label', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'A', itemName: 'A', extra: { Category: 'OTHERS', 'HSN No': '72111410' } },
    ];
    const text = buildExcelPasteText(rows);
    const header = text.split('\n')[0].split('\t');
    const data = text.split('\n')[1].split('\t');
    expect(data[header.indexOf('Category')]).toBe('OTHERS');
    expect(data[header.indexOf('HSN No')]).toBe('72111410');
  });

  it('uses extraKey when the displayed label has a trailing space (Conversion1)', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'A', itemName: 'A', extra: { Conversion1: '1.6099' } },
    ];
    const text = buildExcelPasteText(rows);
    const header = text.split('\n')[0].split('\t');
    const data = text.split('\n')[1].split('\t');
    expect(data[header.indexOf('Conversion1 ')]).toBe('1.6099');
  });

  it('renders a column with no data as an empty cell, not "null"/"undefined"', () => {
    const rows: ExportableRow[] = [{ itemCode: 'A', itemName: 'A' }];
    const text = buildExcelPasteText(rows);
    const cells = text.split('\n')[1].split('\t');
    expect(cells).toHaveLength(42);
    expect(cells).not.toContain('null');
    expect(cells).not.toContain('undefined');
  });

  it('flattens a tab or newline inside a cell so it cannot split into extra columns/rows on paste', () => {
    const rows: ExportableRow[] = [
      { itemCode: 'A', itemName: 'Name\twith\ttabs and\nnewlines' },
    ];
    const text = buildExcelPasteText(rows);
    const dataLine = text.split('\n')[1];
    // Only the 42 Tally columns' worth of tabs should exist on this line —
    // a literal tab in the cell would otherwise add an extra field.
    expect(dataLine.split('\t')).toHaveLength(42);
  });
});
