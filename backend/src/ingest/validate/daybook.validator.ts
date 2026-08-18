import { ParseResult, ParsedVoucher, ParseReject } from '../parse/types';

export function validateDayBook(parsed: ParseResult): { vouchers: ParsedVoucher[], rejects: ParseReject[] } {
  const rejects: ParseReject[] = [...parsed.rejects];
  const acceptedVouchers: ParsedVoucher[] = [];

  for (const v of parsed.vouchers) {
    const validLines: any[] = [];

    for (const line of v.lines) {
      const dZero = line.debit === '0.00' || line.debit === '0';
      const cZero = line.credit === '0.00' || line.credit === '0';
      const dPos = !dZero && !line.debit.startsWith('-');
      const cPos = !cZero && !line.credit.startsWith('-');

      if (dPos && cPos) {
        rejects.push({
          sourceRowNo: v.sourceRowNo,
          code: 'BOTH_SIDES',
          message: 'Line has both debit and credit',
          raw: line as any,
        });
      } else {
        validLines.push(line);
      }
    }

    if (validLines.length > 0) {
      v.lines = validLines;
      acceptedVouchers.push(v);
    }
  }

  return {
    vouchers: acceptedVouchers,
    rejects,
  };
}
