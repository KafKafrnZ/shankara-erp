/** Integer paise (cents). Round-half-up on the 3rd decimal. No IEEE-754. */

export function parseAmountToCents(raw: string): bigint | null {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.replace(/₹/g, '').replace(/,/g, '').trim();
  cleaned = cleaned.replace(/\s*(Dr|Cr)\s*$/i, '').replace(/\s+/g, '');
  if (!cleaned) return null;

  let isNegative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    cleaned = cleaned.slice(1, -1);
  } else if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  }

  if (!/^\d+(\.\d*)?$/.test(cleaned)) return null;

  const [intPartRaw, fracPartRaw = ''] = cleaned.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;
  const frac = fracPartRaw.padEnd(3, '0');
  const twoDigits = frac.slice(0, 2);
  const roundDigit = (frac.charCodeAt(2) || 48) - 48;

  let cents = BigInt(intPart) * 100n + BigInt(twoDigits);
  if (roundDigit >= 5) cents += 1n;

  return isNegative ? -cents : cents;
}

export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const s = abs.toString().padStart(3, '0');
  return sign + s.slice(0, -2) + '.' + s.slice(-2);
}
