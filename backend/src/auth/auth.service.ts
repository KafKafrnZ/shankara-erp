import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, toAuthUser } from './auth-user';

@Injectable()
export class AuthService {
  private readonly dummyHash: string;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {
    this.dummyHash = bcrypt.hashSync('not-a-real-password', 10);
  }

  async login(loginDto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.usersService.findByEmail(loginDto.email);
    
    if (!user || !user.isActive) {
      await bcrypt.compare(loginDto.password, this.dummyHash);
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

    const payload: JwtPayload = { sub: user.id, role: user.role, ver: user.tokenVersion };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: toAuthUser(user),
    };
  }

  async logout(userId: string, ip?: string, userAgent?: string) {
    await this.usersService.bumpTokenVersion(userId);
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
