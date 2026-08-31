import {
  detectSpreadsheetKind,
  isCsvPayload,
  isXlsSignature,
  isXlsxSignature,
  matchUpload,
} from './spreadsheet-kind';

describe('spreadsheet-kind', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
  const csv = Buffer.from('Catalogue No,Brand,UOM\nA,Kohler,PCS\n');
  const pdf = Buffer.from('%PDF-1.4');

  it('classifies xlsx / xls / csv by magic (or text)', () => {
    expect(isXlsxSignature(zip)).toBe(true);
    expect(isXlsSignature(ole)).toBe(true);
    expect(isCsvPayload(csv)).toBe(true);
    expect(detectSpreadsheetKind(zip)).toBe('xlsx');
    expect(detectSpreadsheetKind(ole)).toBe('xls');
    expect(detectSpreadsheetKind(csv)).toBe('csv');
    expect(detectSpreadsheetKind(pdf)).toBeNull();
  });

  it('requires the extension to match the bytes', () => {
    expect(matchUpload('master.xlsx', zip)).toBe('xlsx');
    expect(matchUpload('master.xls', ole)).toBe('xls');
    expect(matchUpload('master.csv', csv)).toBe('csv');
    expect(matchUpload('master.xlsx', csv)).toBeNull();
    expect(matchUpload('master.csv', zip)).toBeNull();
    expect(matchUpload('master.xls', zip)).toBeNull();
    expect(matchUpload('notes.txt', csv)).toBeNull();
    expect(matchUpload('scan.pdf', pdf)).toBeNull();
  });

  it('does not treat a ZIP or OLE file as csv even if the name says so', () => {
    expect(isCsvPayload(zip)).toBe(false);
    expect(isCsvPayload(ole)).toBe(false);
  });
});
