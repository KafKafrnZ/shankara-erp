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

/** YYYY-MM-DD from a JS Date without the IST-midnight → previous-day shift
 *  that toISOString() produces on office machines. */
export function calendarDateFromJs(d: Date): string {
  const useUtc =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0;
  const y = useUtc ? d.getUTCFullYear() : d.getFullYear();
  const m = (useUtc ? d.getUTCMonth() : d.getMonth()) + 1;
  const day = useUtc ? d.getUTCDate() : d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 60000) return null;
  return calendarDateFromJs(
    new Date(EXCEL_EPOCH_UTC_MS + serial * 86400000),
  );
}

function isoDateOnly(value: string): string | null {
  const t = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
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
