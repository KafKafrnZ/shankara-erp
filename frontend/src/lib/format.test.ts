import { describe, expect, it } from 'vitest';
import { formatDate, formatSheetCell } from './format.ts';

describe('formatSheetCell', () => {
  it('shows ISO and YYYY-MM-DD extra dates as DD-MM-YYYY', () => {
    expect(formatSheetCell('Created', '2024-01-15T00:00:00.000Z')).toBe('15-01-2024');
    expect(formatSheetCell('Anything', '2024-01-15')).toBe('15-01-2024');
    expect(formatDate('2024-01-15')).toBe('15-01-2024');
  });

  it('repairs leftover Excel serials on date columns only', () => {
    expect(formatSheetCell('Applicable From', '45306')).toBe('15-01-2024');
    expect(formatSheetCell('GST Rate', '45306')).toBe('45306');
    expect(formatSheetCell('GST Rate', '18%')).toBe('18%');
  });
});
