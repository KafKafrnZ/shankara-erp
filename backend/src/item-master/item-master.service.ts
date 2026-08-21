import { Injectable, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import { PgBoss } from 'pg-boss';

import { ItemMasterBatch } from './entities/item-master-batch.entity';
import { ItemMasterRow } from './entities/item-master-row.entity';
import { ItemMasterSkip } from './entities/item-master-skip.entity';
import { SourceFile } from '../ingest/entities/source-file.entity';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/object-store';
import { AuditService } from '../audit/audit.service';
import { parseItemMasterStream } from './parse/item-master.parser';

const pipeline = promisify(stream.pipeline);

@Injectable()
export class ItemMasterService implements OnModuleInit, OnModuleDestroy {
  private boss: PgBoss;

  constructor(
    @InjectRepository(ItemMasterBatch) private batchRepo: Repository<ItemMasterBatch>,
    @InjectRepository(ItemMasterRow) private rowRepo: Repository<ItemMasterRow>,
    @InjectRepository(ItemMasterSkip) private skipRepo: Repository<ItemMasterSkip>,
    @InjectRepository(SourceFile) private sourceFileRepo: Repository<SourceFile>,
    @Inject(OBJECT_STORE) private objectStore: ObjectStore,
    private dataSource: DataSource,
    private auditService: AuditService,
  ) {}

  async onModuleInit() {
    this.boss = new PgBoss({
      host: process.env.DATABASE_HOST || '127.0.0.1',
      port: parseInt(process.env.DATABASE_PORT || '6432', 10),
      user: process.env.DATABASE_USER || 'shankara',
      password: process.env.DATABASE_PASSWORD || 'shankara123',
      database: process.env.DATABASE_NAME || 'shankara',
    });

    this.boss.on('error', error => console.error(error));

    await this.boss.start();
    // pg-boss v12 requires a queue to exist before .work()/.send() can use
    // it — createQueue is idempotent (safe to call on every startup). The
    // mocked pg-boss used in e2e tests (test/__mocks__/pg-boss.js) doesn't
    // enforce this, which is why this was never caught by the test suite:
    // it only ever failed against a real pg-boss instance.
    await this.boss.createQueue('item-master-parse');

    await this.boss.work('item-master-parse', async (job) => {
      const { batchId } = (Array.isArray(job) ? job[0].data : (job as any).data) as { batchId: number };
      await this.processBatchJob(batchId);
    });
  }

  async onModuleDestroy() {
    await this.boss.stop();
  }

  async processUpload(fileStream: stream.Readable, originalName: string, mimeType: string, byteSize: number, userId: string, ip?: string, userAgent?: string) {
    const tmpPath = path.join('/tmp', `item_upload_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    const writeStream = fs.createWriteStream(tmpPath);
    const hash = crypto.createHash('sha256');

    fileStream.on('data', chunk => hash.update(chunk));
    await pipeline(fileStream, writeStream);

    const sha256 = hash.digest('hex');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let committed = false;
    try {
      const existingBatch = await queryRunner.manager.findOne(ItemMasterBatch, { where: { fileSha256: sha256 } });
      if (existingBatch) {
        await queryRunner.rollbackTransaction();
        fs.unlinkSync(tmpPath);

        // File dedup means re-uploading the identical file would otherwise
        // just point back at the same stuck/failed batch forever with no
        // way to recover it. If that's what happened, retry it instead of
        // reporting an inert duplicate — this is exactly the case where
        // someone re-uploads a file hoping something will happen.
        if (existingBatch.status === 'processing' || existingBatch.status === 'rejected') {
          await this.retryBatch(Number(existingBatch.id), userId, ip, userAgent);
          return {
            batchId: Number(existingBatch.id),
            status: 'processing',
            duplicate: true,
            retried: true,
            sha256,
            originalName,
          };
        }

        return {
          batchId: Number(existingBatch.id),
          status: 'duplicate',
          duplicate: true,
          sha256,
          originalName,
        };
      }

      let sourceFile = await queryRunner.manager.findOne(SourceFile, { where: { sha256 } });
      if (!sourceFile) {
        const readStream = fs.createReadStream(tmpPath);
        const stored = await this.objectStore.put(sha256, readStream, mimeType);

        sourceFile = this.sourceFileRepo.create({
          sha256,
          storageKey: stored.key,
          byteSize: String(byteSize),
          contentType: mimeType,
          originalName,
          uploadedBy: userId,
        });
        await queryRunner.manager.save(sourceFile);
      }

      const batch = this.batchRepo.create({
        sourceFileId: sourceFile.id,
        fileSha256: sha256,
        uploadedBy: userId,
        status: 'processing',
      });
      await queryRunner.manager.save(batch);

      await this.auditService.log({
        userId, action: 'item_upload', entityType: 'item_master_batch', entityId: batch.id, ip, userAgent, meta: { sha256 }
      }, queryRunner.manager);

      await queryRunner.commitTransaction();
      committed = true;

      // Enqueue background job. This runs after commit, so if it throws,
      // the batch row already exists as 'processing' — the catch block
      // below must not try to roll back a transaction that's already
      // committed (that throws its own, more confusing error and masks
      // whatever actually went wrong here).
      await this.boss.send('item-master-parse', { batchId: Number(batch.id) });

      fs.unlinkSync(tmpPath);

      return {
        batchId: Number(batch.id),
        status: 'processing',
        duplicate: false,
        sha256,
        originalName,
      };
    } catch (err) {
      if (!committed) {
        await queryRunner.rollbackTransaction();
      }
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async processBatchJob(batchId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Transaction-scoped advisory lock, keyed by batch id: if a retry gets
      // triggered (manually, or automatically by re-uploading the same
      // file) while this batch is still genuinely being processed by an
      // earlier run, the second run sees the lock already held and exits
      // immediately instead of racing the first one over the same rows.
      // Auto-released at commit/rollback — nothing to manually unlock.
      const lockResult = await queryRunner.manager.query('SELECT pg_try_advisory_xact_lock($1) as locked', [batchId]);
      if (!lockResult[0].locked) {
        console.warn(`[ItemMasterService] batch ${batchId} is already being processed by another run — skipping this one`);
        await queryRunner.rollbackTransaction();
        return;
      }

      const batch = await queryRunner.manager.findOne(ItemMasterBatch, { where: { id: String(batchId) }, relations: { sourceFile: true } });
      if (!batch) {
        await queryRunner.rollbackTransaction();
        return;
      }

      const objectStream = await this.objectStore.get(batch.sourceFile.storageKey);
      const tmpPath = path.join('/tmp', `item_parse_${batchId}_${Date.now()}.xlsx`);
      
      const writeStream = fs.createWriteStream(tmpPath);
      await pipeline(objectStream, writeStream);

      const parsed = await parseItemMasterStream(tmpPath);
      fs.unlinkSync(tmpPath);

      batch.totalSheets = parsed.totalSheets;
      batch.recognizedSheets = parsed.recognizedSheets;
      batch.skippedSheets = parsed.skippedSheets;
      batch.totalRows = parsed.totalRows;
      batch.acceptedRows = parsed.acceptedRows;
      batch.skippedRows = parsed.skippedRows;

      if (parsed.skips.length > 0) {
        const skips = parsed.skips.map(s => this.skipRepo.create({
          batchId: batch.id,
          sheetName: s.sheetName,
          sourceRowNo: s.sourceRowNo,
          code: s.code,
          message: s.message,
          raw: s.raw,
        }));
        // Chunked, not one bulk insert: a real file can produce tens of
        // thousands of skip rows (~19,700 for the real MAIN MASTER sample
        // file), and one unchunked multi-row INSERT for that many rows
        // exceeds Postgres's 65,535-bound-parameters-per-query limit —
        // confirmed live: this failed with "bind message has 52490
        // parameter formats but 0 parameters" before this fix.
        await queryRunner.manager.save(skips, { chunk: 1000 });
      }

      // --- Batched insert path ---
      // The original version of this loop did up to 3 sequential queries
      // PER ROW (a SELECT to find the current version, an UPDATE to
      // supersede it, an INSERT for the new one) — for the real 174,553-row
      // MAIN MASTER file that's up to ~520,000 sequential round-trips in one
      // transaction, which took several minutes and comfortably exceeded
      // the frontend's 2-minute "still processing" timeout on a perfectly
      // healthy upload. This does the same work in ~3 queries total (plus
      // one small INSERT per chunk), not 3 per row.
      //
      // Step 1: if the same item_code appears more than once in this file,
      // keep only the last occurrence. This matches the net effect of the
      // original row-by-row code — each later occurrence in the same file
      // would immediately supersede the previous one before either reached
      // a caller — it just no longer creates a throwaway intermediate row
      // for a "version" that only existed for milliseconds within a single
      // import. Version history is about change across separate uploads,
      // not sub-second flicker inside one.
      const dedupedByCode = new Map<string, (typeof parsed.items)[number]>();
      for (const item of parsed.items) {
        dedupedByCode.set(item.itemCode, item);
      }
      const dedupedItems = [...dedupedByCode.values()];

      // Step 2: one query to fetch every currently-live row for every item
      // code in this file, instead of one SELECT per row. `= ANY(:codes)`
      // binds the whole list as a single array parameter — unlike
      // TypeORM's `In()` operator, which binds one parameter per value and
      // would itself blow past Postgres's 65,535-parameter limit for a
      // file with more than ~65k distinct codes.
      const itemCodes = dedupedItems.map(i => i.itemCode);
      const currentRows = itemCodes.length > 0
        ? await queryRunner.manager
            .createQueryBuilder(ItemMasterRow, 'row')
            .where('row.item_code = ANY(:codes)', { codes: itemCodes })
            .andWhere('row.valid_to IS NULL')
            .getMany()
        : [];
      const currentByCode = new Map(currentRows.map(r => [r.itemCode, r]));

      const toSupersedeIds: string[] = [];
      const toInsert: ItemMasterRow[] = [];

      for (const item of dedupedItems) {
        const fingerprintData = {
          layoutKey: item.layoutKey,
          itemCode: item.itemCode,
          catalogueNo: item.catalogueNo,
          sapItemCode: item.sapItemCode,
          brand: item.brand,
          itemName: item.itemName,
          hsnDescription: item.hsnDescription,
          mainGroup: item.mainGroup,
          subGroup: item.subGroup,
          uom: item.uom,
          alias: item.alias,
          extra: item.extra,
        };
        const fingerprint = crypto.createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');

        const currentRow = currentByCode.get(item.itemCode);

        if (currentRow) {
          if (currentRow.fingerprint === fingerprint) {
            continue; // unchanged since the last publish — no-op
          }

          if (currentRow.brand !== item.brand || currentRow.mainGroup !== item.mainGroup) {
            // Collision warnings stay per-occurrence (not batched) — real
            // files trigger this rarely (it fires only when a code's
            // brand/group actually changed), so it doesn't reintroduce the
            // per-row cost the rest of this rewrite removes.
            await this.auditService.log({
              userId: null, action: 'item_collision_warn', entityType: 'item_master_row', entityId: currentRow.id, meta: { oldBrand: currentRow.brand, newBrand: item.brand, oldGroup: currentRow.mainGroup, newGroup: item.mainGroup, itemCode: item.itemCode }
            }, queryRunner.manager);
          }

          toSupersedeIds.push(currentRow.id);
        }

        toInsert.push(this.rowRepo.create({
          batchId: batch.id,
          ...item,
          fingerprint,
        }));
      }

      // Step 3: one bulk UPDATE to supersede every replaced row, instead of
      // one UPDATE per row. Same `= ANY()` array-bind reasoning as above.
      if (toSupersedeIds.length > 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(ItemMasterRow)
          .set({ validTo: new Date() })
          .where('id = ANY(:ids)', { ids: toSupersedeIds })
          .execute();
      }

      // Step 4: chunked bulk insert (same pattern as the skips insert
      // above) instead of one INSERT per row.
      if (toInsert.length > 0) {
        await queryRunner.manager.save(toInsert, { chunk: 500 });
      }

      const currentBatchStatus = await queryRunner.manager.findOne(ItemMasterBatch, { where: { id: String(batchId) }, select: { status: true } });
      if (currentBatchStatus && currentBatchStatus.status === 'processing') {
        batch.status = 'held';
        await queryRunner.manager.save(batch);
      } else {
        await this.auditService.log({
          userId: null, action: 'job_status_override_warn', entityType: 'item_master_batch', entityId: batchId, meta: { originalStatus: 'processing', newStatus: currentBatchStatus?.status }
        }, queryRunner.manager);
        // Only save counts and row stats, but don't overwrite status
        await queryRunner.manager.save(batch);
      }
      
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      
      const queryRunnerFail = this.dataSource.createQueryRunner();
      await queryRunnerFail.connect();
      await queryRunnerFail.startTransaction();
      try {
        const batchFail = await queryRunnerFail.manager.findOne(ItemMasterBatch, { where: { id: String(batchId) } });
        if (batchFail) {
          batchFail.status = 'rejected';
          batchFail.errorSummary = err instanceof Error ? err.message : String(err);
          await queryRunnerFail.manager.save(batchFail);
        }
        await queryRunnerFail.commitTransaction();
      } catch(e) {
        await queryRunnerFail.rollbackTransaction();
      } finally {
        await queryRunnerFail.release();
      }

      console.error('Job error', err);
    } finally {
      await queryRunner.release();
    }
  }

  async getBatch(id: number) {
    const batch = await this.batchRepo.findOne({ where: { id: String(id) } });
    if (!batch) throw new NotFoundException();
    return batch;
  }

  async getSkips(batchId: number) {
    const [data, total] = await this.skipRepo.findAndCount({
      where: { batchId: String(batchId) },
      order: { id: 'ASC' },
      take: 1000 // In a real app we'd paginate this
    });
    return { data, total };
  }

  async publishBatch(batchId: number, userId: string, ip?: string, userAgent?: string) {
    const batch = await this.batchRepo.findOneBy({ id: String(batchId) });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status === 'published' || batch.status === 'rejected') {
      throw new BadRequestException('Batch is not in held state');
    }
    if (batch.status === 'processing') {
      throw new BadRequestException('STILL_PROCESSING');
    }

    batch.status = 'published';
    batch.publishedAt = new Date();
    batch.publishedBy = userId;

    await this.dataSource.transaction(async manager => {
      await manager.save(batch);
      await this.auditService.log({
        userId, action: 'item_publish', entityType: 'item_master_batch', entityId: batchId, ip, userAgent, meta: {}
      }, manager);
    });

    return this.getBatch(batchId);
  }

  async holdBatch(batchId: number, userId: string, ip?: string, userAgent?: string) {
    const batch = await this.batchRepo.findOneBy({ id: String(batchId) });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status === 'held') return batch;
    if (batch.status === 'processing') {
      throw new BadRequestException('STILL_PROCESSING');
    }

    batch.status = 'held';
    batch.publishedAt = null;
    batch.publishedBy = null;

    await this.dataSource.transaction(async manager => {
      await manager.save(batch);
      await this.auditService.log({
        userId, action: 'item_hold', entityType: 'item_master_batch', entityId: batchId, ip, userAgent, meta: {}
      }, manager);
    });

    return this.getBatch(batchId);
  }

  // Recovers a batch stuck in 'processing' (the background job crashed,
  // hung, or was never picked up) or 'rejected' (a transient failure, not
  // necessarily a real problem with the file). Before this existed, the
  // only way to unstick a batch was a direct database edit — re-uploading
  // the identical file just returned an inert "duplicate" pointing at the
  // same stuck batch forever, since dedup is by file hash. Safe to call
  // even if the batch is still genuinely being processed right now: the
  // advisory lock in processBatchJob() means the resulting second run just
  // exits immediately instead of racing the first one.
  async retryBatch(batchId: number, userId: string, ip?: string, userAgent?: string) {
    const batch = await this.batchRepo.findOneBy({ id: String(batchId) });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status !== 'processing' && batch.status !== 'rejected') {
      throw new BadRequestException('Only a batch stuck processing or that failed can be retried');
    }

    batch.status = 'processing';
    batch.errorSummary = null;

    await this.dataSource.transaction(async manager => {
      await manager.save(batch);
      await this.auditService.log({
        userId, action: 'item_retry', entityType: 'item_master_batch', entityId: batchId, ip, userAgent, meta: {}
      }, manager);
    });

    await this.boss.send('item-master-parse', { batchId: Number(batchId) });

    return this.getBatch(batchId);
  }
}
