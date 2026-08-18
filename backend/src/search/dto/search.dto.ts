import { IsOptional, IsString, IsInt, Min, Max, IsDateString, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  q?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  vchType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}
