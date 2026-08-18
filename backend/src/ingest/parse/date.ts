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

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) return str;
  }

  // Try d-MMM-yy or dd-MMM-yyyy
  const dMmmYyMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dMmmYyMatch) {
    let [ , d, mmm, yy ] = dMmmYyMatch;
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const mm = months[mmm.toLowerCase()];
    if (mm) {
      if (yy.length === 2) {
        yy = (parseInt(yy, 10) >= 50 ? '19' : '20') + yy;
      }
      return `${yy}-${mm}-${d.padStart(2, '0')}`;
    }
  }

  // Try dd-MM-yyyy
  const ddMmYyyyMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [ , d, m, y ] = ddMmYyyyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}
