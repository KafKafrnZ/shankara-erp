import { MigrationInterface, QueryRunner } from "typeorm";

export class SearchIndexTrgm1787121078440 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
        await queryRunner.query(`CREATE INDEX idx_voucher_s9_party_trgm ON voucher USING GIN (party_name gin_trgm_ops);`);
        await queryRunner.query(`CREATE INDEX idx_voucher_s9_narr_trgm ON voucher USING GIN (narration gin_trgm_ops);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_voucher_s9_narr_trgm;`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_voucher_s9_party_trgm;`);
        await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm;`);
    }
}
