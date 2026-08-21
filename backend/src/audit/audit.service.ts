import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuditEvent } from './audit-event.entity';

export const AUDIT_ACTIONS = [
  'login', 'login_failed', 'logout',
  'upload', 'publish', 'unpublish',
  'search', 'voucher_open',
  'item_upload', 'item_publish', 'item_hold',
  'item_collision_warn', 'job_status_override_warn',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private auditRepository: Repository<AuditEvent>,
  ) {}

  async log(params: {
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string | number;
    ip?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
  }, manager?: EntityManager) {
    if (!AUDIT_ACTIONS.includes(params.action as AuditAction)) {
      throw new Error(`UNKNOWN_AUDIT_ACTION: ${params.action}`);
    }

    if (params.meta) {
      const keys = Object.keys(params.meta).map(k => k.toLowerCase());
      if (keys.includes('password') || keys.includes('accesstoken')) {
        throw new Error('Censored data in meta');
      }
    }

    const event = this.auditRepository.create({
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType || null,
      entityId: params.entityId ? String(params.entityId) : null,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      meta: params.meta || {},
    });

    if (manager) {
      await manager.save(event);
    } else {
      await this.auditRepository.save(event);
    }
  }
}
