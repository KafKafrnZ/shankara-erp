import { parseIndianAmount } from './amount';
import { parseTallyDate } from './date';
import { normalizeVchNo } from './vch-no';

describe('Parse utilities', () => {
  describe('parseIndianAmount', () => {
    it('parses indian comma amounts', () => {
      expect(parseIndianAmount('12,48,500.00')).toBe('1248500.00');
    });
    it('parses Dr Cr and rupee', () => {
      expect(parseIndianAmount('₹ 50,000.00 Dr')).toBe('50000.00');
      expect(parseIndianAmount('50,000.00 Cr')).toBe('50000.00');
    });
    it('parses accounting paren', () => {
      expect(parseIndianAmount('(1,000.00)')).toBe('-1000.00');
    });
    it('unparseable amount returns null', () => {
      expect(parseIndianAmount('NOT_A_NUMBER')).toBeNull();
    });
  });

  describe('parseTallyDate', () => {
    it('parses d-MMM-yy', () => {
      expect(parseTallyDate('1-Apr-25')).toBe('2025-04-01');
    });
    it('parses excel serial 45383', () => {
      expect(parseTallyDate(45383)).toBe('2024-04-01');
    });
  });

  describe('normalizeVchNo', () => {
    it('normalizes voucher number', () => {
      expect(normalizeVchNo('INV/HYD/24-25/11820')).toBe('invhyd242511820');
    });
  });
});
