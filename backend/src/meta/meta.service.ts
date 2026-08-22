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
    const params: unknown[] = [];
    const companyScoped =
      user.role === 'branch' || (user.role === 'finance' && user.companyId);
    if (companyScoped) {
      params.push(user.companyId);
    }

    // If a tie, highest ID wins.
    let voucherQuery = `
      SELECT published_at as "asOf", id as "batchId"
      FROM ingest_batch
      WHERE status = 'published'
    `;
    if (companyScoped) {
      voucherQuery += ` AND company_id = $1`;
    }
    voucherQuery += ` ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1`;

    // The catalog is the other half of this system and is not company-scoped
    // (item_master_batch has no company_id). Without it the header read
    // "No published data" while the catalog was serving 170k+ published
    // items — a flat contradiction for anyone looking at the screen.
    const catalogQuery = `
      SELECT published_at as "asOf", id as "batchId"
      FROM item_master_batch
      WHERE status = 'published'
      ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1
    `;

    const [voucherRes, catalogRes] = await Promise.all([
      this.dataSource.query(voucherQuery, params),
      this.dataSource.query(catalogQuery),
    ]);

    const candidates = [voucherRes[0], catalogRes[0]]
      .filter((r) => r && r.asOf)
      .map((r) => ({ asOf: new Date(r.asOf), batchId: Number(r.batchId) }));

    if (candidates.length === 0) {
      return { asOf: null, batchId: null };
    }

    const latest = candidates.reduce((a, b) => (b.asOf > a.asOf ? b : a));
    return { asOf: latest.asOf.toISOString(), batchId: latest.batchId };
  }
}
