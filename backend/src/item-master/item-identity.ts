/** Alias is the catalog identity for merge. Compared case-insensitively
 *  after trim — Tally exports are not consistent about either. Empty
 *  alias falls back to item_code so a sheet that has no Alias column
 *  still dedupes. */
export function normalizeAlias(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function identityKey(item: {
  itemCode: string;
  alias?: string | null;
}): { key: string; byAlias: boolean; display: string } {
  const alias = normalizeAlias(item.alias);
  if (alias) {
    return { key: `alias:${alias}`, byAlias: true, display: item.alias!.trim() };
  }
  const code = item.itemCode.trim();
  return {
    key: `code:${code.toLowerCase()}`,
    byAlias: false,
    display: code,
  };
}

export type AliasDedupeSkip<T> = {
  item: T;
  keptItem: T;
  display: string;
  byAlias: boolean;
};

export function dedupeByAlias<
  T extends { itemCode: string; alias?: string | null },
>(items: T[]): { kept: T[]; duplicates: AliasDedupeSkip<T>[] } {
  const lastAt = new Map<string, number>();
  const meta = items.map((item) => identityKey(item));
  meta.forEach((m, i) => lastAt.set(m.key, i));

  const kept: T[] = [];
  const keptByKey = new Map<string, T>();
  for (let i = 0; i < items.length; i++) {
    if (lastAt.get(meta[i].key) !== i) continue;
    kept.push(items[i]);
    keptByKey.set(meta[i].key, items[i]);
  }

  const duplicates: AliasDedupeSkip<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    if (lastAt.get(meta[i].key) === i) continue;
    duplicates.push({
      item: items[i],
      keptItem: keptByKey.get(meta[i].key)!,
      display: meta[i].display,
      byAlias: meta[i].byAlias,
    });
  }
  return { kept, duplicates };
}

export type MergeSummary = {
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  duplicateAliasCount: number;
  remappedByAliasCount: number;
  ambiguousAliasCount: number;
};

export const EMPTY_MERGE_SUMMARY: MergeSummary = {
  newCount: 0,
  updateCount: 0,
  unchangedCount: 0,
  duplicateAliasCount: 0,
  remappedByAliasCount: 0,
  ambiguousAliasCount: 0,
};
