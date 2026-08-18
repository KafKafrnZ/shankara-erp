import { Controller, Post, Body, Get, Req, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { AuthUser } from './auth-user';

type AuthedRequest = Request & { user: AuthUser };

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(loginDto, ip, userAgent);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthedRequest) {
    return this.authService.logout(req.user.id, req.ip, req.headers['user-agent']);
  }

  @Get('me')
  getProfile(@Req() req: AuthedRequest) {
    return req.user;
  }
}
