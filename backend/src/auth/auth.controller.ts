import { Controller, Post, Body, Get, Req, Res, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { AuthUser } from './auth-user';
import { AUTH_COOKIE_NAME, authCookieOptions } from './auth-cookie';

type AuthedRequest = Request & { user: AuthUser };

@Controller('auth')
export class AuthController {
  private readonly isProd: boolean;

  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.isProd = configService.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    const { accessToken, user } = await this.authService.login(
      loginDto,
      ip,
      userAgent,
    );
    // Same token either way — the cookie is what the browser SPA
    // actually relies on (see JwtStrategy); accessToken stays in the
    // body too for a non-browser caller that wants to hold and send it
    // itself (scripts, the e2e suite).
    const { exp } = this.jwtService.decode<{ exp: number }>(accessToken);
    res.cookie(AUTH_COOKIE_NAME, accessToken, {
      ...authCookieOptions(this.isProd),
      maxAge: exp * 1000 - Date.now(),
    });
    return { accessToken, user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions(this.isProd));
    return this.authService.logout(
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('me')
  getProfile(@Req() req: AuthedRequest) {
    return req.user;
  }
}
