import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ItemMasterRow } from './entities/item-master-row.entity';

// Column order for both the bulk/export endpoints and the Excel workbook —
// same fixed fields the drawer already shows, in the same order, so the
// paste and the on-screen card read the same way.
const EXPORT_FIXED_COLUMNS: Array<{ label: string; field: keyof ItemMasterRow }> = [
  { label: 'Item Code', field: 'itemCode' },
  { label: 'Item Name', field: 'itemName' },
  { label: 'Brand', field: 'brand' },
  { label: 'Catalogue No', field: 'catalogueNo' },
  { label: 'SAP Item Code', field: 'sapItemCode' },
  { label: 'Alias', field: 'alias' },
  { label: 'Main Group', field: 'mainGroup' },
  { label: 'Sub Group', field: 'subGroup' },
  { label: 'UOM', field: 'uom' },
  { label: 'HSN Description', field: 'hsnDescription' },
];

// "%" and "_" are LIKE wildcards, and "\" is the escape character itself.
// Left unescaped, a search for "100%" matches every row that starts with
// "100" (and a bare "%" matches the entire catalog) — item names in a
// tile/sanitaryware catalog genuinely contain these characters, so a
// user's literal search has to stay literal.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// A user can only ever add this many extra filters at once — enough to be
// genuinely useful without letting one request build an unbounded WHERE
// clause out of arbitrary jsonb keys.
const MAX_EXTRA_FILTERS = 5;

@Injectable()
export class ItemSearchService {
  private facetsCache: { at: number; value: { mainGroup: { value: string; count: number }[]; subGroup: { value: string; count: number }[]; brand: { value: string; count: number }[] } } | null = null;
  private extraFieldsCache: { at: number; value: { key: string; count: number }[] } | null = null;
  // Per-field, unlike the two caches above — the value list for one extra
  // column is cheap to keep separately and there's no fixed set of fields
  // to pre-size a single cache slot for. Found via a stress test: this
  // endpoint was running its jsonb aggregation query on every single call,
  // 3-5x slower than every other facet-style endpoint, which are cached.
  private extraFacetCache = new Map<string, { at: number; value: { value: string; count: number }[] }>();

  constructor(
    @InjectRepository(ItemMasterRow) private rowRepo: Repository<ItemMasterRow>,
  ) {}

  /** Only current, non-deleted rows from published batches are ever visible. */
  private visibleRows(alias = 'row') {
    return this.rowRepo.createQueryBuilder(alias)
      .innerJoin(`${alias}.batch`, 'batch')
      .where(`${alias}.valid_to IS NULL`)
      .andWhere(`${alias}.is_deleted = false`)
      .andWhere("batch.status = 'published'");
  }

  async search(query: { q?: string, mainGroup?: string, subGroup?: string, brand?: string, extra?: Record<string, string>, limit?: number, offset?: number }) {
    const qb = this.visibleRows();

    // Trim before testing for emptiness: values pasted out of Excel or Tally
    // almost always carry leading/trailing whitespace, and an untrimmed
    // "  ABC123  " matches nothing at all.
    const term = query.q?.trim();
    if (term) {
      const like = `%${escapeLike(term)}%`;
      // Every ID-shaped field a user might type gets searched, not just the
      // one chosen as item_code for a given sheet layout. The three layouts
      // (SAP Item Master, Master Code, CP & Sani/Others) each pick a
      // different column as the "primary" identifier — sap_item_code,
      // alias, or a direct code column — so a code that's the primary
      // identifier in one file is a secondary field in another. Searching
      // all of them means the same query works regardless of which sheet
      // an item came from.
      qb.andWhere(new Brackets(sqb => {
        sqb.where("row.item_code ILIKE :q ESCAPE '\\'", { q: like })
           .orWhere("row.item_name ILIKE :q ESCAPE '\\'", { q: like })
           .orWhere("row.catalogue_no ILIKE :q ESCAPE '\\'", { q: like })
           .orWhere("row.brand ILIKE :q ESCAPE '\\'", { q: like })
           .orWhere("row.alias ILIKE :q ESCAPE '\\'", { q: like })
           .orWhere("row.sap_item_code ILIKE :q ESCAPE '\\'", { q: like })
           .orWhere("row.hsn_description ILIKE :q ESCAPE '\\'", { q: like });
      }));
    }

    const mainGroup = query.mainGroup?.trim();
    if (mainGroup) {
      qb.andWhere('row.main_group = :mainGroup', { mainGroup });
    }
    const subGroup = query.subGroup?.trim();
    if (subGroup) {
      qb.andWhere('row.sub_group = :subGroup', { subGroup });
    }
    const brand = query.brand?.trim();
    if (brand) {
      qb.andWhere('row.brand = :brand', { brand });
    }

    // Any field a user picked from "+ Add filter" — matched against
    // row.extra by its exact key, same exact-match semantics as the fixed
    // group/brand filters above.
    if (query.extra) {
      const pairs = Object.entries(query.extra)
        .map(([key, value]) => [key?.trim(), value?.trim()] as const)
        .filter(([key, value]) => key && value)
        .slice(0, MAX_EXTRA_FILTERS);
      pairs.forEach(([key, value], i) => {
        qb.andWhere(`row.extra ->> :extraKey${i} = :extraVal${i}`, { [`extraKey${i}`]: key, [`extraVal${i}`]: value });
      });
    }

    qb.orderBy('row.item_code', 'ASC');

    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const hits = await qb.clone().take(limit).skip(offset).getMany();
    // Last (or only) page is already fully known — skip the 300ms+ COUNT
    // over 177k rows. Full pages still need a total for the pager. An
    // offset past the end would otherwise report total === offset.
    let total = offset + hits.length;
    if (hits.length === limit || (offset > 0 && hits.length === 0)) {
      total = await qb.getCount();
    }

    return { total, hits };
  }

