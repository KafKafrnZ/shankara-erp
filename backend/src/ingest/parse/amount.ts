import { parseAmountToCents, formatCents } from './money';

export function parseIndianAmount(raw: string): string | null {
  const cents = parseAmountToCents(raw);
  return cents === null ? null : formatCents(cents);
}
