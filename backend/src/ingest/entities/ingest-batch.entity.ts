import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ingest_batch')
export class IngestBatch {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'source_file_id', type: 'bigint' })
  sourceFileId: string;

  @Column({ name: 'file_sha256', type: 'char', length: 64, unique: true })
  fileSha256: string;

  @Column({ name: 'tally_company', type: 'text' })
  tallyCompany: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId: string;

  @Column({ name: 'branch_id', type: 'text', nullable: true })
  branchId: string | null;

  @Column({ name: 'report_type', type: 'text' })
  reportType: string;

  @Column({ name: 'period_from', type: 'date', nullable: true })
  periodFrom: Date | null;

  @Column({ name: 'period_to', type: 'date', nullable: true })
  periodTo: Date | null;

  @Column({ type: 'text' })
  status: string;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'accepted_rows', type: 'int', default: 0 })
  acceptedRows: number;

  @Column({ name: 'rejected_rows', type: 'int', default: 0 })
  rejectedRows: number;

  @Column({ name: 'debit_sum', type: 'numeric', precision: 18, scale: 2, nullable: true })
  debitSum: string | null;

  @Column({ name: 'credit_sum', type: 'numeric', precision: 18, scale: 2, nullable: true })
  creditSum: string | null;

  @Column({ name: 'error_summary', type: 'text', nullable: true })
  errorSummary: string | null;

  @Column({ name: 'uploaded_by', type: 'bigint' })
  uploadedBy: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by', type: 'bigint', nullable: true })
  publishedBy: string | null;
}
