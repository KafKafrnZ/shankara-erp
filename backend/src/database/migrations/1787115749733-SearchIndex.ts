import { MigrationInterface, QueryRunner } from "typeorm";

export class SearchIndex1787115749733 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX idx_voucher_s9 ON voucher (company_id, valid_to, vch_no_norm varchar_pattern_ops, total_amount, party_name varchar_pattern_ops);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX idx_voucher_s9;`);
    }
}
