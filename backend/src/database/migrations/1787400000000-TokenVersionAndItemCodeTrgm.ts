import { MigrationInterface, QueryRunner } from 'typeorm';

export class TokenVersionAndItemCodeTrgm1787400000000 implements MigrationInterface {
  name = 'TokenVersionAndItemCodeTrgm1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "app_user" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await queryRunner.query(
      `CREATE INDEX "IDX_item_master_row_item_code_trgm" ON "item_master_row" USING gin ("item_code" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_item_master_row_item_code_trgm"`);
    await queryRunner.query(`ALTER TABLE "app_user" DROP COLUMN "token_version"`);
  }
}
