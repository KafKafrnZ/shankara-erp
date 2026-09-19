import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  QueryFailedError,
  EntityManager,
} from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import { PgBoss } from 'pg-boss';

import { ItemMasterBatch } from './entities/item-master-batch.entity';
import { ItemMasterRow } from './entities/item-master-row.entity';
import { ItemMasterSkip } from './entities/item-master-skip.entity';
import { SourceFile } from '../storage/entities/source-file.entity';
import { LocalFsObjectStore } from '../storage/local-fs.object-store';
import { AuditService } from '../audit/audit.service';
import { parseItemMasterFile } from './parse/item-master.parser';
import { ItemSearchService } from './item-search.service';
import { ManualItemDto } from './dto/manual-item.dto';
import type { PublishBatchDto } from './dto/publish-batch.dto';
import { formatExtraValue } from '../common/sheet-date';
import {
  EMPTY_MERGE_SUMMARY,
  dedupeByAlias,
  normalizeAlias,
  type MergeSummary,
} from './item-identity';

interface FingerprintableItem {
  layoutKey: string;
  itemCode: string;
  catalogueNo?: string;
  sapItemCode?: string;
  brand?: string;
  itemName: string;
  hsnDescription?: string;
  mainGroup?: string;
  subGroup?: string;
  uom?: string;
  alias?: string;
  extra?: Record<string, unknown>;
}

const pipeline = promisify(stream.pipeline);

