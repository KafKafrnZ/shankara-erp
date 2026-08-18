import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_event')
export class AuditEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: string | null;

  @Column({ type: 'text' })
  action: string;

  @Column({ name: 'entity_type', type: 'text', nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'text', nullable: true })
  entityId: string | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: {} })
  meta: any;
}
