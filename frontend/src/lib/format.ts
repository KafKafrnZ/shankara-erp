/** Indian grouping (lakhs/crores) + rupee prefix. Display only — never for arithmetic. */
export function formatINR(value: string): string {
  if (value == null || value === '') return '—';
  const trimmed = String(value).trim();
  if (!trimmed) return '—';

  const negative = trimmed.startsWith('-');
  const raw = negative ? trimmed.slice(1) : trimmed;
  const [intRaw, fracRaw = ''] = raw.split('.');
  const intDigits = (intRaw || '0').replace(/\D/g, '') || '0';
  const frac = (fracRaw.replace(/\D/g, '') + '00').slice(0, 2);

  let grouped: string;
  if (intDigits.length <= 3) {
    grouped = intDigits;
  } else {
    const last3 = intDigits.slice(-3);
    const rest = intDigits.slice(0, -3);
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
  }

  return `${negative ? '-' : ''}₹${grouped}.${frac}`;
}

/** Display-only debit−credit difference. Do not use to decide publish. */
export function formatDisplayDiff(debitSum: string, creditSum: string): string {
  const d = parseFloat(debitSum);
  const c = parseFloat(creditSum);
  if (!Number.isFinite(d) || !Number.isFinite(c)) return '—';
  return formatINR((d - c).toFixed(2));
}

export function formatAsOf(iso: string): string {
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return `${formatted} IST`;
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return '—';
  const day = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return isoDate;
  const [y, m, d] = day.split('-');
  return `${d}-${m}-${y}`;
}

/** r.sharma@… → "R. Sharma"; steward@… → "Steward" */
export function displayNameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? email).trim();
  if (!local) return email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) =>
      part.length === 1
        ? `${part.toUpperCase()}.`
        : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join(' ');
}

export function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].replace(/\./g, '').slice(0, 2).toUpperCase();
  const first = parts[0].replace(/\./g, '').charAt(0);
  const last = parts[parts.length - 1].replace(/\./g, '').charAt(0);
  return `${first}${last}`.toUpperCase();
}

export function initialsFromEmail(email: string): string {
  return initialsFromName(displayNameFromEmail(email));
}

export function isOutOfBalance(errorSummary: string | null | undefined): boolean {
  return Boolean(errorSummary && errorSummary.startsWith('OUT_OF_BALANCE'));
}
