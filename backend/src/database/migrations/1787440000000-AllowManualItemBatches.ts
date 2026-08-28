import { MigrationInterface, QueryRunner } from 'typeorm';

// A manual add/edit/delete from the catalog UI creates a 1-row batch the
// same way an upload does (see item-master.service.ts manualUpsert /
// manualDelete), so it goes through the same publish/audit/version-history
// pipeline — but it has no uploaded file behind it, so source_file_id must
// be nullable. is_manual distinguishes it from a real upload wherever that
// matters (the live-sources pane, audit review).
export class AllowManualItemBatches1787440000000 implements MigrationInterface {
  name = 'AllowManualItemBatches1787440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" ALTER COLUMN "source_file_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" ADD COLUMN "is_manual" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" DROP COLUMN "is_manual"`,
    );
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" ALTER COLUMN "source_file_id" SET NOT NULL`,
    );
  }
}
