import { isXlsxSignature } from './is-xlsx';

describe('isXlsxSignature', () => {
  it('accepts a real xlsx (ZIP local file header)', () => {
    expect(
      isXlsxSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])),
    ).toBe(true);
  });

  it('rejects a PDF renamed to .xlsx', () => {
    expect(isXlsxSignature(Buffer.from('%PDF-1.4'))).toBe(false);
  });

  it('rejects a plain text file', () => {
    expect(isXlsxSignature(Buffer.from('hello world'))).toBe(false);
  });

  it('rejects an empty buffer', () => {
    expect(isXlsxSignature(Buffer.alloc(0))).toBe(false);
  });

  it('rejects a buffer shorter than the signature', () => {
    expect(isXlsxSignature(Buffer.from([0x50, 0x4b]))).toBe(false);
  });

  it('rejects other ZIP signatures not used by a real xlsx first-write', () => {
    // PK\x05\x06 = empty archive end-of-central-directory record
    expect(isXlsxSignature(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
  });
});
