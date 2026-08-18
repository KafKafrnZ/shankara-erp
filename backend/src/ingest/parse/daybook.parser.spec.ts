import { parseDayBookFile } from './daybook.parser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.setTimeout(30000);

describe('DayBook Parser', () => {
  const sampleCsv = path.resolve(__dirname, '../../../../fixtures/daybook/sample-daybook.csv');
  const badAmountCsv = path.resolve(__dirname, '../../../../fixtures/daybook/sample-daybook-bad-amount.csv');
  const serialDateCsv = path.resolve(__dirname, '../../../../fixtures/daybook/sample-daybook-serial-date.csv');
  const notDayBookCsv = path.resolve(__dirname, '../../../../fixtures/daybook/not-a-daybook.csv');
  
  let tempXlsxPath: string;

  beforeAll(async () => {
    // Generate temp XLSX from sample CSV rows
    const exceljs = require('exceljs');
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    const csvLines = fs.readFileSync(sampleCsv, 'utf8').split('\n');
    
    for (const line of csvLines) {
      if (line.trim() === '') continue;
      // manual split just for testing builder
      const cols = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === ',' && !inQuotes) { cols.push(cur); cur = ''; }
        else cur += line[i];
      }
      cols.push(cur);
      worksheet.addRow(cols);
    }
    tempXlsxPath = path.join(os.tmpdir(), `temp-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(tempXlsxPath);
  });

  afterAll(() => {
    if (fs.existsSync(tempXlsxPath)) {
      fs.unlinkSync(tempXlsxPath);
    }
  });

  it('skips title block and finds header', async () => {
    const res = await parseDayBookFile(sampleCsv);
    expect(res.vouchers.length).toBeGreaterThan(0);
    expect(res.vouchers[0].vchDate).toBe('2025-04-01');
  });

  it('skips opening closing and grand total', async () => {
    const res = await parseDayBookFile(sampleCsv);
    const hasInvalid = res.vouchers.some(v => v.partyName?.toLowerCase().includes('grand total'));
    expect(hasInvalid).toBe(false);
    expect(res.vouchers.length).toBe(2);
  });

  it('groups split lines under one voucher', async () => {
    const res = await parseDayBookFile(sampleCsv);
    const sales = res.vouchers.find(v => v.vchType === 'Sales');
    expect(sales).toBeDefined();
    expect(sales?.lines.length).toBe(4);
    expect(sales?.partyName).toBe('Sri Steel Traders');
  });

  it('stores narration not as a zero line', async () => {
    const res = await parseDayBookFile(sampleCsv);
    const sales = res.vouchers.find(v => v.vchType === 'Sales');
    expect(sales?.narration).toBe('TMT 12mm 18MT KA01AB1234');
    const zeroLine = sales?.lines.find(l => l.debit === '0.00' && l.credit === '0.00');
    expect(zeroLine).toBeUndefined();
  });

  it('parses indian comma amounts on sample', async () => {
    const res = await parseDayBookFile(sampleCsv);
    const sales = res.vouchers.find(v => v.vchType === 'Sales');
    expect(sales?.totalAmount).toBe('1248500.00');
  });

  it('normalizes voucher number on sample', async () => {
    const res = await parseDayBookFile(sampleCsv);
    const sales = res.vouchers.find(v => v.vchType === 'Sales');
    expect(sales?.vchNoNorm).toBe('invhyd242511820');
  });

  it('keeps unknown column in extra', async () => {
    const res = await parseDayBookFile(sampleCsv);
    const sales = res.vouchers.find(v => v.vchType === 'Sales');
    expect(sales?.extra['Cost Centre']).toBe('HYD');
  });

  it('rejects unparseable amount row but continues', async () => {
    const res = await parseDayBookFile(badAmountCsv);
    expect(res.vouchers.length).toBe(2);
    expect(res.rejects.length).toBe(1);
    expect(res.rejects[0].code).toBe('UNPARSEABLE_AMOUNT');
  });

  it('parses excel serial date', async () => {
    const res = await parseDayBookFile(serialDateCsv);
    expect(res.vouchers.length).toBeGreaterThan(0);
    expect(res.vouchers[0].vchDate).toBe('2024-04-01');
  });

  it('unrecognized sheet returns detect failure', async () => {
    const res = await parseDayBookFile(notDayBookCsv);
    expect(res.detect.ok).toBe(false);
    expect(res.vouchers.length).toBe(0);
  });

  it('parses xlsx built from sample-daybook rows', async () => {
    const res = await parseDayBookFile(tempXlsxPath);
    expect(res.detect.ok).toBe(true);
    expect(res.vouchers.length).toBe(2);
    const sales = res.vouchers.find(v => v.vchType === 'Sales');
    expect(sales?.lines.length).toBe(4);
  });
});
