import { MigrationInterface, QueryRunner } from "typeorm";

export class ItemMasterIndexes1787200000002 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_current_code" ON "item_master_row" ("item_code") WHERE "valid_to" IS NULL;`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_main_group" ON "item_master_row" ("main_group");`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_sub_group" ON "item_master_row" ("sub_group");`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_brand" ON "item_master_row" ("brand");`);
        
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_item_name_trgm" ON "item_master_row" USING gin ("item_name" gin_trgm_ops);`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_brand_trgm" ON "item_master_row" USING gin ("brand" gin_trgm_ops);`);
        await queryRunner.query(`CREATE INDEX "IDX_item_master_row_catalogue_no_trgm" ON "item_master_row" USING gin ("catalogue_no" gin_trgm_ops);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_catalogue_no_trgm";`);
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_brand_trgm";`);
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_item_name_trgm";`);
        
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_brand";`);
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_sub_group";`);
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_main_group";`);
        await queryRunner.query(`DROP INDEX "IDX_item_master_row_current_code";`);
    }
}
