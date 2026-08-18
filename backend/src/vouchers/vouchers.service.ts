import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class VouchersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async getVoucher(id: number, user: any, versionAll: boolean, ip?: string, userAgent?: string) {
    let query = `
      SELECT v.*, b.status as batch_status, b.published_at as published_at, b.source_file_id as source_file_id
      FROM voucher v
      JOIN ingest_batch b ON v.batch_id = b.id
      WHERE v.id = $1
    `;
    const params = [id];

    const res = await this.dataSource.query(query, params);
    if (res.length === 0) {
      throw new NotFoundException('Voucher not found');
    }
    const row = res[0];

    // Visibility rules
    // Branch and company_id !== user.companyId -> 404 (not 403)
    if (user.role === 'branch' && row.company_id !== user.companyId) {
      throw new NotFoundException('Voucher not found');
    }

    // Current + unpublished batch -> 404
    if (row.valid_to === null && row.batch_status !== 'published') {
      throw new NotFoundException('Voucher not found');
    }

    // Superseded
    if (row.valid_to !== null) {
      if (user.role !== 'steward' || !versionAll) {
        throw new NotFoundException('Voucher not found');
      }
    }

    // Lines
    const linesRes = await this.dataSource.query(
      `SELECT * FROM voucher_line WHERE voucher_id = $1 ORDER BY line_no ASC`,
      [id]
    );

    // Source file
    const sfRes = await this.dataSource.query(
      `SELECT * FROM source_file WHERE id = $1`,
      [row.source_file_id]
    );

    const sourceFile = sfRes[0];

    await this.auditService.log({
      userId: user.id, action: 'voucher_open', entityType: 'voucher', entityId: id, ip, userAgent, meta: {}
    });

    return {
      id: Number(row.id),
      vchNo: row.vch_no,
      vchNoNorm: row.vch_no_norm,
      vchType: row.vch_type,
      vchDate: row.vch_date && typeof row.vch_date !== 'string' ? row.vch_date.toISOString().split('T')[0] : row.vch_date,
      partyName: row.party_name,
      totalAmount: row.total_amount,
      narration: row.narration,
      companyId: row.company_id,
      lines: linesRes.map((l: any) => ({
        lineNo: l.line_no,
        ledgerName: l.ledger_name,
        debit: l.debit,
        credit: l.credit,
      })),
      source: {
        batchId: Number(row.batch_id),
        fileName: sourceFile?.original_name,
        sha256: sourceFile?.sha256,
        sourceRowNo: row.source_row_no,
        publishedAt: row.published_at ? row.published_at.toISOString() : null,
      }
    };
  }
}
