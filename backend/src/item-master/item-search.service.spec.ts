import {
  escapeLike,
  extraKeysInOrder,
  mergeExportExtraKeys,
} from './item-search.service';

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

describe('extraKeysInOrder', () => {
  it('follows first-seen object key order rather than sorting', () => {
    expect(
      extraKeysInOrder([
        { extra: { Zeta: 'z', Alpha: '' } },
        { extra: { Alpha: 'a', Beta: 'b' } },
      ]),
    ).toEqual(['Zeta', 'Alpha', 'Beta']);
  });
});
