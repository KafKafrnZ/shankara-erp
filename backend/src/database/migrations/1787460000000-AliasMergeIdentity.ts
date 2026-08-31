import { MigrationInterface, QueryRunner } from 'typeorm';

export class AliasMergeIdentity1787460000000 implements MigrationInterface {
  name = 'AliasMergeIdentity1787460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" ADD COLUMN "merge_summary" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    // Equality lookup for "does this Alias already exist in the live
    // catalog?" — trgm is for search, not for merging 100k codes at once.
    await queryRunner.query(
      `CREATE INDEX "IDX_item_master_row_alias_lower_live" ON "item_master_row" (lower(trim(alias))) WHERE alias IS NOT NULL AND trim(alias) <> '' AND valid_to IS NULL AND is_deleted = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_item_master_row_alias_lower_live"`,
    );
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" DROP COLUMN "merge_summary"`,
    );
  }
}
