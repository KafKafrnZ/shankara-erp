import { Injectable, Inject, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
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
import { formatCents } from './parse/money';

@Injectable()
export class IngestService {
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
  ) {}

  async processUpload(
    file: any,
    dto: UploadDto,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const validExtensions = ['.xlsx', '.xls', '.csv', '.zip'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(ext)) throw new BadRequestException('Invalid file extension');

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    let sourceFile = await this.sourceFileRepo.findOne({ where: { sha256 } });
    if (sourceFile) {
      const existingBatch = await this.ingestBatchRepo.findOne({
        where: { fileSha256: sha256 },
        order: { uploadedAt: 'DESC' },
      });
      const batchId = existingBatch ? existingBatch.id : 'unknown';
      await this.auditService.log({
        userId, action: 'upload', entityType: 'ingest_batch', entityId: batchId, ip, userAgent, meta: { sha256, duplicate: true },
      });

      return {
        batchId: Number(batchId),
        status: 'duplicate',
        duplicate: true,
        sha256,
        originalName: sourceFile.originalName,
        bytes: Number(sourceFile.byteSize),
      };
    }

    const stored = await this.objectStore.put(sha256, file.buffer, file.mimetype);

    // fetch from object store
    const storedStream = await this.objectStore.get(stored.key);
    if (!storedStream) {
      throw new BadRequestException('Failed to retrieve file from storage');
    }

    const parsedResult = await parseDayBookStream(storedStream, ext);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      sourceFile = this.sourceFileRepo.create({
        sha256, storageKey: stored.key, originalName: file.originalname,
        byteSize: stored.bytes.toString(), contentType: file.mimetype, uploadedBy: userId,
      });
      await queryRunner.manager.save(sourceFile);

      // Steward is a global role (seed company_id is null) and may set any companyId.
      const batch = this.ingestBatchRepo.create({
        sourceFileId: sourceFile.id, fileSha256: sha256,
        tallyCompany: (parsedResult.detect as any).titleCompany || 'unknown',
        companyId: dto.companyId, branchId: dto.branchId,
        reportType: parsedResult.detect.ok && (parsedResult.detect as any).reportType === 'SALES_REGISTER' ? 'SALES_REGISTER' : 'DAY_BOOK',
        periodFrom: (parsedResult.detect as any).periodFrom ? new Date((parsedResult.detect as any).periodFrom) : null,
        periodTo: (parsedResult.detect as any).periodTo ? new Date((parsedResult.detect as any).periodTo) : null,
        status: 'held', uploadedBy: userId,
        errorSummary: null,
      });await queryRunner.manager.save(batch);

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

          const currentVoucher = await queryRunner.manager.findOne(Voucher, {
            where: {
              companyId: dto.companyId,
              vchType: v.vchType,
              vchNo: v.vchNo,
              vchDate: v.vchDate,
              validTo: IsNull(),
              isDeleted: false,
            }
          });

          if (currentVoucher) {
            tallyGuid = currentVoucher.tallyGuid || tallyGuid;
            if (currentVoucher.extra.fingerprint === fingerprint) {
              continue;
            } else {
              currentVoucher.validTo = new Date();
              await queryRunner.manager.save(currentVoucher);
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
      
      const tolCents = BigInt(Math.round(parseFloat(process.env.DEBIT_CREDIT_TOLERANCE || '0.01') * 100));
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
    const batch = await this.ingestBatchRepo.findOneBy({ id: String(batchId) });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status === 'published' || batch.status === 'rejected') {
      throw new ConflictException('NOT_HELD');
    }

    batch.status = 'published';
    batch.publishedAt = new Date();
    batch.publishedBy = userId;

    await this.dataSource.transaction(async manager => {
      await manager.save(batch);
      await this.auditService.log({
        userId, action: 'publish', entityType: 'ingest_batch', entityId: batchId, ip, userAgent, meta: {}
      }, manager);
    });

    return this.getBatch(batchId);
  }

  async holdBatch(batchId: number, userId: string, ip?: string, userAgent?: string) {
    const batch = await this.ingestBatchRepo.findOneBy({ id: String(batchId) });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status === 'held') return this.getBatch(batchId);

    batch.status = 'held';
    batch.publishedAt = null;
    batch.publishedBy = null;

    await this.dataSource.transaction(async manager => {
      await manager.save(batch);
      await this.auditService.log({
        userId, action: 'unpublish', entityType: 'ingest_batch', entityId: batchId, ip, userAgent, meta: {}
      }, manager);
    });

    return this.getBatch(batchId);
  }
}
