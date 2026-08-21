import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SourceFile } from '../../ingest/entities/source-file.entity';

@Entity({ name: 'item_master_batch' })
export class ItemMasterBatch {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => SourceFile)
  @JoinColumn({ name: 'source_file_id' })
  sourceFile: SourceFile;

  @Column({ name: 'source_file_id', type: 'bigint' })
  sourceFileId: string;

  @Column({ name: 'file_sha256', type: 'char', length: 64, unique: true })
  fileSha256: string;

  @Column({ name: 'uploaded_by', type: 'bigint' })
  uploadedBy: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;

  @Column({ name: 'status', type: 'text' })
  status: string;

  @Column({ name: 'total_sheets', type: 'int', default: 0 })
  totalSheets: number;

  @Column({ name: 'recognized_sheets', type: 'int', default: 0 })
  recognizedSheets: number;

  @Column({ name: 'skipped_sheets', type: 'int', default: 0 })
  skippedSheets: number;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'accepted_rows', type: 'int', default: 0 })
  acceptedRows: number;

  @Column({ name: 'skipped_rows', type: 'int', default: 0 })
  skippedRows: number;

  @Column({ name: 'error_summary', type: 'text', nullable: true })
  errorSummary: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by', type: 'bigint', nullable: true })
  publishedBy: string | null;
}
