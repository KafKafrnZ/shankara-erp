import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchDto } from './dto/search.dto';
import { normalizeVchNo } from '../ingest/parse/vch-no';
import { parseIndianAmount } from '../ingest/parse/amount';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async search(dto: SearchDto, user: any, ip?: string, userAgent?: string) {
    let whereSql = `voucher.valid_to IS NULL AND voucher.is_deleted = false AND ingest_batch.status = 'published'`;
    const params: any[] = [];
    let paramIdx = 1;

    if (user.role === 'branch') {
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

    let qSql = '';
    let rankSql = '';
    if (dto.q) {
      const signals: string[] = [];
      const norm = normalizeVchNo(dto.q);
      if (norm.length >= 1 && (/\d/.test(dto.q) || dto.q.includes('/') || dto.q.includes('-'))) {
        signals.push(`voucher.vch_no_norm LIKE $${paramIdx}`);
        params.push(`${norm}%`);
        rankSql += `(voucher.vch_no_norm = $${paramIdx}) DESC, `;
        paramIdx++;
      }

      const amt = parseIndianAmount(dto.q);
      if (amt !== null) {
        signals.push(`voucher.total_amount = $${paramIdx}::numeric`);
        params.push(amt);
        rankSql += `(voucher.total_amount = $${paramIdx}::numeric) DESC, `;
        paramIdx++;
      }

      // Always OR ILIKE so a q with digits (e.g. "Synth Party 10000") still hits party/narration.
      signals.push(`voucher.party_name ILIKE $${paramIdx}`);
      signals.push(`voucher.narration ILIKE $${paramIdx}`);
      signals.push(`voucher.vch_no ILIKE $${paramIdx}`);
      params.push(`%${dto.q}%`);
      rankSql += `(voucher.party_name ILIKE $${paramIdx}) DESC, `;
      paramIdx++;

      if (signals.length > 0) {
        whereSql += ` AND (${signals.join(' OR ')})`;
      }
    }

    rankSql += `voucher.vch_date DESC, voucher.id DESC`;

    const countQuery = `
      SELECT COUNT(voucher.id) as total
      FROM voucher
      JOIN ingest_batch ON voucher.batch_id = ingest_batch.id
      WHERE ${whereSql}
    `;
    const countRes = await this.dataSource.query(countQuery, params);
    const total = Number(countRes[0].total);

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

    // Determine asOf (MAX published_at)
    let asOfQuery = `SELECT MAX(published_at) as "asOf" FROM ingest_batch WHERE status = 'published'`;
    let asOfParams: unknown[] = [];
    if (user.role === 'branch') {
      asOfQuery += ` AND company_id = $1`;
      asOfParams.push(user.companyId);
    }
    const asOfRes = await this.dataSource.query(asOfQuery, asOfParams);
    const asOf = asOfRes[0]?.asOf ? new Date(asOfRes[0].asOf).toISOString() : null;

    await this.auditService.log({
      userId: user.id, action: 'search', ip, userAgent, meta: { q: dto.q, total }
    });

    return {
      asOf,
      total,
      hits,
    };
  }
}
