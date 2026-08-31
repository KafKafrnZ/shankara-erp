const EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;

export function isSpreadsheetFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return EXTENSIONS.some((ext) => lower.endsWith(ext));
}
