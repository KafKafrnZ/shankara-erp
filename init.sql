-- Shankara Buildpro - Tally Data Access Layer
-- Canonical Database Schema (PostgreSQL)

-- 1. Ingestion Control
-- Tracks every Excel file parsed and uploaded.
CREATE TABLE ingest_batch (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_sha256 VARCHAR(64) NOT NULL,
    tally_company VARCHAR(255) NOT NULL,
    report_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'processing', -- processing, published, held, rejected
    total_rows INT DEFAULT 0,
    uploaded_by VARCHAR(100),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE
);

-- 2. Canonical Masters (Ledgers & Parties)
-- Extracted from Day Book or Ledger XMLs
CREATE TABLE master_ledger (
    id SERIAL PRIMARY KEY,
    company_id VARCHAR(255) NOT NULL,
    ledger_name VARCHAR(255) NOT NULL,
    parent_group VARCHAR(255),
    gstin VARCHAR(15),
    is_party BOOLEAN DEFAULT FALSE,
    UNIQUE(company_id, ledger_name)
);

-- 3. Canonical Vouchers (The core facts)
CREATE TABLE voucher (
    id SERIAL PRIMARY KEY,
    batch_id INT REFERENCES ingest_batch(id),
    company_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255),
    tally_guid VARCHAR(255), -- If from XML
    vch_no VARCHAR(100),
    vch_type VARCHAR(50) NOT NULL,
    vch_date DATE NOT NULL,
    party_name VARCHAR(255),
    total_amount DECIMAL(15, 2),
    narration TEXT,
    is_deleted BOOLEAN DEFAULT FALSE, -- We never hard delete
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast retrieve by voucher number
CREATE INDEX idx_voucher_vchno ON voucher(vch_no);
CREATE INDEX idx_voucher_date ON voucher(vch_date);
CREATE INDEX idx_voucher_company ON voucher(company_id);

-- 4. Voucher Lines (The Double Entry splits)
CREATE TABLE voucher_line (
    id SERIAL PRIMARY KEY,
    voucher_id INT REFERENCES voucher(id) ON DELETE CASCADE,
    line_no INT,
    ledger_name VARCHAR(255) NOT NULL,
    debit DECIMAL(15, 2) DEFAULT 0.00,
    credit DECIMAL(15, 2) DEFAULT 0.00
);

-- Index for fast ledger lookups
CREATE INDEX idx_voucher_line_ledger ON voucher_line(ledger_name);
