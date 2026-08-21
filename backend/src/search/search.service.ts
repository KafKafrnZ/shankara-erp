import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchDto } from './dto/search.dto';
import { normalizeVchNo } from '../ingest/parse/vch-no';
import { parseIndianAmount } from '../ingest/parse/amount';
import { AuditService } from '../audit/audit.service';
import { VOUCHER_INDEX_TOKEN } from '../search-index/search-index.interface';
import type { VoucherIndex } from '../search-index/search-index.interface';

@Injectable()
export class SearchService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    @Inject(VOUCHER_INDEX_TOKEN) private readonly indexer: VoucherIndex,
  ) {}

  async search(dto: SearchDto, user: any, ip?: string, userAgent?: string) {
    if (!dto.q) {
      return this.searchSql(dto, user, ip, userAgent);
    }

    try {
      const res = await this.indexer.searchCandidates(dto.q, { size: 50 });
      const pgIds = (res.ids || []).map(String).filter((id) => /^\d+$/.test(id));
      if (pgIds.length === 0) {
        const asOf = await this.getAsOf(user);
        await this.auditService.log({
          userId: user.id, action: 'search', ip, userAgent, meta: { q: dto.q, total: 0, backend: 'os' }
        });
        return { asOf, total: 0, hits: [] };
      }
      return await this.searchSql(dto, user, ip, userAgent, pgIds);
    } catch {
      return this.searchSql(dto, user, ip, userAgent);
    }
  }

  private async getAsOf(user: any): Promise<string | null> {
    let asOfQuery = `SELECT MAX(published_at) as "asOf" FROM ingest_batch WHERE status = 'published'`;
    const asOfParams: any[] = [];
    if (user.role === 'branch') {
      asOfQuery += ` AND company_id = $1`;
      asOfParams.push(user.companyId);
    } else if (user.role === 'finance' && user.companyId) {
      asOfQuery += ` AND company_id = $1`;
      asOfParams.push(user.companyId);
    }
    const asOfRes = await this.dataSource.query(asOfQuery, asOfParams);
    return asOfRes[0]?.asOf ? new Date(asOfRes[0].asOf).toISOString() : null;
  }

  async searchSql(dto: SearchDto, user: any, ip?: string, userAgent?: string, osIds?: string[]) {
    let whereSql = `voucher.valid_to IS NULL AND voucher.is_deleted = false AND ingest_batch.status = 'published'`;
    const params: any[] = [];
    let paramIdx = 1;

    if (user.role === 'branch') {
      whereSql += ` AND voucher.company_id = $${paramIdx++}`;
      params.push(user.companyId);
    } else if (user.role === 'finance' && user.companyId) {
      whereSql += ` AND voucher.company_id = $${paramIdx++}`;
      params.push(user.companyId);
    }

    if (dto.from) {
      whereSql += ` AND voucher.vch_date >= $${paramIdx++}`;
      params.push(dto.from);
    }
    if (dto.to) {
      whereSql += ` AND voucher.vch_date <= $${paramIdx++}`;
      params.push(dto.to);
    }
    if (dto.vchType) {
      whereSql += ` AND voucher.vch_type ILIKE $${paramIdx++}`;
      params.push(dto.vchType);
    }

    let rankSql = '';
    let exactNormForRank: string | null = null;
    if (dto.q) {
      const signals: string[] = [];
      const norm = normalizeVchNo(dto.q);
      if (norm.length >= 1 && (/\d/.test(dto.q) || dto.q.includes('/') || dto.q.includes('-'))) {
        // LIKE prefix and exact rank must be different binds (`invsr1` ≠ `invsr1%`).
        signals.push(`voucher.vch_no_norm LIKE $${paramIdx}`);
        params.push(`${norm}%`);
        paramIdx++;
        exactNormForRank = norm;
      }

      const amt = parseIndianAmount(dto.q);
      if (amt !== null) {
        signals.push(`voucher.total_amount = $${paramIdx}::numeric`);
        params.push(amt);
        rankSql += `(voucher.total_amount = $${paramIdx}::numeric) DESC, `;
        paramIdx++;
      }

      signals.push(`voucher.party_name ILIKE $${paramIdx}`);
      signals.push(`voucher.narration ILIKE $${paramIdx}`);
      signals.push(`voucher.vch_no ILIKE $${paramIdx}`);
      params.push(`%${dto.q}%`);
      rankSql += `(voucher.party_name ILIKE $${paramIdx}) DESC, `;
      paramIdx++;

      if (signals.length > 0 && !osIds) {
        whereSql += ` AND (${signals.join(' OR ')})`;
      }
    }

    if (osIds && osIds.length > 0) {
      // Bound IN-list, not ANY($n::bigint[]) — node-pg array bind 500s, and
      // non-numeric OS _ids (e.g. s19stale) are invalid for voucher.id.
      const placeholders = osIds.map(() => `$${paramIdx++}`).join(', ');
      whereSql += ` AND voucher.id IN (${placeholders})`;
      params.push(...osIds);
    }

    // Rank-only binds are unused in COUNT (42P18). Tie them as text no-ops.
    const dummyRef = params.map((_, i) => ` AND $${i + 1}::text = $${i + 1}::text`).join('');
    const countQuery = `
      SELECT COUNT(voucher.id) as total
      FROM voucher
      JOIN ingest_batch ON voucher.batch_id = ingest_batch.id
      WHERE ${whereSql} ${dummyRef}
    `;
    const countRes = await this.dataSource.query(countQuery, params);
    const total = Number(countRes[0].total);

    if (exactNormForRank !== null) {
      rankSql = `(voucher.vch_no_norm = $${paramIdx}) DESC, ` + rankSql;
      params.push(exactNormForRank);
      paramIdx++;
    }
    rankSql += `voucher.vch_date DESC, voucher.id DESC`;

    const limit = dto.limit ?? 20;
    const offset = dto.offset ?? 0;
    const limitIdx = paramIdx++;
    const offsetIdx = paramIdx++;
    params.push(limit, offset);

    const dataQuery = `
      SELECT 
        voucher.id, voucher.vch_no as "vchNo", voucher.vch_type as "vchType", 
        voucher.vch_date as "vchDate", voucher.party_name as "partyName", 
        voucher.total_amount as "totalAmount", voucher.narration, 
        voucher.company_id as "companyId"
      FROM voucher
      JOIN ingest_batch ON voucher.batch_id = ingest_batch.id
      WHERE ${whereSql}
      ORDER BY ${rankSql}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const hits = await this.dataSource.query(dataQuery, params);

    hits.forEach((h: any) => {
      if (h.vchDate && typeof h.vchDate !== 'string') {
        const d = h.vchDate;
        h.vchDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    });

    const asOf = await this.getAsOf(user);

    await this.auditService.log({
      userId: user.id, action: 'search', ip, userAgent, meta: { q: dto.q, total, backend: osIds ? 'os' : 'sql' }
    });

    return {
      asOf,
      total,
      hits,
    };
  }
}
