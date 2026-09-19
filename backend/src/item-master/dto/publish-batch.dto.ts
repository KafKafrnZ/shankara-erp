import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

export class PublishBatchDto {
  @IsOptional()
  @IsIn(['new', 'existing'])
  destination?: 'new' | 'existing';

  @ValidateIf((o: PublishBatchDto) => o.destination === 'new')
  @IsOptional()
  @IsString()
  @Length(1, 200)
  sheetName?: string;

  @ValidateIf((o: PublishBatchDto) => o.destination === 'existing')
  @Type(() => Number)
  @IsInt()
  targetBatchId?: number;
}
