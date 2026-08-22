import { Injectable, Inject, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { SourceFile } from './entities/source-file.entity';
import { IngestBatch } from './entities/ingest-batch.entity';
import { Voucher } from './entities/voucher.entity';
import { VoucherLine } from './entities/voucher-line.entity';
import { IngestReject } from './entities/ingest-reject.entity';
import { MasterLedger } from './entities/master-ledger.entity';
import { OBJECT_STORE } from '../storage/object-store';
import type { ObjectStore } from '../storage/object-store';
import { AuditService } from '../audit/audit.service';
import { UploadDto } from './dto/upload.dto';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDayBookStream } from './parse/daybook.parser';
import { validateDayBook } from './validate/daybook.validator';
import { parseSalesRegister } from './parse/sales-register.parser';
import { detectReport } from './detect/report.detector';
import { VOUCHER_INDEX_TOKEN, IndexedVoucher } from '../search-index/search-index.interface';
import type { VoucherIndex } from '../search-index/search-index.interface';
import { getCompanyName } from '../search-index/company-name';
import { formatCents, parseAmountToCents } from './parse/money';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    @InjectRepository(SourceFile)
    private sourceFileRepo: Repository<SourceFile>,
    @InjectRepository(IngestBatch)
    private ingestBatchRepo: Repository<IngestBatch>,
    @InjectRepository(Voucher)
    private voucherRepo: Repository<Voucher>,
    @InjectRepository(VoucherLine)
    private voucherLineRepo: Repository<VoucherLine>,
    @InjectRepository(IngestReject)
    private ingestRejectRepo: Repository<IngestReject>,
    @InjectRepository(MasterLedger)
    private masterLedgerRepo: Repository<MasterLedger>,
    @Inject(OBJECT_STORE)
    private objectStore: ObjectStore,
    private auditService: AuditService,
    private dataSource: DataSource,
    @Inject(VOUCHER_INDEX_TOKEN)
    private readonly indexer: VoucherIndex,
  ) {}

  async processUpload(
    file: any,
    dto: UploadDto,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (ext === '.zip') {
      throw new BadRequestException(
        'Please unzip the file first and upload the Excel or CSV inside. A .zip cannot be read as a day book.',
      );
    }
    if (!validExtensions.includes(ext)) throw new BadRequestException('Invalid file extension');

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    let rejectedReuse: IngestBatch | null = null;
    let sourceFile = await this.sourceFileRepo.findOne({ where: { sha256 } });
    if (sourceFile) {
      const existingBatch = await this.ingestBatchRepo.findOne({
        where: { fileSha256: sha256 },
        order: { uploadedAt: 'DESC' },
      });
      if (existingBatch) {
        if (existingBatch.status === 'rejected') {
          rejectedReuse = existingBatch;
        } else {
          await this.auditService.log({
            userId, action: 'upload', entityType: 'ingest_batch', entityId: existingBatch.id, ip, userAgent, meta: { sha256, duplicate: true },
          });

          return {
            batchId: Number(existingBatch.id),
            status: 'duplicate',
            duplicate: true,
            sha256,
            originalName: sourceFile.originalName,
            bytes: Number(sourceFile.byteSize),
          };
        }
      }
      // source_file is shared across both pipelines (voucher and item
      // master), so a hit here with no matching ingest_batch means these
      // bytes were uploaded through the OTHER pipeline, not this one —
      // it isn't a real duplicate from the voucher side. Fall through and
      // process it as a fresh voucher batch, reusing the existing
      // source_file/object-store entry rather than re-uploading the bytes.
    }

    const storageKey = sourceFile ? sourceFile.storageKey : (await this.objectStore.put(sha256, file.buffer, file.mimetype)).key;

    // fetch from object store
    const storedStream = await this.objectStore.get(storageKey);
    if (!storedStream) {
      throw new BadRequestException('Failed to retrieve file from storage');
    }

    const parsedResult = await parseDayBookStream(storedStream, ext);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (!sourceFile) {
        sourceFile = this.sourceFileRepo.create({
          sha256, storageKey, originalName: file.originalname,
          byteSize: file.buffer.length.toString(), contentType: file.mimetype, uploadedBy: userId,
        });
        await queryRunner.manager.save(sourceFile);
      }

      let batch: IngestBatch;
      if (rejectedReuse) {
        await queryRunner.manager.query(
          `DELETE FROM voucher_line WHERE voucher_id IN (SELECT id FROM voucher WHERE batch_id = $1)`,
          [rejectedReuse.id],
        );
        await queryRunner.manager.query(`DELETE FROM voucher WHERE batch_id = $1`, [rejectedReuse.id]);
        await queryRunner.manager.query(`DELETE FROM ingest_reject WHERE batch_id = $1`, [rejectedReuse.id]);
        batch = rejectedReuse;
        batch.tallyCompany = (parsedResult.detect as any).titleCompany || 'unknown';
        batch.companyId = dto.companyId;
        batch.branchId = dto.branchId ?? null;
        batch.reportType = parsedResult.detect.ok && (parsedResult.detect as any).reportType === 'SALES_REGISTER' ? 'SALES_REGISTER' : 'DAY_BOOK';
        batch.periodFrom = (parsedResult.detect as any).periodFrom ? new Date((parsedResult.detect as any).periodFrom) : null;
        batch.periodTo = (parsedResult.detect as any).periodTo ? new Date((parsedResult.detect as any).periodTo) : null;
        batch.status = 'held';
        batch.uploadedBy = userId;
        batch.errorSummary = null;
        batch.publishedAt = null;
        batch.publishedBy = null;
        await queryRunner.manager.save(batch);
      } else {
        // Steward is a global role (seed company_id is null) and may set any companyId.
        batch = this.ingestBatchRepo.create({
          sourceFileId: sourceFile.id, fileSha256: sha256,
          tallyCompany: (parsedResult.detect as any).titleCompany || 'unknown',
          companyId: dto.companyId, branchId: dto.branchId,
          reportType: parsedResult.detect.ok && (parsedResult.detect as any).reportType === 'SALES_REGISTER' ? 'SALES_REGISTER' : 'DAY_BOOK',
          periodFrom: (parsedResult.detect as any).periodFrom ? new Date((parsedResult.detect as any).periodFrom) : null,
          periodTo: (parsedResult.detect as any).periodTo ? new Date((parsedResult.detect as any).periodTo) : null,
          status: 'held', uploadedBy: userId,
          errorSummary: null,
        });
        await queryRunner.manager.save(batch);
      }

      if (!parsedResult.detect.ok) {
        batch.status = 'rejected';
        batch.errorSummary = 'UNRECOGNIZED_LAYOUT';
        await queryRunner.manager.save(batch);
        await this.auditService.log({
          userId, action: 'upload', entityType: 'ingest_batch', entityId: batch.id, ip, userAgent, meta: { sha256: sourceFile.sha256, duplicate: false }
        }, queryRunner.manager);
        await queryRunner.commitTransaction();
        return this.finishUpload(batch, sourceFile, userId, ip, userAgent);
      }

      const expectedCompany = (process.env.EXPECTED_TALLY_COMPANY_SUBSTR || 'shankara').toLowerCase();
      if (!batch.tallyCompany.toLowerCase().includes(expectedCompany)) {
        batch.status = 'rejected';
        batch.errorSummary = 'COMPANY_MISMATCH';
        await queryRunner.manager.save(batch);
        await this.auditService.log({
          userId, action: 'upload', entityType: 'ingest_batch', entityId: batch.id, ip, userAgent, meta: { sha256: sourceFile.sha256, duplicate: false }
        }, queryRunner.manager);
        await queryRunner.commitTransaction();
        return this.finishUpload(batch, sourceFile, userId, ip, userAgent);
      }

      const validated = validateDayBook(parsedResult);
      if (validated.vouchers.length === 0) {
        batch.status = 'rejected';
        batch.errorSummary = 'ZERO_VOUCHERS';
      }

      let totalLines = 0;
      let dSumCents = 0n;
      let cSumCents = 0n;

      for (const rej of validated.rejects) {
        await queryRunner.manager.save(this.ingestRejectRepo.create({
          batchId: batch.id,
          sourceRowNo: rej.sourceRowNo,
          code: rej.code,
          message: rej.message,
          raw: rej.raw || {},
        }));
      }

      if (batch.status !== 'rejected') {
        const uniqueLedgers = new Set<string>();
        for (const v of validated.vouchers) {
          totalLines += v.lines.length;
          
          for (const line of v.lines) {
            dSumCents += BigInt(line.debit.replace('.', ''));
            cSumCents += BigInt(line.credit.replace('.', ''));
            uniqueLedgers.add(line.ledgerName);
          }

          const fpObj = {
            lines: v.lines.map(l => ({ credit: l.credit, debit: l.debit, ledgerName: l.ledgerName })),
            narration: v.narration,
            partyName: v.partyName,
            totalAmount: v.totalAmount,
            vchDate: v.vchDate,
            vchNo: v.vchNo,
            vchType: v.vchType,
          };
          const fpString = JSON.stringify(fpObj);
          const fingerprint = crypto.createHash('sha256').update(fpString).digest('hex');

          let tallyGuid = crypto.createHash('sha256').update(`${dto.companyId}:${v.vchType}:${v.vchNo}:${v.vchDate}`).digest('hex');

          const currentVoucher = await queryRunner.manager
            .createQueryBuilder(Voucher, 'v')
            .innerJoin('v.batch', 'b')
            .where('v.company_id = :companyId', { companyId: dto.companyId })
            .andWhere('v.vch_type = :vchType', { vchType: v.vchType })
            .andWhere('v.vch_no = :vchNo', { vchNo: v.vchNo })
            .andWhere('v.vch_date = :vchDate', { vchDate: v.vchDate })
            .andWhere('v.valid_to IS NULL')
            .andWhere('v.is_deleted = false')
            .andWhere("b.status = 'published'")
            .getOne();

          if (currentVoucher) {
            tallyGuid = currentVoucher.tallyGuid || tallyGuid;
            if (currentVoucher.extra.fingerprint === fingerprint) {
              continue;
            }
          }

          const newVoucher = this.voucherRepo.create({
            batchId: batch.id,
            companyId: dto.companyId,
            branchId: dto.branchId,
            tallyGuid,
            vchNo: v.vchNo,
            vchNoNorm: v.vchNoNorm,
            vchType: v.vchType,
            vchDate: v.vchDate,
            partyName: v.partyName,
            totalAmount: v.totalAmount,
            narration: v.narration,
            sourceRowNo: v.sourceRowNo,
            extra: { ...v.extra, fingerprint },
            lines: v.lines.map(l => this.voucherLineRepo.create({
              lineNo: l.lineNo,
              ledgerName: l.ledgerName,
              debit: l.debit,
              credit: l.credit,
              extra: l.extra,
            })),
          });
          await queryRunner.manager.save(newVoucher);
        }

        for (const ledgerName of uniqueLedgers) {
          await queryRunner.manager.query(
            `INSERT INTO master_ledger (company_id, ledger_name, is_party, extra)
             VALUES ($1, $2, false, '{}')
             ON CONFLICT (company_id, ledger_name) DO NOTHING`,
            [dto.companyId, ledgerName]
          );
        }
      }

      batch.totalRows = totalLines;
      batch.acceptedRows = validated.vouchers.length;
      batch.rejectedRows = validated.rejects.length;

      batch.debitSum = dSumCents > 0n ? formatCents(dSumCents) : '0.00';
      batch.creditSum = cSumCents > 0n ? formatCents(cSumCents) : '0.00';
      
      const tolCents = parseAmountToCents(process.env.DEBIT_CREDIT_TOLERANCE || '0.01') ?? 1n;
      const diff = dSumCents - cSumCents;
      const absDiff = diff < 0n ? -diff : diff;

      if (absDiff > tolCents && batch.status !== 'rejected') {
        batch.errorSummary = `OUT_OF_BALANCE: debit=${batch.debitSum} credit=${batch.creditSum}`;
      }

      await queryRunner.manager.save(batch);

      await this.auditService.log({
        userId, action: 'upload', entityType: 'ingest_batch', entityId: batch.id, ip, userAgent, meta: { sha256: sourceFile.sha256, duplicate: false }
      }, queryRunner.manager);

      await queryRunner.commitTransaction();
      return this.finishUpload(batch, sourceFile, userId, ip, userAgent);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as any).code) : '';
      if (code === '23505') {
        throw new BadRequestException('Concurrent upload or duplicate constraint violation.');
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async finishUpload(batch: any, file: any, userId: string, ip: any, agent: any) {
    return {
      batchId: Number(batch.id),
      status: batch.status,
      duplicate: false,
      sha256: file.sha256,
      originalName: file.originalName,
      bytes: Number(file.byteSize),
      errorSummary: batch.errorSummary || undefined,
    };
  }

  async getBatch(id: number, user?: any) {
    const batch = await this.ingestBatchRepo.findOne({ where: { id: String(id) } });
    if (!batch) throw new NotFoundException();
    if (user && user.role === 'finance' && batch.status === 'held') {
      throw new NotFoundException();
    }
    return {
      id: Number(batch.id),
      status: batch.status,
      companyId: batch.companyId,
      tallyCompany: batch.tallyCompany,
      periodFrom: batch.periodFrom ? (typeof batch.periodFrom === 'string' ? batch.periodFrom : batch.periodFrom.toISOString().split('T')[0]) : null,
      periodTo: batch.periodTo ? (typeof batch.periodTo === 'string' ? batch.periodTo : batch.periodTo.toISOString().split('T')[0]) : null,
      totalRows: batch.totalRows,
      acceptedRows: batch.acceptedRows,
      rejectedRows: batch.rejectedRows,
      debitSum: batch.debitSum,
      creditSum: batch.creditSum,
      errorSummary: batch.errorSummary,
      publishedAt: batch.publishedAt,
      sha256: batch.fileSha256,
    };
  }

  async getBatchRejects(id: number, page: number, pageSize: number) {
    const [items, total] = await this.ingestRejectRepo.findAndCount({
      where: { batchId: String(id) },
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { sourceRowNo: 'ASC' }
    });
    return {
      items: items.map(i => ({
        sourceRowNo: i.sourceRowNo,
        code: i.code,
        message: i.message,
        raw: i.raw,
      })),
      total,
    };
  }

  async publishBatch(batchId: number, userId: string, ip?: string, userAgent?: string) {
    await this.dataSource.transaction(async manager => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('voucher-publish'))`);
      const batch = await manager.findOneBy(IngestBatch, { id: String(batchId) });
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.status !== 'held') {
        throw new ConflictException('NOT_HELD');
      }
      if (batch.errorSummary && batch.errorSummary.startsWith('OUT_OF_BALANCE')) {
        throw new ConflictException('OUT_OF_BALANCE');
      }

      await manager.query(
        `UPDATE voucher AS v
            SET valid_to = NOW()
           FROM ingest_batch AS b
          WHERE v.batch_id = b.id
            AND b.status = 'published'
            AND v.valid_to IS NULL
            AND v.batch_id <> $1
            AND (v.company_id, v.vch_type, v.vch_no, v.vch_date) IN (
              SELECT company_id, vch_type, vch_no, vch_date
                FROM voucher
               WHERE batch_id = $1 AND valid_to IS NULL AND is_deleted = false
            )`,
        [String(batchId)],
      );

      batch.status = 'published';
      batch.publishedAt = new Date();
      batch.publishedBy = userId;
      await manager.save(batch);
      await this.auditService.log({
        userId, action: 'publish', entityType: 'ingest_batch', entityId: batchId, ip, userAgent, meta: {}
      }, manager);
    });
  
    // Indexer best-effort sync
    try {
      const vouchers = await this.voucherRepo.find({
        where: { batchId: String(batchId), validTo: IsNull(), isDeleted: false }
      });

      const docs: IndexedVoucher[] = vouchers.map(v => {
        let vch_date = '';
        if (typeof v.vchDate === 'string') {
          vch_date = v.vchDate;
        } else {
          const d = new Date(v.vchDate as any);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          vch_date = `${yyyy}-${mm}-${dd}`;
        }
        return {
          id: String(v.id),
          company_id: v.companyId,
          company_name: getCompanyName(v.companyId),
          vch_no: v.vchNo || '',
          vch_no_norm: v.vchNoNorm || '',
          party_name: v.partyName,
          total_amount: v.totalAmount ?? '0.00',
          narration: v.narration,
          vch_date,
          vch_type: v.vchType,
          batch_id: String(v.batchId),
        };
      });
      
      await this.indexer.upsert(docs);

      // Remove superseded/deleted
      const superseded = await this.voucherRepo.createQueryBuilder('v')
        .where('v.batch_id = :batchId', { batchId })
        .andWhere('(v.valid_to IS NOT NULL OR v.is_deleted = true)')
        .getMany();

      if (superseded.length > 0) {
        await this.indexer.deleteByIds(superseded.map(v => String(v.id)));
      }
    } catch (err) {
      this.logger.error('Indexer failed during publishBatch', err instanceof Error ? err.stack : String(err));
    }

    return this.getBatch(batchId);
  }

  async holdBatch(batchId: number, userId: string, ip?: string, userAgent?: string) {
    await this.dataSource.transaction(async manager => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('voucher-publish'))`);
      const batch = await manager.findOneBy(IngestBatch, { id: String(batchId) });
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.status === 'held') return;
      if (batch.status !== 'published') {
        throw new BadRequestException('Only a live day book can be taken off search');
      }

      await manager.query(
        `UPDATE voucher AS prev
            SET valid_to = NULL
           FROM (
             SELECT DISTINCT ON (v.company_id, v.vch_type, v.vch_no, v.vch_date) v.id
               FROM voucher v
               JOIN ingest_batch b ON b.id = v.batch_id
              WHERE v.batch_id <> $1
                AND v.is_deleted = false
                AND v.valid_to IS NOT NULL
                AND b.status = 'published'
                AND (v.company_id, v.vch_type, v.vch_no, v.vch_date) IN (
                  SELECT company_id, vch_type, vch_no, vch_date FROM voucher WHERE batch_id = $1
                )
              ORDER BY v.company_id, v.vch_type, v.vch_no, v.vch_date, v.valid_from DESC, v.id DESC
           ) AS pick
          WHERE prev.id = pick.id
            AND prev.valid_to IS NOT NULL`,
        [String(batchId)],
      );

      batch.status = 'held';
      batch.publishedAt = null;
      batch.publishedBy = null;
      await manager.save(batch);
      await this.auditService.log({
        userId, action: 'unpublish', entityType: 'ingest_batch', entityId: batchId, ip, userAgent, meta: {}
      }, manager);
    });

    // Indexer best-effort sync
    try {
      await this.indexer.deleteByBatchId(String(batchId));
    } catch (err) {
      this.logger.error('Indexer failed during holdBatch', err instanceof Error ? err.stack : String(err));
    }

    return this.getBatch(batchId);
  }
}
