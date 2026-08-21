import { IsOptional, IsString, Length, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemSearchDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  q?: string;

  @IsOptional()
  @IsString()
  mainGroup?: string;

  @IsOptional()
  @IsString()
  subGroup?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}
