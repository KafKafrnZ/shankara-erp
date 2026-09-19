import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth-user';

@Injectable()
export class MetaService {
  constructor(private readonly dataSource: DataSource) {}

  async getLiveSources(_user: AuthUser) {
    // Only batches that currently contribute a live row. A published file
    // whose every code was later superseded would otherwise show up as
    // "what you're searching" while search returns none of it.
    const itemLiveSql = `
      SELECT
        b.id AS "batchId",
        COALESCE(sf.original_name, 'Manual edit') AS "originalName",
        b.published_at AS "publishedAt",
        COUNT(*)::int AS "liveRows"
      FROM item_master_batch b
      LEFT JOIN source_file sf ON sf.id = b.source_file_id
      JOIN item_master_row r ON r.batch_id = b.id
      WHERE b.status = 'published'
        AND r.valid_to IS NULL
        AND r.is_deleted = false
      GROUP BY b.id, sf.original_name, b.published_at
      ORDER BY b.published_at DESC NULLS LAST, b.id DESC
    `;

    const itemLive = await this.dataSource.query(itemLiveSql);

    const pendingItemSql = `
      SELECT
        b.id AS "batchId",
        COALESCE(sf.original_name, 'Manual edit') AS "originalName",
        b.status AS status,
        b.accepted_rows AS "acceptedRows",
        b.uploaded_at AS "uploadedAt"
      FROM item_master_batch b
      LEFT JOIN source_file sf ON sf.id = b.source_file_id
      WHERE b.status IN ('held', 'processing')
      ORDER BY b.uploaded_at DESC
      LIMIT 20
    `;
    const itemPending: Array<Record<string, unknown>> =
      await this.dataSource.query(pendingItemSql);

    return {
      items: {
        live: itemLive.map(mapItemLive),
        pending: itemPending.map(mapPending),
      },
    };
  }

  async getAsOf(_user: AuthUser) {
    const catalogQuery = `
      SELECT published_at as "asOf", id as "batchId"
      FROM item_master_batch
      WHERE status = 'published'
      ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1
    `;
    const rows = await this.dataSource.query(catalogQuery);
    const row = rows[0];
    if (!row || !row.asOf) {
      return { asOf: null, batchId: null };
    }
    return { asOf: iso(row.asOf), batchId: Number(row.batchId) };
  }
}

function iso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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

function mapPending(row: {
  batchId: unknown;
  originalName: unknown;
  status: unknown;
  acceptedRows: unknown;
  uploadedAt: unknown;
}) {
  return {
    batchId: Number(row.batchId),
    originalName: String(row.originalName || ''),
    status: String(row.status || ''),
    acceptedRows: Number(row.acceptedRows) || 0,
    uploadedAt: iso(row.uploadedAt),
  };
}
