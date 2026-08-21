import { MigrationInterface, QueryRunner } from "typeorm";

export class ItemMasterEntities1787200000001 implements MigrationInterface {
    name = 'ItemMasterEntities1787200000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "item_master_batch" (
                "id" bigserial NOT NULL,
                "source_file_id" bigint NOT NULL,
                "file_sha256" character(64) NOT NULL,
                "uploaded_by" bigint NOT NULL,
                "uploaded_at" timestamp with time zone NOT NULL DEFAULT now(),
                "status" text NOT NULL,
                "total_sheets" integer NOT NULL DEFAULT 0,
                "recognized_sheets" integer NOT NULL DEFAULT 0,
                "skipped_sheets" integer NOT NULL DEFAULT 0,
                "total_rows" integer NOT NULL DEFAULT 0,
                "accepted_rows" integer NOT NULL DEFAULT 0,
                "skipped_rows" integer NOT NULL DEFAULT 0,
                "error_summary" text,
                "published_at" timestamp with time zone,
                "published_by" bigint,
                CONSTRAINT "UQ_item_master_batch_file_sha256" UNIQUE ("file_sha256"),
                CONSTRAINT "PK_item_master_batch" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "item_master_row" (
                "id" bigserial NOT NULL,
                "batch_id" bigint NOT NULL,
                "layout_key" text NOT NULL,
                "item_code" text NOT NULL,
                "catalogue_no" text,
                "sap_item_code" text,
                "brand" text,
                "item_name" text NOT NULL,
                "hsn_description" text,
                "main_group" text,
                "sub_group" text,
                "uom" text,
                "alias" text,
                "source_row_no" integer,
                "extra" jsonb NOT NULL DEFAULT '{}',
                "fingerprint" text NOT NULL,
                "is_deleted" boolean NOT NULL DEFAULT false,
                "valid_from" timestamp with time zone NOT NULL DEFAULT now(),
                "valid_to" timestamp with time zone,
                "created_at" timestamp with time zone NOT NULL DEFAULT now(),
                CONSTRAINT "PK_item_master_row" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "item_master_skip" (
                "id" bigserial NOT NULL,
                "batch_id" bigint NOT NULL,
                "sheet_name" text NOT NULL,
                "source_row_no" integer,
                "code" text NOT NULL,
                "message" text NOT NULL,
                "raw" jsonb,
                CONSTRAINT "PK_item_master_skip" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "item_master_batch"
            ADD CONSTRAINT "FK_item_master_batch_source_file"
            FOREIGN KEY ("source_file_id") REFERENCES "source_file"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "item_master_row"
            ADD CONSTRAINT "FK_item_master_row_batch"
            FOREIGN KEY ("batch_id") REFERENCES "item_master_batch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "item_master_skip"
            ADD CONSTRAINT "FK_item_master_skip_batch"
            FOREIGN KEY ("batch_id") REFERENCES "item_master_batch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "item_master_skip" DROP CONSTRAINT "FK_item_master_skip_batch"`);
        await queryRunner.query(`ALTER TABLE "item_master_row" DROP CONSTRAINT "FK_item_master_row_batch"`);
        await queryRunner.query(`ALTER TABLE "item_master_batch" DROP CONSTRAINT "FK_item_master_batch_source_file"`);
        
        await queryRunner.query(`DROP TABLE "item_master_skip"`);
        await queryRunner.query(`DROP TABLE "item_master_row"`);
        await queryRunner.query(`DROP TABLE "item_master_batch"`);
    }
}
