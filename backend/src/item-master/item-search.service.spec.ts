import {
  escapeLike,
  mergeExportExtraKeys,
  TALLY_EXPORT_COLUMNS,
  tallyColumnValue,
} from './item-search.service';
import type { ItemMasterRow } from './entities/item-master-row.entity';

// This function exists because of a real bug (found in a pre-demo audit,
// not by inspection): an unescaped search for "%" matched the entire
// 177k-row catalog, and "100%" matched every row starting with "100" —
// item names in a tile/sanitaryware catalog genuinely contain these
// characters as literal text, so a user's search has to stay literal.
describe('escapeLike', () => {
  it('escapes a bare % so it is not treated as a LIKE wildcard', () => {
    expect(escapeLike('100%')).toBe('100\\%');
  });

  it('escapes _ the same way, another LIKE wildcard', () => {
    expect(escapeLike('ITEM_CODE')).toBe('ITEM\\_CODE');
  });

  it('escapes a literal backslash (the escape character itself)', () => {
    expect(escapeLike('C:\\path')).toBe('C:\\\\path');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeLike('50%_off\\deal')).toBe('50\\%\\_off\\\\deal');
  });

  it('leaves an ordinary search term untouched', () => {
    expect(escapeLike('kohler')).toBe('kohler');
  });

  it('leaves an empty string untouched', () => {
    expect(escapeLike('')).toBe('');
  });
});

describe('mergeExportExtraKeys', () => {
  it('keeps sheet-header order and includes headers that have no live values', () => {
    expect(
      mergeExportExtraKeys(
        ['SI No.', 'MRP Value', 'HSN No'],
        ['HSN No', 'Category'],
      ),
    ).toEqual(['SI No.', 'MRP Value', 'HSN No', 'Category']);
  });

  it('drops blank and duplicate sheet headers', () => {
    expect(
      mergeExportExtraKeys(['  ', 'MRP Value', 'MRP Value'], ['MRP Value']),
    ).toEqual(['MRP Value']);
  });
});

describe('TALLY_EXPORT_COLUMNS / tallyColumnValue', () => {
  it('matches the 42-column Tally block from the office master sheets', () => {
    expect(TALLY_EXPORT_COLUMNS).toHaveLength(42);
    expect(TALLY_EXPORT_COLUMNS.map((c) => c.label).slice(0, 5)).toEqual([
      'Stock Item Name',
      'Alias',
      'Main Group',
      'Sub Group',
      'UOM',
    ]);
    expect(TALLY_EXPORT_COLUMNS.at(-1)?.label).toBe('Type Of Supply');
  });

  it('reads an entity-backed column straight from the row', () => {
    const row = { itemName: 'MS Pipe', extra: {} } as ItemMasterRow;
    const col = TALLY_EXPORT_COLUMNS.find((c) => c.label === 'Stock Item Name')!;
    expect(tallyColumnValue(row, col)).toBe('MS Pipe');
  });

  it('reads a non-entity column from extra by its exact label', () => {
    const row = { extra: { Category: 'OTHERS' } } as ItemMasterRow;
    const col = TALLY_EXPORT_COLUMNS.find((c) => c.label === 'Category')!;
    expect(tallyColumnValue(row, col)).toBe('OTHERS');
  });

  it('uses extraKey when the displayed label differs from the extra key (trailing-space column)', () => {
    const row = { extra: { Conversion1: '1.6099' } } as ItemMasterRow;
    const col = TALLY_EXPORT_COLUMNS.find((c) => c.label === 'Conversion1 ')!;
    expect(tallyColumnValue(row, col)).toBe('1.6099');
  });

  it('renders blank, not "undefined", for a column the catalogue has no data for', () => {
    const row = { extra: {} } as ItemMasterRow;
    const col = TALLY_EXPORT_COLUMNS.find((c) => c.label === 'MRP Value')!;
    expect(tallyColumnValue(row, col)).toBe('');
  });

  it('turns leftover Excel serials on date columns into real dates', () => {
    const row = { extra: { 'Applicable From': '45306' } } as ItemMasterRow;
    const col = TALLY_EXPORT_COLUMNS.find((c) => c.label === 'Applicable From')!;
    const value = tallyColumnValue(row, col);
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString().slice(0, 10)).toBe('2024-01-15');
  });
});
