import { MigrationInterface, QueryRunner } from 'typeorm';

export class VoucherCurrentPerBatch1787410000000 implements MigrationInterface {
  name = 'VoucherCurrentPerBatch1787410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "voucher" DROP CONSTRAINT "voucher_current_key"`);
    await queryRunner.query(`ALTER TABLE "voucher" DROP CONSTRAINT "voucher_guid_current"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "voucher_current_per_batch" ON "voucher" (company_id, vch_type, vch_no, vch_date, batch_id) WHERE valid_to IS NULL AND is_deleted = false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "voucher_guid_per_batch" ON "voucher" (company_id, tally_guid, batch_id) WHERE valid_to IS NULL AND tally_guid IS NOT NULL AND is_deleted = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "voucher_guid_per_batch"`);
    await queryRunner.query(`DROP INDEX "voucher_current_per_batch"`);
    await queryRunner.query(
      `ALTER TABLE "voucher" ADD CONSTRAINT "voucher_current_key" UNIQUE NULLS NOT DISTINCT (company_id, vch_type, vch_no, vch_date, valid_to)`,
    );
    await queryRunner.query(
      `ALTER TABLE "voucher" ADD CONSTRAINT "voucher_guid_current" UNIQUE NULLS NOT DISTINCT (company_id, tally_guid, valid_to)`,
    );
  }
}
