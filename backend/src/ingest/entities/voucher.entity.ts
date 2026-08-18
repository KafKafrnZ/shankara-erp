import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { IngestBatch } from './ingest-batch.entity';
import { VoucherLine } from './voucher-line.entity';

@Entity('voucher')
export class Voucher {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId: string;

  @ManyToOne(() => IngestBatch)
  @JoinColumn({ name: 'batch_id' })
  batch: IngestBatch;

  @Column({ name: 'company_id', type: 'text' })
  companyId: string;

  @Column({ name: 'branch_id', type: 'text', nullable: true })
  branchId: string | null;

  @Column({ name: 'tally_guid', type: 'text', nullable: true })
  tallyGuid: string | null;

  @Column({ name: 'vch_no', type: 'text', nullable: true })
  vchNo: string | null;

  @Column({ name: 'vch_no_norm', type: 'text', nullable: true })
  vchNoNorm: string | null;

  @Column({ name: 'vch_type', type: 'text' })
  vchType: string;

  @Column({ name: 'vch_date', type: 'date' })
  vchDate: string;

  @Column({ name: 'party_name', type: 'text', nullable: true })
  partyName: string | null;

  @Column({ name: 'total_amount', type: 'numeric', precision: 15, scale: 2, nullable: true })
  totalAmount: string | null;

  @Column({ type: 'text', nullable: true })
  narration: string | null;

  @Column({ name: 'source_row_no', type: 'int', nullable: true })
  sourceRowNo: number | null;

  @Column({ type: 'jsonb', default: {} })
  extra: Record<string, any>;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ name: 'valid_from', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  validFrom: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => VoucherLine, line => line.voucher, { cascade: ['insert'] })
  lines: VoucherLine[];
}
