import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @IsIn(['steward', 'finance', 'branch'])
  role: 'steward' | 'finance' | 'branch';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branchId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
