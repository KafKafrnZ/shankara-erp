import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth-user';

@Injectable()
export class MetaService {
  constructor(private readonly dataSource: DataSource) {}

  async listVchTypes(user: AuthUser): Promise<{ items: string[] }> {
    const params: unknown[] = [];
    let sql = `
      SELECT DISTINCT voucher.vch_type AS "vchType"
      FROM voucher
      JOIN ingest_batch ON voucher.batch_id = ingest_batch.id
      WHERE voucher.valid_to IS NULL
        AND voucher.is_deleted = false
        AND ingest_batch.status = 'published'
    `;
    if (user.role === 'branch') {
      sql += ` AND voucher.company_id = $1`;
      params.push(user.companyId);
    }
    sql += ` ORDER BY 1`;
    const rows = (await this.dataSource.query(sql, params)) as Array<{ vchType: string }>;
    return { items: rows.map((r) => r.vchType).filter(Boolean) };
  }

  async listCompanies(user: AuthUser): Promise<{ items: string[] }> {
    if (user.role === 'branch' && user.companyId) {
      return { items: [user.companyId] };
    }
    const rows = (await this.dataSource.query(
      `SELECT DISTINCT company_id AS "companyId" FROM ingest_batch WHERE company_id IS NOT NULL ORDER BY 1`,
    )) as Array<{ companyId: string }>;
    return { items: rows.map((r) => r.companyId).filter(Boolean) };
  }

  async getAsOf(user: any) {
    let query = `SELECT MAX(published_at) as "asOf", MAX(id) as "batchId" FROM ingest_batch WHERE status = 'published'`;
    const params: unknown[] = [];
    if (user.role === 'branch') {
      query += ` AND company_id = $1`;
      params.push(user.companyId);
    } else if (user.role === 'finance' && user.companyId) {
      query += ` AND company_id = $1`;
      params.push(user.companyId);
    }
    
    // The max() needs a bit more care to also get the matching batchId.
    // If there's a tie, highest ID wins.
    let fullQuery = `
      SELECT published_at as "asOf", id as "batchId"
      FROM ingest_batch
      WHERE status = 'published'
    `;
    if (user.role === 'branch' || (user.role === 'finance' && user.companyId)) {
      fullQuery += ` AND company_id = $1`;
    }
    fullQuery += ` ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1`;
    
    const res = await this.dataSource.query(fullQuery, params);
    if (res.length === 0) {
      return { asOf: null, batchId: null };
    }
    return {
      asOf: res[0].asOf ? new Date(res[0].asOf).toISOString() : null,
      batchId: Number(res[0].batchId),
    };
  }
}
