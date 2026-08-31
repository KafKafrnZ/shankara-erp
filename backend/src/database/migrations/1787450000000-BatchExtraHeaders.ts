import { MigrationInterface, QueryRunner } from 'typeorm';

export class BatchExtraHeaders1787450000000 implements MigrationInterface {
  name = 'BatchExtraHeaders1787450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" ADD COLUMN "extra_headers" text[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "item_master_batch" DROP COLUMN "extra_headers"`,
    );
  }
}
