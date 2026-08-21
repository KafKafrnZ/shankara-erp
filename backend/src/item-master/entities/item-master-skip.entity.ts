import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ItemMasterBatch } from './item-master-batch.entity';

@Entity({ name: 'item_master_skip' })
export class ItemMasterSkip {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => ItemMasterBatch)
  @JoinColumn({ name: 'batch_id' })
  batch: ItemMasterBatch;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId: string;

  @Column({ name: 'sheet_name', type: 'text' })
  sheetName: string;

  @Column({ name: 'source_row_no', type: 'int', nullable: true })
  sourceRowNo: number | null;

  @Column({ name: 'code', type: 'text' })
  code: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'raw', type: 'jsonb', nullable: true })
  raw: any | null;
}
