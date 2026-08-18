import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './auth-user';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async login(loginDto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.usersService.findByEmail(loginDto.email);
    
    if (!user || !user.isActive) {
      await this.auditService.log({
        userId: user ? user.id : null,
        action: 'login_failed',
        entityType: 'app_user',
        entityId: user ? user.id : undefined,
        ip,
        userAgent,
        meta: { email: loginDto.email, reason: !user ? 'not_found' : 'inactive' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      await this.auditService.log({
        userId: user.id,
        action: 'login_failed',
        entityType: 'app_user',
        entityId: user.id,
        ip,
        userAgent,
        meta: { email: loginDto.email, reason: 'invalid_password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.auditService.log({
      userId: user.id,
      action: 'login',
      entityType: 'app_user',
      entityId: user.id,
      ip,
      userAgent,
      meta: { email: user.email },
    });

    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
    };
  }

  async logout(userId: string, ip?: string, userAgent?: string) {
    await this.auditService.log({
      userId,
      action: 'logout',
      entityType: 'app_user',
      entityId: userId,
      ip,
      userAgent,
    });
    return { ok: true };
  }
}
