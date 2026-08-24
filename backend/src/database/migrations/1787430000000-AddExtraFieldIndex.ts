import { MigrationInterface, QueryRunner } from 'typeorm';

// Every uploaded column now lands in item_master_row.extra (see
// item-master.parser.ts), and Phase 3's dynamic filters query it by
// arbitrary key — a GIN index keeps those queries off a full 177k+ row scan.
export class AddExtraFieldIndex1787430000000 implements MigrationInterface {
  name = 'AddExtraFieldIndex1787430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_item_master_row_extra" ON "item_master_row" USING gin ("extra")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_item_master_row_extra"`);
  }
}
