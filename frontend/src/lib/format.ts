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

/** Same date-column heuristic as backend/src/common/sheet-date.ts. */
const DATE_COLUMN_RE =
  /date|\bdt\b|w\.?\s*e\.?\s*f|applicable|valid\s*(from|to|till|until)|as\s*on|effective|period\s*(from|to)/i;

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 60000) return null;
  const d = new Date(EXCEL_EPOCH_UTC_MS + serial * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Show extra sheet cells as DD-MM-YYYY when they are dates (ISO, YYYY-MM-DD,
 *  or a leftover Excel serial on a date-labelled column). */
export function formatSheetCell(label: string, value: string | null | undefined): string {
  if (!value) return '—';
  const t = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return formatDate(t.slice(0, 10));
  if (DATE_COLUMN_RE.test(label) && /^\d+(\.\d+)?$/.test(t)) {
    const iso = excelSerialToIso(Number(t));
    if (iso) return formatDate(iso);
  }
  return value;
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
