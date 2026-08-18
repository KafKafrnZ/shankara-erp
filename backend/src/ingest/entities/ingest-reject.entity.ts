import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { IngestBatch } from './ingest-batch.entity';

@Entity('ingest_reject')
export class IngestReject {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId: string;

  @ManyToOne(() => IngestBatch)
  @JoinColumn({ name: 'batch_id' })
  batch: IngestBatch;

  @Column({ name: 'source_row_no', type: 'int' })
  sourceRowNo: number;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  raw: any;
}
