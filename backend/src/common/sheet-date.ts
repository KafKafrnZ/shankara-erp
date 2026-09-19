// Excel's day 0 is Dec 30 1899 (not Jan 1 1900) — this offset also
// self-corrects for Excel's fictitious Feb 29 1900 leap-year bug.
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

/** Headers Tally/office sheets use for a date column. Broader than just
 *  "date" / "Applicable From" — those two missed Valid To, W.E.F., As On. */
export const DATE_COLUMN_RE =
  /date|\bdt\b|w\.?\s*e\.?\s*f|applicable|valid\s*(from|to|till|until)|as\s*on|effective|period\s*(from|to)/i;

export function isDateColumnLabel(label: string): boolean {
  return DATE_COLUMN_RE.test(label);
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD from a JS Date. Excel date-only cells are UTC midnight.
 *  Anything else is a civil date in Asia/Kolkata — using the machine's
 *  local timezone failed CI (UTC runners) and would still slip a day
 *  via toISOString() on the office IST boxes. */
export function calendarDateFromJs(d: Date): string {
  const utcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  if (utcMidnight) return ymdUtc(d);
  return ymdUtc(new Date(d.getTime() + IST_OFFSET_MS));
}

export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 60000) return null;
  return calendarDateFromJs(
    new Date(EXCEL_EPOCH_UTC_MS + serial * 86400000),
  );
}

function isoDateOnly(value: string): string | null {
  const t = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return calendarDateFromJs(d);
  }
  return null;
}

/** Store extra date cells as YYYY-MM-DD. Date-typed cells always convert
 *  (column name doesn't matter). Raw Excel serials only convert on a
 *  date-labelled column, so a 5-digit HSN/qty doesn't become a date. */
export function formatExtraValue(label: string, value: unknown): string {
  if (value instanceof Date) return calendarDateFromJs(value);
  if (typeof value === 'string') {
    const t = value.trim();
    const iso = isoDateOnly(t);
    if (iso) return iso;
    if (isDateColumnLabel(label) && /^\d+(\.\d+)?$/.test(t)) {
      return excelSerialToIsoDate(Number(t)) ?? t;
    }
    return t;
  }
  if (typeof value === 'number' && isDateColumnLabel(label)) {
    return excelSerialToIsoDate(value) ?? String(value);
  }
  return String(value ?? '').trim();
}

/** DD-MM-YYYY for the UI / Excel numFmt. Leaves non-dates alone. */
export function displaySheetDate(label: string, value: string): string {
  if (!value) return value;
  const iso = formatExtraValue(label, value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  }
  return value;
}

/** ExcelJS Date cell (UTC midnight) so export shows a real date, not text. */
export function excelDateForExport(
  label: string,
  value: string,
): Date | string {
  if (!value) return value;
  const iso = formatExtraValue(label, value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return value;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
