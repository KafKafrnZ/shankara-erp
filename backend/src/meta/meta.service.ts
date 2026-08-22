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

  async getLiveSources(user: AuthUser) {
    const companyScoped =
      user.role === 'branch' || (user.role === 'finance' && Boolean(user.companyId));
    const voucherParams: unknown[] = companyScoped ? [user.companyId] : [];
    const voucherCompanySql = companyScoped ? ` AND b.company_id = $1` : '';

    // Only batches that currently contribute a live row. A published file
    // whose every code/bill was later superseded would otherwise show up
    // as "what you're searching" while search returns none of it.
    const itemLiveSql = `
      SELECT
        b.id AS "batchId",
        sf.original_name AS "originalName",
        b.published_at AS "publishedAt",
        COUNT(*)::int AS "liveRows"
      FROM item_master_batch b
      JOIN source_file sf ON sf.id = b.source_file_id
      JOIN item_master_row r ON r.batch_id = b.id
      WHERE b.status = 'published'
        AND r.valid_to IS NULL
        AND r.is_deleted = false
      GROUP BY b.id, sf.original_name, b.published_at
      ORDER BY b.published_at DESC NULLS LAST, b.id DESC
    `;

    const voucherLiveSql = `
      SELECT
        b.id AS "batchId",
        sf.original_name AS "originalName",
        b.published_at AS "publishedAt",
        b.company_id AS "companyId",
        b.period_from AS "periodFrom",
        b.period_to AS "periodTo",
        COUNT(*)::int AS "liveRows"
      FROM ingest_batch b
      JOIN source_file sf ON sf.id = b.source_file_id
      JOIN voucher v ON v.batch_id = b.id
      WHERE b.status = 'published'
        AND v.valid_to IS NULL
        AND v.is_deleted = false
        ${voucherCompanySql}
      GROUP BY b.id, sf.original_name, b.published_at, b.company_id, b.period_from, b.period_to
      ORDER BY b.published_at DESC NULLS LAST, b.id DESC
    `;

    const [itemLive, voucherLive] = await Promise.all([
      this.dataSource.query(itemLiveSql),
      this.dataSource.query(voucherLiveSql, voucherParams),
    ]);

    let itemPending: Array<Record<string, unknown>> = [];
    let voucherPending: Array<Record<string, unknown>> = [];
    if (user.role === 'steward') {
      const pendingItemSql = `
        SELECT
          b.id AS "batchId",
          sf.original_name AS "originalName",
          b.status AS status,
          b.accepted_rows AS "acceptedRows",
          b.uploaded_at AS "uploadedAt"
        FROM item_master_batch b
        JOIN source_file sf ON sf.id = b.source_file_id
        WHERE b.status IN ('held', 'processing')
        ORDER BY b.uploaded_at DESC
        LIMIT 20
      `;
      const pendingVoucherSql = `
        SELECT
          b.id AS "batchId",
          sf.original_name AS "originalName",
          b.status AS status,
          b.accepted_rows AS "acceptedRows",
          b.uploaded_at AS "uploadedAt",
          b.company_id AS "companyId"
        FROM ingest_batch b
        JOIN source_file sf ON sf.id = b.source_file_id
        WHERE b.status = 'held'
        ORDER BY b.uploaded_at DESC
        LIMIT 20
      `;
      [itemPending, voucherPending] = await Promise.all([
        this.dataSource.query(pendingItemSql),
        this.dataSource.query(pendingVoucherSql),
      ]);
    }

    return {
      items: {
        live: itemLive.map(mapItemLive),
        pending: itemPending.map(mapPending),
      },
      vouchers: {
        live: voucherLive.map(mapVoucherLive),
        pending: voucherPending.map(mapPending),
      },
    };
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

function iso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ymd(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function mapItemLive(row: {
  batchId: unknown;
  originalName: unknown;
  publishedAt: unknown;
  liveRows: unknown;
}) {
  return {
    batchId: Number(row.batchId),
    originalName: String(row.originalName || ''),
    publishedAt: iso(row.publishedAt),
    liveRows: Number(row.liveRows) || 0,
  };
}

function mapVoucherLive(row: {
  batchId: unknown;
  originalName: unknown;
  publishedAt: unknown;
  companyId: unknown;
  periodFrom: unknown;
  periodTo: unknown;
  liveRows: unknown;
}) {
  return {
    batchId: Number(row.batchId),
    originalName: String(row.originalName || ''),
    publishedAt: iso(row.publishedAt),
    companyId: row.companyId ? String(row.companyId) : null,
    periodFrom: ymd(row.periodFrom),
    periodTo: ymd(row.periodTo),
    liveRows: Number(row.liveRows) || 0,
  };
}

function mapPending(row: {
  batchId: unknown;
  originalName: unknown;
  status: unknown;
  acceptedRows: unknown;
  uploadedAt: unknown;
  companyId?: unknown;
}) {
  return {
    batchId: Number(row.batchId),
    originalName: String(row.originalName || ''),
    status: String(row.status || ''),
    acceptedRows: Number(row.acceptedRows) || 0,
    uploadedAt: iso(row.uploadedAt),
    companyId: row.companyId ? String(row.companyId) : undefined,
  };
}