  clearFacetsCache() {
    this.facetsCache = null;
    this.extraFieldsCache = null;
    this.extraFacetCache.clear();
  }

  async getFacets() {
    if (this.facetsCache && Date.now() - this.facetsCache.at < 60_000) {
      return this.facetsCache.value;
    }
    // NOTE: each facet must use andWhere() for its IS NOT NULL condition.
    // QueryBuilder.where() REPLACES the whole existing WHERE clause, so an
    // earlier version of this silently dropped the current/published
    // filters and counted superseded rows — surfacing groups in the filter
    // dropdown that no longer exist in the visible data, which then
    // returned zero results when picked.
    const facet = async (column: string) => {
      const rows = await this.visibleRows()
        .select(`row.${column}`, 'value')
        .addSelect('COUNT(*)', 'count')
        .andWhere(`row.${column} IS NOT NULL`)
        .andWhere(`row.${column} <> ''`)
        .groupBy(`row.${column}`)
        .orderBy('count', 'DESC')
        .getRawMany();
      return rows.map((g) => ({ value: g.value, count: parseInt(g.count, 10) }));
    };

    const [mainGroup, subGroup, brand] = await Promise.all([
      facet('main_group'),
      facet('sub_group'),
      facet('brand'),
    ]);

    const value = { mainGroup, subGroup, brand };
    this.facetsCache = { at: Date.now(), value };
    return value;
  }

  /** Every column name currently present in at least one live row's
   *  `extra` — the source list for the "+ Add filter" picker. Cached the
   *  same way as getFacets(): this scans every live row's jsonb keys, which
   *  is too expensive to redo on every keystroke. */
  async getAvailableExtraFields() {
    if (this.extraFieldsCache && Date.now() - this.extraFieldsCache.at < 60_000) {
      return this.extraFieldsCache.value;
    }
    const rows: Array<{ key: string; count: string }> = await this.rowRepo.manager.query(`
      SELECT key, COUNT(*)::int AS count
        FROM item_master_row r
        JOIN item_master_batch b ON b.id = r.batch_id
        CROSS JOIN LATERAL jsonb_object_keys(r.extra) AS key
       WHERE r.valid_to IS NULL AND r.is_deleted = false AND b.status = 'published'
       GROUP BY key
       ORDER BY count DESC, key ASC
    `);
    const value = rows.map((r) => ({ key: r.key, count: Number(r.count) }));
    this.extraFieldsCache = { at: Date.now(), value };
    return value;
  }

