import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await queryRunner.query(`
      CREATE TABLE app_user (
        id              BIGSERIAL PRIMARY KEY,
        email           CITEXT NOT NULL UNIQUE,
        password_hash   TEXT NOT NULL,
        display_name    TEXT NOT NULL,
        role            TEXT NOT NULL CHECK (role IN ('steward', 'finance', 'branch')),
        company_id      TEXT,
        branch_id       TEXT,
        mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE audit_event (
        id           BIGSERIAL PRIMARY KEY,
        at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        user_id      BIGINT REFERENCES app_user(id),
        action       TEXT NOT NULL,
        entity_type  TEXT,
        entity_id    TEXT,
        ip           INET,
        user_agent   TEXT,
        meta         JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_audit_at ON audit_event (at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_audit_user ON audit_event (user_id, at DESC)`);

    await queryRunner.query(`
      CREATE TABLE source_file (
        id           BIGSERIAL PRIMARY KEY,
        sha256       CHAR(64) NOT NULL UNIQUE,
        storage_key  TEXT NOT NULL,
        original_name TEXT NOT NULL,
        byte_size    BIGINT NOT NULL,
        content_type TEXT,
        uploaded_by  BIGINT NOT NULL REFERENCES app_user(id),
        uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ingest_batch (
        id              BIGSERIAL PRIMARY KEY,
        source_file_id  BIGINT NOT NULL REFERENCES source_file(id),
        file_sha256     CHAR(64) NOT NULL,
        tally_company   TEXT NOT NULL,
        company_id      TEXT NOT NULL,
        branch_id       TEXT,
        report_type     TEXT NOT NULL CHECK (report_type IN ('DAY_BOOK')),
        period_from     DATE,
        period_to       DATE,
        status          TEXT NOT NULL CHECK (status IN (
                          'uploaded', 'detecting', 'parsing', 'validating',
                          'held', 'publishing', 'published', 'rejected', 'duplicate'
                        )),
        total_rows      INT NOT NULL DEFAULT 0,
        accepted_rows   INT NOT NULL DEFAULT 0,
        rejected_rows   INT NOT NULL DEFAULT 0,
        debit_sum       NUMERIC(18,2),
        credit_sum      NUMERIC(18,2),
        error_summary   TEXT,
        uploaded_by     BIGINT NOT NULL REFERENCES app_user(id),
        uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at    TIMESTAMPTZ,
        published_by    BIGINT REFERENCES app_user(id),
        UNIQUE (file_sha256)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ingest_reject (
        id            BIGSERIAL PRIMARY KEY,
        batch_id      BIGINT NOT NULL REFERENCES ingest_batch(id),
        source_row_no INT NOT NULL,
        code          TEXT NOT NULL,
        message       TEXT NOT NULL,
        raw           JSONB
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_reject_batch ON ingest_reject (batch_id)`);

    await queryRunner.query(`
      CREATE TABLE master_ledger (
        id            BIGSERIAL PRIMARY KEY,
        company_id    TEXT NOT NULL,
        ledger_name   TEXT NOT NULL,
        parent_group  TEXT,
        gstin         TEXT,
        is_party      BOOLEAN NOT NULL DEFAULT FALSE,
        extra         JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (company_id, ledger_name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE voucher (
        id              BIGSERIAL PRIMARY KEY,
        batch_id        BIGINT NOT NULL REFERENCES ingest_batch(id),
        company_id      TEXT NOT NULL,
        branch_id       TEXT,
        tally_guid      TEXT,
        vch_no          TEXT,
        vch_no_norm     TEXT,
        vch_type        TEXT NOT NULL,
        vch_date        DATE NOT NULL,
        party_name      TEXT,
        total_amount    NUMERIC(15,2),
        narration       TEXT,
        source_row_no   INT,
        extra           JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
        valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
        valid_to        TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT voucher_current_key UNIQUE NULLS NOT DISTINCT
          (company_id, vch_type, vch_no, vch_date, valid_to),
        CONSTRAINT voucher_guid_current UNIQUE NULLS NOT DISTINCT
          (company_id, tally_guid, valid_to)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_voucher_search_no ON voucher (company_id, vch_no_norm)`);
    await queryRunner.query(`CREATE INDEX idx_voucher_search_date ON voucher (company_id, vch_date)`);
    await queryRunner.query(`CREATE INDEX idx_voucher_search_party ON voucher (company_id, party_name)`);
    await queryRunner.query(`CREATE INDEX idx_voucher_current ON voucher (company_id) WHERE valid_to IS NULL AND is_deleted = FALSE`);
    await queryRunner.query(`CREATE INDEX idx_voucher_amount ON voucher (company_id, total_amount) WHERE valid_to IS NULL`);

    await queryRunner.query(`
      CREATE TABLE voucher_line (
        id           BIGSERIAL PRIMARY KEY,
        voucher_id   BIGINT NOT NULL REFERENCES voucher(id),
        line_no      INT NOT NULL,
        ledger_name  TEXT NOT NULL,
        debit        NUMERIC(15,2) NOT NULL DEFAULT 0,
        credit       NUMERIC(15,2) NOT NULL DEFAULT 0,
        extra        JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (voucher_id, line_no),
        CONSTRAINT voucher_line_one_side CHECK (
          (debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0) OR (debit = 0 AND credit = 0)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_voucher_line_ledger ON voucher_line (ledger_name)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE voucher_line`);
    await queryRunner.query(`DROP TABLE voucher`);
    await queryRunner.query(`DROP TABLE master_ledger`);
    await queryRunner.query(`DROP TABLE ingest_reject`);
    await queryRunner.query(`DROP TABLE ingest_batch`);
    await queryRunner.query(`DROP TABLE source_file`);
    await queryRunner.query(`DROP TABLE audit_event`);
    await queryRunner.query(`DROP TABLE app_user`);
  }
}
