import { dedupeByAlias, identityKey, normalizeAlias } from './item-identity';

describe('normalizeAlias', () => {
  it('trims and lowercases', () => {
    expect(normalizeAlias('  BAHJAQALDABR573M ')).toBe('bahjaqaldabr573m');
  });

  it('treats blank as missing', () => {
    expect(normalizeAlias('   ')).toBeNull();
    expect(normalizeAlias(null)).toBeNull();
    expect(normalizeAlias(undefined)).toBeNull();
  });
});

describe('identityKey', () => {
  it('prefers alias over item code', () => {
    expect(
      identityKey({ itemCode: 'OTHER', alias: 'BAHJAQALDABR573M' }),
    ).toEqual({
      key: 'alias:bahjaqaldabr573m',
      byAlias: true,
      display: 'BAHJAQALDABR573M',
    });
  });

  it('falls back to item code when alias is empty', () => {
    expect(identityKey({ itemCode: 'CP123', alias: '' }).key).toBe(
      'code:cp123',
    );
  });
});

describe('dedupeByAlias', () => {
  it('keeps the last row for a repeated alias and reports the earlier ones', () => {
    const { kept, duplicates } = dedupeByAlias([
      { itemCode: 'A1', alias: 'FOO', itemName: 'first' },
      { itemCode: 'A2', alias: 'foo', itemName: 'second' },
      { itemCode: 'B', alias: 'BAR', itemName: 'other' },
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.map((i) => i.itemName)).toEqual(['second', 'other']);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].display).toBe('FOO');
    expect(duplicates[0].byAlias).toBe(true);
    expect(duplicates[0].keptItem.itemName).toBe('second');
  });

  it('dedupes by item code when alias is missing', () => {
    const { kept, duplicates } = dedupeByAlias([
      { itemCode: 'X', alias: '', itemName: 'old' },
      { itemCode: 'x', alias: null, itemName: 'new' },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].itemName).toBe('new');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].byAlias).toBe(false);
  });

  it('leaves distinct aliases alone', () => {
    const { kept, duplicates } = dedupeByAlias([
      { itemCode: 'A', alias: 'ONE' },
      { itemCode: 'B', alias: 'TWO' },
    ]);
    expect(kept).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});
