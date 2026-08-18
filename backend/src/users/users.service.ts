import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppUser } from './app-user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AppUser)
    private usersRepository: Repository<AppUser>,
  ) {}

  async findByEmail(email: string): Promise<AppUser | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<AppUser | null> {
    return this.usersRepository.findOne({ where: { id } });
  }
}
