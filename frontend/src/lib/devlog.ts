// A small in-memory ring buffer of recent API calls, for the Dev Panel.
// Not persisted anywhere — purely a live "what just happened" feed for
// whoever's driving the browser right now.

export type DevLogEntry = {
  id: number;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  ms: number;
  at: number;
};

const MAX_ENTRIES = 50;
let entries: DevLogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export function pushDevLog(entry: Omit<DevLogEntry, 'id'>) {
  entries = [{ ...entry, id: nextId++ }, ...entries].slice(0, MAX_ENTRIES);
  for (const listener of listeners) listener();
}

export function getDevLog(): DevLogEntry[] {
  return entries;
}

export function subscribeDevLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
