import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ItemMasterBatch } from './item-master-batch.entity';

@Entity({ name: 'item_master_row' })
export class ItemMasterRow {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => ItemMasterBatch)
  @JoinColumn({ name: 'batch_id' })
  batch: ItemMasterBatch;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId: string;

  @Column({ name: 'layout_key', type: 'text' })
  layoutKey: string;

  @Column({ name: 'item_code', type: 'text' })
  itemCode: string;

  @Column({ name: 'catalogue_no', type: 'text', nullable: true })
  catalogueNo: string | null;

  @Column({ name: 'sap_item_code', type: 'text', nullable: true })
  sapItemCode: string | null;

  @Column({ name: 'brand', type: 'text', nullable: true })
  brand: string | null;

  @Column({ name: 'item_name', type: 'text' })
  itemName: string;

  @Column({ name: 'hsn_description', type: 'text', nullable: true })
  hsnDescription: string | null;

  @Column({ name: 'main_group', type: 'text', nullable: true })
  mainGroup: string | null;

  @Column({ name: 'sub_group', type: 'text', nullable: true })
  subGroup: string | null;

  @Column({ name: 'uom', type: 'text', nullable: true })
  uom: string | null;

  @Column({ name: 'alias', type: 'text', nullable: true })
  alias: string | null;

  @Column({ name: 'source_row_no', type: 'int', nullable: true })
  sourceRowNo: number | null;

  @Column({ name: 'extra', type: 'jsonb', default: {} })
  extra: any;

  @Column({ name: 'fingerprint', type: 'text' })
  fingerprint: string;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
