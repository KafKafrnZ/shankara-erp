import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './audit-event.entity';

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
    entityId?: string;
    ip?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
  }) {
    const event = this.auditRepository.create({
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      meta: params.meta || {},
    });
    await this.auditRepository.save(event);
  }
}
