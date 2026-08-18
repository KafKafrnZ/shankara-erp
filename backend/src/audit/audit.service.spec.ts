import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditEvent } from './audit-event.entity';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditEvent),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('rejects unknown action', async () => {
    await expect(service.log({ action: 'explode' as any })).rejects.toThrow(/UNKNOWN_AUDIT_ACTION/);
  });

  it('rejects password in meta', async () => {
    await expect(
      service.log({ action: 'login', meta: { password: 'x' } })
    ).rejects.toThrow();
  });

  it('accepts valid action', async () => {
    await expect(
      service.log({ action: 'login', entityType: 'app_user', entityId: '1' })
    ).resolves.not.toThrow();
  });
});
