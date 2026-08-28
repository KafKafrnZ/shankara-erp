import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtPayload, toAuthUser } from './auth-user';
import { AUTH_COOKIE_NAME } from './auth-cookie';

function fromCookie(req: Request): string | null {
  return req?.cookies?.[AUTH_COOKIE_NAME] || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      // The browser SPA authenticates via the httpOnly cookie only (see
      // AuthController.login) — it never sees a raw token to put in a
      // header. The Authorization/Bearer path stays supported for
      // non-browser callers (scripts, the e2e suite, a future API
      // client) that explicitly hold and send a token; that path carries
      // no CSRF exposure since nothing attaches it automatically.
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    const tokenVer = payload.ver ?? 0;
    if (tokenVer !== user.tokenVersion) {
      throw new UnauthorizedException();
    }
    return toAuthUser(user);
  }
}
