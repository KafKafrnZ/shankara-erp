const LIMIT = 5;

function keyFor(userId: string): string {
  return `sb.recentSearches.${userId}`;
}

export function readRecentSearches(userId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function rememberSearch(userId: string, q: string): string[] {
  const needle = q.trim();
  if (!needle) return readRecentSearches(userId);
  const existing = readRecentSearches(userId).filter((item) => item.toLowerCase() !== needle.toLowerCase());
  const next = [needle, ...existing].slice(0, LIMIT);
  localStorage.setItem(keyFor(userId), JSON.stringify(next));
  return next;
}
