import { Controller, Post, Body, Req, Get, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(loginDto, ip, userAgent);
  }

  @Post('logout')
  async logout(@Request() req: any) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.logout(req.user.id, ip, userAgent);
  }

  @Get('me')
  getProfile(@Request() req: any) {
    return req.user;
  }
}
