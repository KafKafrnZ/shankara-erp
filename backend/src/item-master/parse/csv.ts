/**
 * Small RFC-4180-ish CSV reader. Tally/Excel CSV is usually comma, sometimes
 * tab or semicolon (European Excel). Quoted fields may contain the delimiter
 * or newlines. Doubled quotes unescape.
 */

const DELIMS = [',', '\t', ';'] as const;

function unquotedCount(line: string, delim: string): number {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === delim) n++;
  }
  return n;
}

export function detectCsvDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  let best: string = ',';
  let bestCount = -1;
  for (const d of DELIMS) {
    const count = unquotedCount(first, d);
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function decodeSpreadsheetText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  return buffer.toString('utf8');
}

export function parseCsvText(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = '';
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (c === '\r') {
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
