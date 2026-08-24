import { IsNotEmpty, IsOptional, IsString, IsObject, Length } from 'class-validator';

// Mirrors ParsedItemRow — same required fields the file-upload parsers
// already enforce (item code + item name), so a manually-entered row can't
// end up in a state a real upload could never produce.
export class ManualItemDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  itemCode: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  itemName: string;

  @IsOptional()
  @IsString()
  catalogueNo?: string;

  @IsOptional()
  @IsString()
  sapItemCode?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  hsnDescription?: string;

  @IsOptional()
  @IsString()
  mainGroup?: string;

  @IsOptional()
  @IsString()
  subGroup?: string;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, string>;
}
