import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Voucher } from './voucher.entity';

@Entity('voucher_line')
export class VoucherLine {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'voucher_id', type: 'bigint' })
  voucherId: string;

  @ManyToOne(() => Voucher, v => v.lines)
  @JoinColumn({ name: 'voucher_id' })
  voucher: Voucher;

  @Column({ name: 'line_no', type: 'int' })
  lineNo: number;

  @Column({ name: 'ledger_name', type: 'text' })
  ledgerName: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: '0.00' })
  debit: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: '0.00' })
  credit: string;

  @Column({ type: 'jsonb', default: {} })
  extra: Record<string, any>;
}
