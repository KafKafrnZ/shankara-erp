import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsIn(['steward', 'finance', 'branch'])
  role?: 'steward' | 'finance' | 'branch';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branchId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
