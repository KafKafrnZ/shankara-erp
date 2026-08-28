import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SourceFile } from '../../storage/entities/source-file.entity';

@Entity({ name: 'item_master_batch' })
export class ItemMasterBatch {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => SourceFile, { nullable: true })
  @JoinColumn({ name: 'source_file_id' })
  sourceFile: SourceFile | null;

  /** Null for a manual add/edit/delete — there's no uploaded file behind it. */
  @Column({ name: 'source_file_id', type: 'bigint', nullable: true })
  sourceFileId: string | null;

  @Column({ name: 'file_sha256', type: 'char', length: 64, unique: true })
  fileSha256: string;

  /** True for a batch created by manualUpsert/manualDelete rather than a
   *  real spreadsheet upload. */
  @Column({ name: 'is_manual', type: 'boolean', default: false })
  isManual: boolean;

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
