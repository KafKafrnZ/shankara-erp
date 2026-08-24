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