  /** Distinct values (+counts) for one extra-column, for the dropdown once
   *  a field has been added as a filter. Same shape as getFacets()'s
   *  per-column facets, just keyed by an arbitrary jsonb key instead of a
   *  fixed column — the key is always bound as a parameter, never
   *  interpolated into the query text. */
  async getExtraFacet(field: string) {
    const key = field?.trim();
    if (!key) return [];

    const cached = this.extraFacetCache.get(key);
    if (cached && Date.now() - cached.at < 60_000) {
      return cached.value;
    }

    const rows = await this.visibleRows()
      .select('row.extra ->> :extraField', 'value')
      .addSelect('COUNT(*)', 'count')
      .andWhere('row.extra ? :extraField', { extraField: key })
      .groupBy('row.extra ->> :extraField')
      .orderBy('count', 'DESC')
      .setParameter('extraField', key)
      .getRawMany();
    const value = rows
      .filter((g) => g.value != null && g.value !== '')
      .map((g) => ({ value: g.value, count: parseInt(g.count, 10) }));
    // `field` is client-supplied and unvalidated against the real column
    // list — a buggy or malicious caller sending many distinct junk values
    // could otherwise grow this map without bound. Real usage only ever
    // touches however many columns an uploaded file actually has (a
    // few dozen at most), so this cap is never hit in practice.
    if (this.extraFacetCache.size >= 200) {
      this.extraFacetCache.clear();
    }
    this.extraFacetCache.set(key, { at: Date.now(), value });
    return value;
  }

  async getItemHistory(itemCode: string) {
    const code = itemCode?.trim();
    if (!code) return [];
    return this.rowRepo.createQueryBuilder('row')
      .innerJoin('row.batch', 'batch')
      .where('row.item_code = :code', { code })
      .andWhere("batch.status = 'published'")
      // is_deleted is NOT filtered here (unlike visibleRows()): a deleted
      // item's trail — including who removed it and when — should still
      // show in its own history, it just won't appear in search results.
      //
      // valid_to IS NULL (the live/most-recent version) must sort first:
      // two rows can share a valid_from, and the drawer treats history[0]
      // as current.
      .orderBy('CASE WHEN row.valid_to IS NULL THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('row.valid_from', 'DESC')
      .getMany();
  }

  /** Current live rows for a set of item codes — what the selection tray's
   *  "Copy details" and "Export to Excel" both act on (a single-item
   *  export from the drawer is just a one-code call to this). */
  async getCurrentRows(itemCodes: string[]) {
    const codes = [...new Set(itemCodes.map((c) => c?.trim()).filter((c): c is string => Boolean(c)))].slice(0, 200);
    if (codes.length === 0) return [];
    return this.visibleRows()
      .andWhere('row.item_code = ANY(:codes)', { codes })
      .orderBy('row.item_code', 'ASC')
      .getMany();
  }

  /** Same rows as getCurrentRows(), but with every row's `extra` padded out
   *  to the FULL set of extra fields known anywhere in the live catalog
   *  (blank string for any field this particular item has no value for).
   *  Copy/export must always show every column the sheet has — the head's
   *  explicit ask was "all the fields are important, no matter there's
   *  data or not" — so callers must never fall back to whatever keys
   *  happen to be present on the selected rows themselves. */
  async getCurrentRowsForExport(itemCodes: string[]) {
    const [rows, fields] = await Promise.all([
      this.getCurrentRows(itemCodes),
      this.getAvailableExtraFields(),
    ]);
    const allKeys = fields.map((f) => f.key);
    return rows.map((row) => ({
      ...row,
      extra: Object.fromEntries(allKeys.map((key) => [key, row.extra?.[key] ?? ''])),
    }));
  }

  /** Header row = the fixed fields every item has, plus the union of
   *  `extra` keys present across the given rows. Callers that want every
   *  known catalog column (not just what these rows happen to have) should
   *  pass rows from getCurrentRowsForExport(), which pre-pads them. */
  buildExportWorkbook(rows: ItemMasterRow[]): ExcelJS.Workbook {
    const extraKeys = [...new Set(rows.flatMap((r) => Object.keys(r.extra || {})))].sort();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Items');
    sheet.addRow([...EXPORT_FIXED_COLUMNS.map((c) => c.label), ...extraKeys]);
    for (const row of rows) {
      sheet.addRow([
        ...EXPORT_FIXED_COLUMNS.map((c) => (row[c.field] as string | null) ?? ''),
        ...extraKeys.map((key) => row.extra?.[key] ?? ''),
      ]);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((col) => { col.width = 20; });
    return workbook;
  }
}
