import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('master_ledger')
export class MasterLedger {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId: string;

  @Column({ name: 'ledger_name', type: 'text' })
  ledgerName: string;

  @Column({ name: 'parent_group', type: 'text', nullable: true })
  parentGroup: string | null;

  @Column({ type: 'text', nullable: true })
  gstin: string | null;

  @Column({ name: 'is_party', type: 'boolean', default: false })
  isParty: boolean;

  @Column({ type: 'jsonb', default: {} })
  extra: Record<string, any>;
}
