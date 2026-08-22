import { MigrationInterface, QueryRunner } from "typeorm";

// item-search.service.ts now searches alias, sap_item_code and
// hsn_description alongside the fields already indexed in
// ItemMasterIndexes1787200000002 — without a trigram index each of those
// three ILIKE checks forces a sequential scan of the whole table on every
// search, which defeats the actual point of this system (fast lookup in a
// file Tally itself is slow to search).
export class ItemMasterSearchFieldIndexes1787300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_alias_trgm" ON "item_master_row" USING gin ("alias" gin_trgm_ops);`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_sap_item_code_trgm" ON "item_master_row" USING gin ("sap_item_code" gin_trgm_ops);`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_hsn_description_trgm" ON "item_master_row" USING gin ("hsn_description" gin_trgm_ops);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_hsn_description_trgm";`);
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_sap_item_code_trgm";`);
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_alias_trgm";`);
    }
}
