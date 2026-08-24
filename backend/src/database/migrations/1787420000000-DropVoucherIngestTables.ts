import { MigrationInterface, QueryRunner } from 'typeorm';

// The day book (vouchers) system has been fully retired — the stakeholder
// only needs the item catalog going forward. `source_file` stays: the item
// catalog's uploads reference it too (see ItemMasterBatch.sourceFileId).
export class DropVoucherIngestTables1787420000000 implements MigrationInterface {
  name = 'DropVoucherIngestTables1787420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CASCADE drops the FK-dependent indexes/constraints along with each
    // table (voucher_line -> voucher -> ingest_batch, ingest_reject ->
    // ingest_batch). master_ledger has no FK to ingest_batch but is
    // day-book-only data with nothing else referencing it.
    await queryRunner.query(`DROP TABLE IF EXISTS "voucher_line" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "voucher" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ingest_reject" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "master_ledger" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ingest_batch" CASCADE`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Deliberately irreversible via migration: recreating the exact prior
    // schema would mean replaying InitialSchema + WidenReportTypeCheck +
    // VoucherCurrentPerBatch by hand, only to hold zero live data anyway.
    // A pg_dump of these tables was taken before this migration ran — restore
    // from that backup if the day book needs to come back.
    throw new Error(
      'DropVoucherIngestTables cannot be rolled back via migration. Restore voucher/ingest_batch/ingest_reject/master_ledger/voucher_line from the pre-drop pg_dump backup instead.',
    );
  }
}
