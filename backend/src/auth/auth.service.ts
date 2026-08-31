import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
        meta: {
          email: loginDto.email,
          reason: !user ? 'not_found' : 'inactive',
        },
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

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      ver: user.tokenVersion,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: toAuthUser(user),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      await bcrypt.compare(currentPassword, this.dummyHash);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      await bcrypt.compare(currentPassword, this.dummyHash);
      await this.auditService.log({
        userId: user.id,
        action: 'login_failed',
        entityType: 'app_user',
        entityId: user.id,
        ip,
        userAgent,
        meta: { email: user.email, reason: 'invalid_password_change' },
      });
      throw new UnauthorizedException(
        'That current password is not right.',
      );
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'Choose a different password than the one you already have.',
      );
    }

    const publicUser = await this.usersService.resetPassword(
      user.id,
      newPassword,
      user.id,
      ip,
      userAgent,
      'user_password_change',
    );

    const fresh = await this.usersService.findById(user.id);
    if (!fresh) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = {
      sub: fresh.id,
      role: fresh.role,
      ver: fresh.tokenVersion,
    };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken, user: publicUser };
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
