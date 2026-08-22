import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../auth/auth-user';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

type AuthedRequest = Request & { user: AuthUser };

@Roles('steward')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AuthedRequest) {
    return this.usersService.create(dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthedRequest,
  ) {
    return this.usersService.update(String(id), dto, req.user.id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/reset-password')
  resetPassword(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthedRequest,
  ) {
    return this.usersService.resetPassword(
      String(id),
      dto.newPassword,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
