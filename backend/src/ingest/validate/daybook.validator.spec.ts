import { validateDayBook } from './daybook.validator';
import { ParseResult, ParsedVoucher } from '../parse/types';

describe('DayBook Validator', () => {
  const createMockVoucher = (lines: any[]): ParsedVoucher => ({
    vchNo: '123',
    vchNoNorm: '123',
    vchType: 'Sales',
    vchDate: '2025-04-01',
    partyName: 'Party',
    totalAmount: '100.00',
    narration: null,
    sourceRowNo: 2,
    extra: {},
    lines,
  });

  it('drops line with both debit and credit', () => {
    const parsed: ParseResult = {
      detect: { ok: true, reportType: 'DAY_BOOK', titleCompany: 'A', periodFrom: null, periodTo: null, headerRowIndex: 1, columns: {} },
      vouchers: [
        createMockVoucher([
          { lineNo: 1, ledgerName: 'A', debit: '100.00', credit: '0.00', extra: {} },
          { lineNo: 2, ledgerName: 'B', debit: '50.00', credit: '50.00', extra: {} },
        ])
      ],
      rejects: [],
    };

    const res = validateDayBook(parsed);
    expect(res.vouchers.length).toBe(1);
    expect(res.vouchers[0].lines.length).toBe(1);
    expect(res.vouchers[0].lines[0].ledgerName).toBe('A');
    expect(res.rejects.length).toBe(1);
    expect(res.rejects[0].code).toBe('BOTH_SIDES');
  });

  it('drops voucher when every line is invalid', () => {
    const parsed: ParseResult = {
      detect: { ok: true, reportType: 'DAY_BOOK', titleCompany: 'A', periodFrom: null, periodTo: null, headerRowIndex: 1, columns: {} },
      vouchers: [
        createMockVoucher([
          { lineNo: 1, ledgerName: 'B', debit: '50.00', credit: '50.00', extra: {} },
        ])
      ],
      rejects: [],
    };

    const res = validateDayBook(parsed);
    expect(res.vouchers.length).toBe(0);
    expect(res.rejects.length).toBe(1);
  });
});
