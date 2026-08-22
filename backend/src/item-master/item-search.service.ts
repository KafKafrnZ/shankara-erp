import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { ItemMasterRow } from './entities/item-master-row.entity';

// "%" and "_" are LIKE wildcards, and "\" is the escape character itself.
// Left unescaped, a search for "100%" matches every row that starts with
// "100" (and a bare "%" matches the entire catalog) — item names in a
// tile/sanitaryware catalog genuinely contain these characters, so a
// user's literal search has to stay literal.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

@Injectable()
export class ItemSearchService {
  private facetsCache: { at: number; value: { mainGroup: { value: string; count: number }[]; subGroup: { value: string; count: number }[]; brand: { value: string; count: number }[] } } | null = null;

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

  async search(query: { q?: string, mainGroup?: string, subGroup?: string, brand?: string, limit?: number, offset?: number }) {
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

  async getItemHistory(itemCode: string) {
    const code = itemCode?.trim();
    if (!code) return [];
    return this.rowRepo.createQueryBuilder('row')
      .innerJoin('row.batch', 'batch')
      .where('row.item_code = :code', { code })
      .andWhere('row.is_deleted = false')
      .andWhere("batch.status = 'published'")
      // valid_to IS NULL (the live version) must sort first: two rows can
      // share a valid_from, and the drawer treats history[0] as current.
      .orderBy('CASE WHEN row.valid_to IS NULL THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('row.valid_from', 'DESC')
      .getMany();
  }
}
