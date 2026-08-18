import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsOptional()
  autoPublish?: string | boolean;
}
