import { DetectResult } from '../parse/types';
import { detectDayBook } from './daybook.detector';
import { detectSalesRegister } from './sales-register.detector';

export function detectReport(rows: string[][]): DetectResult {
  const day = detectDayBook(rows);
  if (day.ok) return day;
  const sales = detectSalesRegister(rows);
  if (sales.ok) return sales;
  return { ok: false, error: 'UNRECOGNIZED_LAYOUT' };
}
