import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppUser } from './app-user.entity';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: AppUser['role'];
  companyId: string | null;
  branchId: string | null;
  isActive: boolean;
  createdAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AppUser)
    private usersRepository: Repository<AppUser>,
    private auditService: AuditService,
    private dataSource: DataSource,
  ) {}

  async findByEmail(email: string): Promise<AppUser | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<AppUser | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  toPublic(user: AppUser): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      companyId: user.companyId,
      branchId: user.branchId,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  async list(): Promise<PublicUser[]> {
    const users = await this.usersRepository.find({ order: { createdAt: 'ASC' } });
    return users.map((u) => this.toPublic(u));
  }

  async create(dto: CreateUserDto, actorId: string, ip?: string, userAgent?: string): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.usersRepository.create({
      email: dto.email.trim(),
      displayName: dto.displayName.trim(),
      role: dto.role,
      companyId: dto.companyId?.trim() || null,
      branchId: dto.branchId?.trim() || null,
      passwordHash,
      isActive: true,
    });
    try {
      await this.usersRepository.save(user);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('A person with that email already has access.');
      }
      throw err;
    }
    await this.auditService.log({
      userId: actorId,
      action: 'user_create',
      entityType: 'app_user',
      entityId: user.id,
      ip,
      userAgent,
      meta: { email: user.email, role: user.role },
    });
    return this.toPublic(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<PublicUser> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(AppUser, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('Person not found');

      const previousRole = user.role;
      const nextRole = dto.role ?? user.role;
      const nextActive = dto.isActive ?? user.isActive;
      const droppingSteward =
        user.role === 'steward' && user.isActive && (nextRole !== 'steward' || nextActive === false);
      if (droppingSteward) {
        const stewards = await manager
          .createQueryBuilder(AppUser, 'u')
          .where("u.role = 'steward'")
          .andWhere('u.is_active = true')
          .setLock('pessimistic_write')
          .getMany();
        if (stewards.filter((s) => s.id !== user.id).length < 1) {
          throw new BadRequestException(
            'There must be at least one office admin who can sign in. Give someone else that job first.',
          );
        }
      }

      if (dto.displayName !== undefined) user.displayName = dto.displayName.trim();
      if (dto.role !== undefined) user.role = dto.role;
      if (dto.companyId !== undefined) user.companyId = dto.companyId?.trim() || null;
      if (dto.branchId !== undefined) user.branchId = dto.branchId?.trim() || null;
      if (dto.isActive !== undefined) user.isActive = dto.isActive;

      if (dto.isActive === false || (dto.role !== undefined && dto.role !== previousRole)) {
        user.tokenVersion += 1;
      }

      await manager.save(user);
      await this.auditService.log({
        userId: actorId,
        action: 'user_update',
        entityType: 'app_user',
        entityId: user.id,
        ip,
        userAgent,
        meta: { isActive: user.isActive, role: user.role },
      }, manager);
      return this.toPublic(user);
    });
  }

  async resetPassword(
    id: string,
    newPassword: string,
    actorId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(AppUser, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('Person not found');
      user.passwordHash = passwordHash;
      user.tokenVersion += 1;
      await manager.save(user);
      await this.auditService.log({
        userId: actorId,
        action: 'user_password_reset',
        entityType: 'app_user',
        entityId: user.id,
        ip,
        userAgent,
        meta: { email: user.email },
      }, manager);
      return this.toPublic(user);
    });
  }

  async bumpTokenVersion(id: string): Promise<void> {
    await this.usersRepository.increment({ id }, 'tokenVersion', 1);
  }
}
