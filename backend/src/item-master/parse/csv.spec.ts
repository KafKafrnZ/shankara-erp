import { detectCsvDelimiter, parseCsvText } from './csv';

describe('csv', () => {
  it('parses quoted commas and doubled quotes', () => {
    const rows = parseCsvText('a,b\n"hello, world","she said ""hi"""\n');
    expect(rows[0]).toEqual(['a', 'b']);
    expect(rows[1]).toEqual(['hello, world', 'she said "hi"']);
  });

  it('picks tab when the header is tab-separated', () => {
    const text = 'Catalogue No\tBrand\tUOM\nA\tKohler\tPCS\n';
    expect(detectCsvDelimiter(text)).toBe('\t');
    expect(parseCsvText(text)[1]).toEqual(['A', 'Kohler', 'PCS']);
  });

  it('picks semicolon for European Excel CSV', () => {
    const text = 'Catalogue No;Brand;UOM\nA;Kohler;PCS\n';
    expect(detectCsvDelimiter(text)).toBe(';');
    expect(parseCsvText(text)[1][1]).toBe('Kohler');
  });
});
