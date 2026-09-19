import {
  calendarDateFromJs,
  displaySheetDate,
  excelDateForExport,
  excelSerialToIsoDate,
  formatExtraValue,
  isDateColumnLabel,
} from './sheet-date';

describe('sheet-date', () => {
  it('recognises the date headers Tally actually uses', () => {
    expect(isDateColumnLabel('Applicable From')).toBe(true);
    expect(isDateColumnLabel('Applicable To')).toBe(true);
    expect(isDateColumnLabel('Valid From')).toBe(true);
    expect(isDateColumnLabel('W.E.F.')).toBe(true);
    expect(isDateColumnLabel('As On')).toBe(true);
    expect(isDateColumnLabel('GST Rate')).toBe(false);
    expect(isDateColumnLabel('Part No')).toBe(false);
  });

  it('does not shift an IST-midnight Date back a day', () => {
    // 15 Jan 2024 00:00 IST = 14 Jan 2024 18:30 UTC
    const istMidnight = new Date('2024-01-14T18:30:00.000Z');
    expect(calendarDateFromJs(istMidnight)).toBe('2024-01-15');
    expect(calendarDateFromJs(new Date(Date.UTC(2024, 0, 15)))).toBe(
      '2024-01-15',
    );
  });

  it('converts Excel serials on date columns and leaves them on others', () => {
    // 45306 = 15 Jan 2024
    expect(excelSerialToIsoDate(45306)).toBe('2024-01-15');
    expect(formatExtraValue('Applicable From', 45306)).toBe('2024-01-15');
    expect(formatExtraValue('GST Rate', 45306)).toBe('45306');
    expect(formatExtraValue('Item Type', 'Finished')).toBe('Finished');
  });

  it('trims ISO timestamps and Date objects even when the header is not "date"', () => {
    expect(
      formatExtraValue('Created', '2024-01-15T00:00:00.000Z'),
    ).toBe('2024-01-15');
    expect(
      formatExtraValue('Some Col', new Date(Date.UTC(2024, 0, 15))),
    ).toBe('2024-01-15');
  });

  it('displays DD-MM-YYYY and still repairs serials already stored in extra', () => {
    expect(displaySheetDate('Applicable From', '2024-01-15')).toBe(
      '15-01-2024',
    );
    expect(displaySheetDate('Applicable From', '45306')).toBe('15-01-2024');
    expect(displaySheetDate('GST Rate', '18%')).toBe('18%');
  });

  it('exports a real Excel date for date cells', () => {
    const d = excelDateForExport('Applicable From', '2024-01-15');
    expect(d).toBeInstanceOf(Date);
    expect((d as Date).toISOString().slice(0, 10)).toBe('2024-01-15');
    expect(excelDateForExport('GST Rate', '18%')).toBe('18%');
  });
});
