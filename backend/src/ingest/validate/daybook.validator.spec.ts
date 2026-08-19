import { validateDayBook } from './daybook.validator';
import { parseDayBookFile } from '../parse/daybook.parser';
import { ParseResult, ParsedVoucher } from '../parse/types';
import * as path from 'path';

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
    expect(res.rejects.length).toBe(2);
    expect(res.rejects[0].code).toBe('BOTH_SIDES');
    expect(res.rejects.some(r => r.code === 'VOUCHER_HAS_NO_VALID_LINES')).toBe(true);
  });

  it('records a reject when a voucher has zero lines', () => {
    const parsed: ParseResult = {
      detect: { ok: true, reportType: 'DAY_BOOK', titleCompany: 'A', periodFrom: null, periodTo: null, headerRowIndex: 1, columns: {} },
      vouchers: [createMockVoucher([])],
      rejects: [],
    };
    const res = validateDayBook(parsed);
    expect(res.vouchers.length).toBe(0);
    expect(res.rejects.length).toBe(1);
    expect(res.rejects[0].code).toBe('VOUCHER_HAS_NO_VALID_LINES');
  });

  it('fixture BOTH/1 is rejected at voucher level, not silently dropped', async () => {
    const parsed = await parseDayBookFile(
      path.resolve(__dirname, '../../../../fixtures/daybook/voucher-all-lines-invalid.csv'),
    );
    const res = validateDayBook(parsed);
    expect(res.vouchers.length).toBe(0);
    expect(res.rejects.some(r => r.code === 'BOTH_SIDES')).toBe(true);
    expect(res.rejects.some(r => r.code === 'VOUCHER_HAS_NO_VALID_LINES')).toBe(true);
    expect(res.rejects.some(r => r.message.includes('BOTH/1'))).toBe(true);
  });
});
