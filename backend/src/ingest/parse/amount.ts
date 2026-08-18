export function parseIndianAmount(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.replace(/[₹, DrCr\s]/g, '');

  if (!cleaned) return null;

  let isNegative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    cleaned = cleaned.slice(1, -1);
  } else if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  let finalNum = isNegative ? -num : num;
  return finalNum.toFixed(2);
}
