import { parseIndianAmount } from './amount';
import { parseAmountToCents, formatCents } from './money';
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
    it('round-half-up on the third decimal (not IEEE-754 toFixed)', () => {
      expect(parseIndianAmount('1.005')).toBe('1.01');
      expect(parseIndianAmount('1.004')).toBe('1.00');
      expect(parseIndianAmount('5.005')).toBe('5.01');
    });
    it('rejects garbage that parseFloat would coerce', () => {
      expect(parseIndianAmount('12.34.56')).toBeNull();
    });
    it('sums many 0.10 lines in paise without float drift', () => {
      let sum = 0n;
      for (let i = 0; i < 100; i++) sum += parseAmountToCents('0.10')!;
      expect(formatCents(sum)).toBe('10.00');
    });
  });

  describe('parseTallyDate', () => {
    it('parses d-MMM-yy', () => {
      expect(parseTallyDate('1-Apr-25')).toBe('2025-04-01');
    });
    it('parses excel serial 45383', () => {
      expect(parseTallyDate(45383)).toBe('2024-04-01');
    });
    it('rejects impossible calendar dates', () => {
      expect(parseTallyDate('31-02-2025')).toBeNull();
      expect(parseTallyDate('31-Feb-25')).toBeNull();
      expect(parseTallyDate('2025-02-31')).toBeNull();
    });
  });

  describe('normalizeVchNo', () => {
    it('normalizes voucher number', () => {
      expect(normalizeVchNo('INV/HYD/24-25/11820')).toBe('invhyd242511820');
    });
  });
});
