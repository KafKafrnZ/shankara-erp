import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SourceFile } from './entities/source-file.entity';
import { IngestBatch } from './entities/ingest-batch.entity';
import { OBJECT_STORE } from '../storage/object-store';
import type { ObjectStore } from '../storage/object-store';
import { AuditService } from '../audit/audit.service';
import { UploadDto } from './dto/upload.dto';
import * as crypto from 'crypto';

@Injectable()
export class IngestService {
  constructor(
    @InjectRepository(SourceFile)
    private sourceFileRepo: Repository<SourceFile>,
    @InjectRepository(IngestBatch)
    private ingestBatchRepo: Repository<IngestBatch>,
    @Inject(OBJECT_STORE)
    private objectStore: ObjectStore,
    private auditService: AuditService,
    private dataSource: DataSource,
  ) {}

  async processUpload(
    file: Express.Multer.File,
    dto: UploadDto,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const validExtensions = ['.xlsx', '.xls', '.csv', '.zip'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(ext)) {
      throw new BadRequestException('Invalid file extension');
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // 1. Check if source file already exists
    let sourceFile = await this.sourceFileRepo.findOne({ where: { sha256 } });
    let duplicate = false;
    let batchId: string;
    let status: string;

    if (sourceFile) {
      // Duplicate upload
      duplicate = true;
      const existingBatch = await this.ingestBatchRepo.findOne({
        where: { fileSha256: sha256 },
        order: { uploadedAt: 'DESC' },
      });
      batchId = existingBatch ? existingBatch.id : 'unknown';
      status = 'duplicate';

      await this.auditService.log({
        userId,
        action: 'upload',
        ip,
        userAgent,
        meta: { sha256, batchId, duplicate },
      });

      return {
        batchId: Number(batchId),
        status,
        duplicate,
        sha256,
        originalName: sourceFile.originalName,
        bytes: Number(sourceFile.byteSize),
      };
    }

    // 2. New upload
    const stored = await this.objectStore.put(sha256, file.buffer, file.mimetype);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      sourceFile = this.sourceFileRepo.create({
        sha256,
        storageKey: stored.key,
        originalName: file.originalname,
        byteSize: stored.bytes.toString(),
        contentType: file.mimetype,
        uploadedBy: userId,
      });
      await queryRunner.manager.save(sourceFile);

      const batch = this.ingestBatchRepo.create({
        sourceFileId: sourceFile.id,
        fileSha256: sha256,
        tallyCompany: dto.companyId,
        companyId: dto.companyId,
        branchId: dto.branchId,
        reportType: 'DAY_BOOK',
        status: 'uploaded',
        uploadedBy: userId,
      });
      await queryRunner.manager.save(batch);

      await queryRunner.commitTransaction();

      batchId = batch.id;
      status = batch.status;

      await this.auditService.log({
        userId,
        action: 'upload',
        ip,
        userAgent,
        meta: { sha256, batchId, duplicate: false },
      });

      return {
        batchId: Number(batchId),
        status,
        duplicate: false,
        sha256,
        originalName: sourceFile.originalName,
        bytes: stored.bytes,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      if (code === '23505') {
        return this.processUpload(file, dto, userId, ip, userAgent);
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
