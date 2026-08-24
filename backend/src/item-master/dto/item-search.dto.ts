import { IsOptional, IsString, Length, IsInt, Min, Max, IsObject } from 'class-validator';
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

  /** Field name -> value, from "+ Add filter". Trimmed, capped, and only
   *  ever bound as a query parameter — see ItemSearchService.search(). */
  @IsOptional()
  @IsObject()
  extra?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  offset?: number = 0;
}
