import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { AppUser } from './app-user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppUser])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