@Injectable()
export class ItemMasterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ItemMasterService.name);
  private boss: PgBoss;

  constructor(
    @InjectRepository(ItemMasterBatch)
    private batchRepo: Repository<ItemMasterBatch>,
    @InjectRepository(ItemMasterRow) private rowRepo: Repository<ItemMasterRow>,
    @InjectRepository(ItemMasterSkip)
    private skipRepo: Repository<ItemMasterSkip>,
    @InjectRepository(SourceFile)
    private sourceFileRepo: Repository<SourceFile>,
    private objectStore: LocalFsObjectStore,
    private dataSource: DataSource,
    private auditService: AuditService,
    private configService: ConfigService,
    private itemSearchService: ItemSearchService,
  ) {}

  async onModuleInit() {
    this.boss = new PgBoss({
      host: this.configService.getOrThrow<string>('DATABASE_HOST'),
      port: Number(
        this.configService.get('JOBS_DATABASE_PORT') ??
          this.configService.get('DATABASE_PORT'),
      ),
      user: this.configService.getOrThrow<string>('DATABASE_USER'),
      password: this.configService.getOrThrow<string>('DATABASE_PASSWORD'),
      database: this.configService.getOrThrow<string>('DATABASE_NAME'),
    });

    this.boss.on('error', (error) => this.logger.error(error));

    await this.boss.start();
    // pg-boss v12 requires a queue to exist before .work()/.send() can use
    // it — createQueue is idempotent (safe to call on every startup). The
    // mocked pg-boss used in e2e tests (test/__mocks__/pg-boss.js) doesn't
    // enforce this, which is why this was never caught by the test suite:
    // it only ever failed against a real pg-boss instance.
    await this.boss.createQueue('item-master-parse');

    await this.boss.work('item-master-parse', async (job) => {
      const { batchId } = (
        Array.isArray(job) ? job[0].data : (job as any).data
      ) as { batchId: number };
      await this.processBatchJob(batchId);
    });
  }

  async onModuleDestroy() {
    await this.boss.stop();
  }

  async processUpload(
    fileStream: stream.Readable,
    originalName: string,
    mimeType: string,
    byteSize: number,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const tmpPath = path.join(
      os.tmpdir(),
      `item_upload_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    );
    const queryRunner = this.dataSource.createQueryRunner();
    let committed = false;
    try {
      const writeStream = fs.createWriteStream(tmpPath);
      const hash = crypto.createHash('sha256');

      fileStream.on('data', (chunk) => hash.update(chunk));
      await pipeline(fileStream, writeStream);

      const sha256 = hash.digest('hex');

      await queryRunner.connect();
      await queryRunner.startTransaction();
      const existingBatch = await queryRunner.manager.findOne(ItemMasterBatch, {
        where: { fileSha256: sha256 },
      });
      if (existingBatch) {
        await queryRunner.rollbackTransaction();
        fs.unlinkSync(tmpPath);

        // File dedup means re-uploading the identical file would otherwise
        // just point back at the same stuck/failed batch forever with no
        // way to recover it. If that's what happened, retry it instead of
        // reporting an inert duplicate — this is exactly the case where
        // someone re-uploads a file hoping something will happen.
        if (
          existingBatch.status === 'processing' ||
          existingBatch.status === 'rejected'
        ) {
          await this.retryBatch(
            Number(existingBatch.id),
            userId,
            ip,
            userAgent,
          );
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

      let sourceFile = await queryRunner.manager.findOne(SourceFile, {
        where: { sha256 },
      });
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

      await this.auditService.log(
        {
          userId,
          action: 'item_upload',
          entityType: 'item_master_batch',
          entityId: batch.id,
          ip,
          userAgent,
          meta: { sha256 },
        },
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
      committed = true;

      // Enqueue background job. This runs after commit, so if it throws,
      // the batch row already exists as 'processing' — the catch block
      // below must not try to roll back a transaction that's already
      // committed (that throws its own, more confusing error and masks
      // whatever actually went wrong here).
      await this.boss.send('item-master-parse', { batchId: Number(batch.id) });

      return {
        batchId: Number(batch.id),
        status: 'processing',
        duplicate: false,
        sha256,
        originalName,
      };
    } catch (err) {
      try {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
      } catch {
        /* never started */
      }
      const code =
        err instanceof QueryFailedError
          ? (err as QueryFailedError & { driverError?: { code?: string } })
              .driverError?.code
          : '';
      if (code === '23505') {
        throw new BadRequestException(
          'This file is already being uploaded. Wait a moment and try again.',
        );
      }
      throw err;
    } finally {
      if (queryRunner.isReleased === false) {
        try {
          await queryRunner.release();
        } catch {
          /* already released */
        }
      }
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
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
      const lockResult = await queryRunner.manager.query(
        'SELECT pg_try_advisory_xact_lock($1) as locked',
        [batchId],
      );
      if (!lockResult[0].locked) {
        this.logger.warn(
          `batch ${batchId} is already being processed by another run — skipping this one`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      const batch = await queryRunner.manager.findOne(ItemMasterBatch, {
        where: { id: String(batchId) },
        relations: { sourceFile: true },
      });
      if (!batch) {
        await queryRunner.rollbackTransaction();
        return;
      }
      // This job only ever runs for a real upload (enqueued from
      // processUpload) — a manual add/edit/delete skips the parse queue
      // entirely and is never the source of this batchId.
      if (!batch.sourceFile) {
        throw new Error(
          `item_master_batch ${batchId} has no source file to parse`,
        );
      }

      const objectStream = await this.objectStore.get(
        batch.sourceFile.storageKey,
      );
      const tmpPath = path.join(
        os.tmpdir(),
        `item_parse_${batchId}_${Date.now()}`,
      );
      let parsed: Awaited<ReturnType<typeof parseItemMasterFile>>;
      try {
        const writeStream = fs.createWriteStream(tmpPath);
        await pipeline(objectStream, writeStream);
        parsed = await parseItemMasterFile(tmpPath);
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }

      batch.totalSheets = parsed.totalSheets;
      batch.recognizedSheets = parsed.recognizedSheets;
      batch.skippedSheets = parsed.skippedSheets;
      batch.totalRows = parsed.totalRows;
      batch.acceptedRows = parsed.acceptedRows;
      batch.skippedRows = parsed.skippedRows;
      batch.extraHeaders = parsed.extraHeaders;

      // Retry of a stuck/rejected batch re-runs this job against the same
      // batch id. Drop this batch's previous rows/skips first so we don't
      // leave two current copies of the same code inside one batch.
      await queryRunner.manager.delete(ItemMasterSkip, {
        batchId: String(batchId),
      });
      await queryRunner.manager.delete(ItemMasterRow, {
        batchId: String(batchId),
      });

      const extraSkips: ItemMasterSkip[] = [];

      // Alias is the merge identity. Same Alias twice in this file (any
      // casing/spacing) — keep the last row, record the earlier ones so
      // the steward can see them before publish instead of silently
      // folding them the way item_code last-wins used to.
      const { kept: dedupedItems, duplicates } = dedupeByAlias(parsed.items);
      for (const dup of duplicates) {
        extraSkips.push(
          this.skipRepo.create({
            batchId: batch.id,
            sheetName: dup.item.sheetName,
            sourceRowNo: dup.item.sourceRowNo,
            code: dup.byAlias ? 'DUPLICATE_ALIAS' : 'DUPLICATE_ITEM_CODE',
            message: dup.byAlias
              ? `Alias "${dup.display}" appears more than once in this file. Kept the last row (sheet ${dup.keptItem.sheetName}, row ${dup.keptItem.sourceRowNo}); this earlier row was not merged.`
              : `Item code "${dup.display}" appears more than once in this file. Kept the last row; this earlier row was not merged.`,
            raw: {
              alias: dup.item.alias ?? null,
              itemCode: dup.item.itemCode,
              keptSourceRowNo: dup.keptItem.sourceRowNo,
            },
          }),
        );
      }

      const itemCodes = [
        ...new Set(dedupedItems.map((i) => i.itemCode).filter(Boolean)),
      ];
      const aliases = [
        ...new Set(
          dedupedItems
            .map((i) => normalizeAlias(i.alias))
            .filter((a): a is string => Boolean(a)),
        ),
      ];

      const currentByCode = new Map<string, ItemMasterRow>();
      const currentByAlias = new Map<string, ItemMasterRow | 'ambiguous'>();

      if (itemCodes.length > 0) {
        const byCode = await queryRunner.manager
          .createQueryBuilder(ItemMasterRow, 'row')
          .innerJoin('row.batch', 'batch')
          .where('row.item_code = ANY(:codes)', { codes: itemCodes })
          .andWhere('row.valid_to IS NULL')
          .andWhere('row.is_deleted = false')
          .andWhere("batch.status = 'published'")
          .getMany();
        for (const row of byCode) currentByCode.set(row.itemCode, row);
      }

      if (aliases.length > 0) {
        const byAlias = await queryRunner.manager
          .createQueryBuilder(ItemMasterRow, 'row')
          .innerJoin('row.batch', 'batch')
          .where('lower(trim(row.alias)) = ANY(:aliases)', { aliases })
          .andWhere('row.valid_to IS NULL')
          .andWhere('row.is_deleted = false')
          .andWhere("batch.status = 'published'")
          .getMany();
        for (const row of byAlias) {
          const key = normalizeAlias(row.alias);
          if (!key) continue;
          if (currentByAlias.has(key)) currentByAlias.set(key, 'ambiguous');
          else currentByAlias.set(key, row);
        }
      }

      const toInsert: ItemMasterRow[] = [];
      const summary: MergeSummary = { ...EMPTY_MERGE_SUMMARY };
      summary.duplicateAliasCount = duplicates.length;

      for (const item of dedupedItems) {
        const aliasKey = normalizeAlias(item.alias);
        const liveByAlias = aliasKey ? currentByAlias.get(aliasKey) : undefined;
        const liveByCode = currentByCode.get(item.itemCode);

        if (liveByAlias === 'ambiguous') {
          summary.ambiguousAliasCount += 1;
          extraSkips.push(
            this.skipRepo.create({
              batchId: batch.id,
              sheetName: item.sheetName,
              sourceRowNo: item.sourceRowNo,
              code: 'ALIAS_AMBIGUOUS',
              message: `Alias "${item.alias!.trim()}" already belongs to more than one live catalog item. Not merged — fix the live catalog (or this row) so each Alias is unique.`,
              raw: { alias: item.alias, itemCode: item.itemCode },
            }),
          );
          continue;
        }

        let currentRow: ItemMasterRow | undefined;
        let remapped = false;
        if (liveByAlias && liveByCode && liveByAlias.id !== liveByCode.id) {
          // File row's item_code points at one live item, its Alias at
          // another. Merging would have to pick a winner; skip instead.
          extraSkips.push(
            this.skipRepo.create({
              batchId: batch.id,
              sheetName: item.sheetName,
              sourceRowNo: item.sourceRowNo,
              code: 'ALIAS_CONFLICT',
              message: `Alias "${item.alias!.trim()}" is already live on item ${liveByAlias.itemCode}, but this row's item code matches a different live item (${liveByCode.itemCode}). Not merged.`,
              raw: {
                alias: item.alias,
                itemCode: item.itemCode,
                liveItemCodeForAlias: liveByAlias.itemCode,
                liveItemCodeForCode: liveByCode.itemCode,
              },
            }),
          );
          continue;
        } else if (liveByAlias) {
          currentRow = liveByAlias;
          if (currentRow.itemCode !== item.itemCode) {
            remapped = true;
            summary.remappedByAliasCount += 1;
          }
        } else if (liveByCode) {
          currentRow = liveByCode;
        }

        const incoming = remapped
          ? { ...item, itemCode: currentRow!.itemCode }
          : item;
        const fingerprint = this.computeFingerprint(incoming);

        if (currentRow) {
          if (currentRow.fingerprint === fingerprint) {
            summary.unchangedCount += 1;
            continue;
          }
          summary.updateCount += 1;

          if (
            currentRow.brand !== incoming.brand ||
            currentRow.mainGroup !== incoming.mainGroup
          ) {
            await this.auditService.log(
              {
                userId: null,
                action: 'item_collision_warn',
                entityType: 'item_master_row',
                entityId: currentRow.id,
                meta: {
                  oldBrand: currentRow.brand,
                  newBrand: incoming.brand,
                  oldGroup: currentRow.mainGroup,
                  newGroup: incoming.mainGroup,
                  itemCode: incoming.itemCode,
                  alias: incoming.alias ?? null,
                },
              },
              queryRunner.manager,
            );
          }
        } else {
          summary.newCount += 1;
        }

        toInsert.push(
          this.rowRepo.create({
            batchId: batch.id,
            ...incoming,
            fingerprint,
          }),
        );
      }

      const parserSkips = parsed.skips.map((s) =>
        this.skipRepo.create({
          batchId: batch.id,
          sheetName: s.sheetName,
          sourceRowNo: s.sourceRowNo,
          code: s.code,
          message: s.message,
          raw: s.raw,
        }),
      );
      const allSkips = [...parserSkips, ...extraSkips];
      if (allSkips.length > 0) {
        // Chunked, not one bulk insert: a real file can produce tens of
        // thousands of skip rows (~19,700 for the real MAIN MASTER sample
        // file), and one unchunked multi-row INSERT for that many rows
        // exceeds Postgres's 65,535-bound-parameters-per-query limit —
        // confirmed live: this failed with "bind message has 52490
        // parameter formats but 0 parameters" before this fix.
        await queryRunner.manager.save(allSkips, { chunk: 1000 });
      }

      batch.skippedRows = parsed.skippedRows + extraSkips.length;
      batch.acceptedRows = toInsert.length;
      batch.mergeSummary = summary;

      // Step 3: chunked bulk insert (same pattern as the skips insert
      // above) instead of one INSERT per row. Previous published rows stay
      // current until publishBatch() closes them.
      if (toInsert.length > 0) {
        await queryRunner.manager.save(toInsert, { chunk: 500 });
      }

      const currentBatchStatus = await queryRunner.manager.findOne(
        ItemMasterBatch,
        { where: { id: String(batchId) }, select: { status: true } },
      );
      if (currentBatchStatus && currentBatchStatus.status === 'processing') {
        batch.status = 'held';
        await queryRunner.manager.save(batch);
      } else {
        await this.auditService.log(
          {
            userId: null,
            action: 'job_status_override_warn',
            entityType: 'item_master_batch',
            entityId: batchId,
            meta: {
              originalStatus: 'processing',
              newStatus: currentBatchStatus?.status,
            },
          },
          queryRunner.manager,
        );
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
        const batchFail = await queryRunnerFail.manager.findOne(
          ItemMasterBatch,
          { where: { id: String(batchId) } },
        );
        if (batchFail) {
          batchFail.status = 'rejected';
          batchFail.errorSummary =
            err instanceof Error ? err.message : String(err);
          await queryRunnerFail.manager.save(batchFail);
        }
        await queryRunnerFail.commitTransaction();
      } catch (e) {
        await queryRunnerFail.rollbackTransaction();
      } finally {
        await queryRunnerFail.release();
      }

      this.logger.error(
        'Job error',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      await queryRunner.release();
    }
  }

  private computeFingerprint(item: FingerprintableItem): string {
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
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(fingerprintData))
      .digest('hex');
  }

  async getBatch(id: number) {
    const batch = await this.batchRepo.findOne({
      where: { id: String(id) },
      relations: { sourceFile: true },
    });
    if (!batch) throw new NotFoundException();
    return batch;
  }

  async getSkips(batchId: number, page = 1, pageSize = 50) {
    const [items, total] = await this.skipRepo.findAndCount({
      where: { batchId: String(batchId) },
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { sourceRowNo: 'ASC' },
    });
    return { items, total };
  }

  async publishBatch(
    batchId: number,
    userId: string,
    ip?: string,
    userAgent?: string,
    dest?: PublishBatchDto,
  ) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('item-master-publish'))`,
      );
      const batch = await manager.findOne(ItemMasterBatch, {
        where: { id: String(batchId) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.status !== 'held') {
        throw new BadRequestException('Batch is not in held state');
      }

      const codeRows: Array<{ item_code: string }> = await manager.query(
        `SELECT DISTINCT item_code FROM item_master_row WHERE batch_id = $1`,
        [String(batchId)],
      );
      const itemCodes = codeRows.map((r) => r.item_code);
      if (itemCodes.length > 0) {
        // Close only currently-live published rows. Pending rows on another
        // held upload must stay untouched so that file can still be accepted.
        await manager.query(
          `UPDATE item_master_row AS r
              SET valid_to = NOW()
             FROM item_master_batch AS b
            WHERE r.batch_id = b.id
              AND b.status = 'published'
              AND r.valid_to IS NULL
              AND r.batch_id <> $1
              AND r.item_code = ANY($2)`,
          [String(batchId), itemCodes],
        );
      }

      const sheetName = dest?.sheetName?.trim();
      if (dest?.destination === 'new' && sheetName) {
        await this.renameBatchSheet(manager, batch, sheetName, userId);
      }

      let absorbInto: ItemMasterBatch | null = null;
      if (dest?.destination === 'existing') {
        const targetId = dest.targetBatchId;
        if (!targetId) {
          throw new BadRequestException(
            'Pick a live sheet to add these items to',
          );
        }
        absorbInto = await manager.findOne(ItemMasterBatch, {
          where: { id: String(targetId) },
        });
        if (!absorbInto || absorbInto.status !== 'published') {
          throw new BadRequestException('That sheet is not live');
        }
      }

      batch.status = 'published';
      batch.publishedAt = new Date();
      batch.publishedBy = userId;
      await manager.save(batch);

      if (absorbInto && String(absorbInto.id) !== String(batch.id)) {
        const merged = [...(absorbInto.extraHeaders || [])];
        const seen = new Set(merged);
        for (const h of batch.extraHeaders || []) {
          if (!h || seen.has(h)) continue;
          seen.add(h);
          merged.push(h);
        }
        absorbInto.extraHeaders = merged;
        await manager.save(absorbInto);
        await manager.query(
          `UPDATE item_master_row SET batch_id = $1 WHERE batch_id = $2`,
          [String(absorbInto.id), String(batch.id)],
        );
      }

      await this.auditService.log(
        {
          userId,
          action: 'item_publish',
          entityType: 'item_master_batch',
          entityId: batchId,
          ip,
          userAgent,
          meta: dest?.destination
            ? {
                destination: dest.destination,
                sheetName: sheetName || null,
                targetBatchId: dest.targetBatchId ?? null,
              }
            : {},
        },
        manager,
      );
    });

    this.itemSearchService.clearFacetsCache();
    return this.getBatch(batchId);
  }

  /** New-sheet name is the source file's original_name — that's what the
   *  live-file pane already shows. Manual batches have no source file yet,
   *  so one is created just to hold the name. */
  private async renameBatchSheet(
    manager: EntityManager,
    batch: ItemMasterBatch,
    sheetName: string,
    userId: string,
  ) {
    if (batch.sourceFileId) {
      await manager.update(
        SourceFile,
        { id: batch.sourceFileId },
        { originalName: sheetName },
      );
      return;
    }
    const source = manager.create(SourceFile, {
      sha256: batch.fileSha256,
      storageKey: `manual/${batch.fileSha256}`,
      originalName: sheetName,
      byteSize: '0',
      contentType: 'text/plain',
      uploadedBy: userId,
    });
    await manager.save(source);
    batch.sourceFileId = source.id;
  }

  async holdBatch(
    batchId: number,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('item-master-publish'))`,
      );
      const batch = await manager.findOne(ItemMasterBatch, {
        where: { id: String(batchId) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.status === 'held') return;
      if (batch.status !== 'published') {
        throw new BadRequestException(
          'Only a live catalog file can be taken off search',
        );
      }

      await manager.query(
        `UPDATE item_master_row AS prev
            SET valid_to = NULL
           FROM (
             SELECT DISTINCT ON (r.item_code) r.id, r.item_code
               FROM item_master_row r
               JOIN item_master_batch b ON b.id = r.batch_id
              WHERE r.batch_id <> $1
                AND r.is_deleted = false
                AND r.valid_to IS NOT NULL
                AND b.status = 'published'
                AND r.item_code IN (SELECT item_code FROM item_master_row WHERE batch_id = $1)
              ORDER BY r.item_code, r.valid_from DESC, r.id DESC
           ) AS pick
          WHERE prev.id = pick.id
            AND prev.valid_to IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
                FROM item_master_row cur
                JOIN item_master_batch b ON b.id = cur.batch_id
               WHERE cur.item_code = pick.item_code
                 AND cur.valid_to IS NULL
                 AND cur.is_deleted = false
                 AND b.status = 'published'
                 AND cur.batch_id <> $1
            )`,
        [String(batchId)],
      );

      batch.status = 'held';
      batch.publishedAt = null;
      batch.publishedBy = null;
      await manager.save(batch);
      await this.auditService.log(
        {
          userId,
          action: 'item_hold',
          entityType: 'item_master_batch',
          entityId: batchId,
          ip,
          userAgent,
          meta: {},
        },
        manager,
      );
    });

    this.itemSearchService.clearFacetsCache();
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
  async retryBatch(
    batchId: number,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const batch = await this.batchRepo.findOneBy({ id: String(batchId) });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status !== 'processing' && batch.status !== 'rejected') {
      throw new BadRequestException(
        'Only a batch stuck processing or that failed can be retried',
      );
    }

    batch.status = 'processing';
    batch.errorSummary = null;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(batch);
      await this.auditService.log(
        {
          userId,
          action: 'item_retry',
          entityType: 'item_master_batch',
          entityId: batchId,
          ip,
          userAgent,
          meta: {},
        },
        manager,
      );
    });

    await this.boss.send('item-master-parse', { batchId: Number(batchId) });

    return this.getBatch(batchId);
  }

  /** Add a new catalog item, or edit an existing one — keyed by item code.
   *  Goes through the same batch → publish → audit → version-history
   *  pipeline as a file upload (a single manually-typed row has nothing to
   *  hold for review, so it publishes immediately instead of waiting for a
   *  separate "make live" step). */
  async manualUpsert(
    input: ManualItemDto,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const itemCode = input.itemCode.trim();
    const itemName = input.itemName.trim();
    if (!itemCode || !itemName) {
      throw new BadRequestException('Item code and item name are required');
    }

    const item: FingerprintableItem = {
      layoutKey: 'manual_v1',
      itemCode,
      itemName,
      catalogueNo: input.catalogueNo?.trim() || undefined,
      sapItemCode: input.sapItemCode?.trim() || undefined,
      brand: input.brand?.trim() || undefined,
      hsnDescription: input.hsnDescription?.trim() || undefined,
      mainGroup: input.mainGroup?.trim() || undefined,
      subGroup: input.subGroup?.trim() || undefined,
      uom: input.uom?.trim() || undefined,
      alias: input.alias?.trim() || undefined,
      extra: Object.fromEntries(
        Object.entries(input.extra || {}).map(([k, v]) => [
          k,
          formatExtraValue(k, v),
        ]),
      ),
    };
    const fingerprint = this.computeFingerprint(item);

    const existing = await this.rowRepo
      .createQueryBuilder('row')
      .innerJoin('row.batch', 'batch')
      .where('row.item_code = :itemCode', { itemCode })
      .andWhere('row.valid_to IS NULL')
      .andWhere('row.is_deleted = false')
      .andWhere("batch.status = 'published'")
      .getOne();

    const batchId = await this.dataSource.transaction(async (manager) => {
      const batch = manager.create(ItemMasterBatch, {
        sourceFileId: null,
        isManual: true,
        fileSha256: crypto.randomBytes(32).toString('hex'),
        uploadedBy: userId,
        status: 'held',
        totalSheets: 1,
        recognizedSheets: 1,
        skippedSheets: 0,
        totalRows: 1,
        acceptedRows: 1,
        skippedRows: 0,
      });
      await manager.save(batch);

      const row = manager.create(ItemMasterRow, {
        batchId: batch.id,
        ...item,
        isDeleted: false,
        fingerprint,
      });
      await manager.save(row);

      await this.auditService.log(
        {
          userId,
          action: existing ? 'item_manual_update' : 'item_manual_create',
          entityType: 'item_master_batch',
          entityId: batch.id,
          ip,
          userAgent,
          meta: { itemCode },
        },
        manager,
      );

      return batch.id;
    });

    return this.publishBatch(Number(batchId), userId, ip, userAgent, {
      destination: input.destination,
      sheetName: input.sheetName,
      targetBatchId: input.targetBatchId,
    });
  }

  /** Soft-deletes a catalog item: inserts one more version marked deleted,
   *  publishes it (closing the previous live version the same way any new
   *  version does), so search stops returning it while the item's version
   *  history — including this removal — stays intact. */
  async manualDelete(
    itemCode: string,
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const code = itemCode?.trim();
    if (!code) {
      throw new BadRequestException('Item code is required');
    }

    const current = await this.rowRepo
      .createQueryBuilder('row')
      .innerJoin('row.batch', 'batch')
      .where('row.item_code = :code', { code })
      .andWhere('row.valid_to IS NULL')
      .andWhere('row.is_deleted = false')
      .andWhere("batch.status = 'published'")
      .getOne();
    if (!current) {
      throw new NotFoundException('Item not found in the live catalog');
    }

    const item: FingerprintableItem = {
      layoutKey: current.layoutKey,
      itemCode: current.itemCode,
      itemName: current.itemName,
      catalogueNo: current.catalogueNo || undefined,
      sapItemCode: current.sapItemCode || undefined,
      brand: current.brand || undefined,
      hsnDescription: current.hsnDescription || undefined,
      mainGroup: current.mainGroup || undefined,
      subGroup: current.subGroup || undefined,
      uom: current.uom || undefined,
      alias: current.alias || undefined,
      extra: current.extra || {},
    };
    const fingerprint = this.computeFingerprint(item);

    const batchId = await this.dataSource.transaction(async (manager) => {
      const batch = manager.create(ItemMasterBatch, {
        sourceFileId: null,
        isManual: true,
        fileSha256: crypto.randomBytes(32).toString('hex'),
        uploadedBy: userId,
        status: 'held',
        totalSheets: 1,
        recognizedSheets: 1,
        skippedSheets: 0,
        totalRows: 1,
        acceptedRows: 1,
        skippedRows: 0,
      });
      await manager.save(batch);

      const row = manager.create(ItemMasterRow, {
        batchId: batch.id,
        ...item,
        isDeleted: true,
        fingerprint,
      });
      await manager.save(row);

      await this.auditService.log(
        {
          userId,
          action: 'item_manual_delete',
          entityType: 'item_master_batch',
          entityId: batch.id,
          ip,
          userAgent,
          meta: { itemCode: code },
        },
        manager,
      );

      return batch.id;
    });

    return this.publishBatch(Number(batchId), userId, ip, userAgent);
  }
}
