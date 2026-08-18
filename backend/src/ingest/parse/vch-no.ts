export function normalizeVchNo(raw: string): string {
  if (!raw) return '';
  return raw.toLowerCase().replace(/[\/\-\s]/g, '');
}
