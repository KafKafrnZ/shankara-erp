import { MigrationInterface, QueryRunner } from "typeorm";

export class SearchIndexFixed1787120512574 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_voucher_s9;`);
        await queryRunner.query(`CREATE INDEX idx_voucher_s9_vch ON voucher (company_id, valid_to, vch_no_norm varchar_pattern_ops);`);
        await queryRunner.query(`CREATE INDEX idx_voucher_s9_amt ON voucher (company_id, valid_to, total_amount);`);
        await queryRunner.query(`CREATE INDEX idx_voucher_s9_pty ON voucher (company_id, valid_to, party_name varchar_pattern_ops);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_voucher_s9_vch;`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_voucher_s9_amt;`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_voucher_s9_pty;`);
    }
}
