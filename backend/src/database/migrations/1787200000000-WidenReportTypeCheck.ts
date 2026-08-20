import { MigrationInterface, QueryRunner } from "typeorm";

export class WidenReportTypeCheck1787200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE ingest_batch DROP CONSTRAINT ingest_batch_report_type_check;`);
        await queryRunner.query(`ALTER TABLE ingest_batch ADD CONSTRAINT ingest_batch_report_type_check CHECK (report_type IN ('DAY_BOOK', 'SALES_REGISTER'));`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE ingest_batch DROP CONSTRAINT ingest_batch_report_type_check;`);
        await queryRunner.query(`ALTER TABLE ingest_batch ADD CONSTRAINT ingest_batch_report_type_check CHECK (report_type IN ('DAY_BOOK'));`);
    }
}
