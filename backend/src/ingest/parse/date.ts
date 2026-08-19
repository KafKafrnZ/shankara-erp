function isValidYmd(year: string, month: string, day: string): boolean {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseTallyDate(raw: string | number): string | null {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number') {
    // Excel epoch 1899-12-30
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(epoch.getTime() + raw * 86400000);
    return dt.toISOString().split('T')[0];
  }

  const str = String(raw).trim();

  if (/^\d{5}$/.test(str)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(epoch.getTime() + parseInt(str, 10) * 86400000);
    return dt.toISOString().split('T')[0];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    if (isValidYmd(y, m, d)) return str;
    return null;
  }

  const dMmmYyMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dMmmYyMatch) {
    let [, d, mmm, yy] = dMmmYyMatch;
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mm = months[mmm.toLowerCase()];
    if (mm) {
      if (yy.length === 2) {
        yy = (parseInt(yy, 10) >= 50 ? '19' : '20') + yy;
      }
      const day = d.padStart(2, '0');
      if (!isValidYmd(yy, mm, day)) return null;
      return `${yy}-${mm}-${day}`;
    }
  }

  const ddMmYyyyMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, d, m, y] = ddMmYyyyMatch;
    const mm = m.padStart(2, '0');
    const dd = d.padStart(2, '0');
    if (!isValidYmd(y, mm, dd)) return null;
    return `${y}-${mm}-${dd}`;
  }

  return null;
}
