import { parseSalesRegister } from './sales-register.parser';
import * as fs from 'fs';
import * as path from 'path';

function parseCsvBasic(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
      } else {
        cur += char;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

describe('Sales Register Parser', () => {
  it('parses sales fixture and matches EXPECTED.md', () => {
    const csv = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/sales-register/sample-sales-register.csv'), 'utf8');
    const expected = fs.readFileSync(path.resolve(__dirname, '../../../../fixtures/sales-register/EXPECTED.md'), 'utf8');
    const rows = parseCsvBasic(csv);
    const { detect, vouchers, rejects } = parseSalesRegister(rows);
    
    expect(detect.ok).toBe(true);
    expect(rejects.length).toBe(0);

    const getExpected = (search: string) => {
      const line = expected.split('\n').find(l => l.includes(search));
      return line ? line.split('|')[2].trim().replace(/`/g, '') : null;
    };

    expect(String(vouchers.length)).toBe(getExpected('vouchers')!.replace(/\*/g, ''));

    const v1 = vouchers.find(v => v.vchNo === 'INV/SR/1');
    expect(v1).toBeDefined();
    expect(v1!.partyName).toBe(getExpected('`INV/SR/1` party'));
    expect(v1!.totalAmount).toBe(getExpected('`INV/SR/1` total'));
    expect(v1!.lines.length).toBe(parseInt(getExpected('`INV/SR/1` lines')!.charAt(0)));

    const v2 = vouchers.find(v => v.vchNo === 'INV/SR/2');
    expect(v2).toBeDefined();
    expect(v2!.partyName).toBe(getExpected('`INV/SR/2` party'));
    expect(v2!.totalAmount).toBe(getExpected('`INV/SR/2` total'));
    expect(v2!.lines.length).toBe(parseInt(getExpected('`INV/SR/2` lines')!.charAt(0)));
    expect(v2!.lines.map(l => ({ ledger: l.ledgerName, debit: l.debit, credit: l.credit }))).toEqual([
      { ledger: 'Apex Pipes', debit: '59000.00', credit: '0.00' },
      { ledger: 'Sales', debit: '0.00', credit: '50000.00' },
      { ledger: 'CGST', debit: '0.00', credit: '4500.00' },
      { ledger: 'SGST', debit: '0.00', credit: '4500.00' },
    ]);

    expect(v1!.lines.map(l => ({ ledger: l.ledgerName, debit: l.debit, credit: l.credit }))).toEqual([
      { ledger: 'Sri Steel Traders', debit: '1248500.00', credit: '0.00' },
      { ledger: 'Sales', debit: '0.00', credit: '1023770.00' },
      { ledger: 'CGST', debit: '0.00', credit: '112365.00' },
      { ledger: 'SGST', debit: '0.00', credit: '112365.00' },
    ]);
  });

  it('rejects unparseable invoice amount', () => {
    const rows = [
      ['Shankara'],
      ['Sales Register'],
      [''],
      ['Date', 'Particulars', 'Vch Type', 'Vch No.', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Invoice Amount'],
      ['1-Apr-25', 'Apex Pipes', 'Sales', 'INV/SR/2', '50,000.00', '4,500.00', '4,500.00', '', '59,000.00'],
      ['1-Apr-25', 'Bad Pipes', 'Sales', 'INV/SR/3', '50,000.00', '4,500.00', '4,500.00', '', 'bad']
    ];
    const { vouchers, rejects } = parseSalesRegister(rows);
    expect(vouchers.length).toBe(1);
    expect(vouchers[0].vchNo).toBe('INV/SR/2');
    expect(rejects.length).toBe(1);
    expect(rejects[0].code).toBe('UNPARSEABLE_AMOUNT');
  });
});
