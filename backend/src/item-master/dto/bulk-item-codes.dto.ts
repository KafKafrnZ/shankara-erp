import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

// Backs both the selection tray's "Copy details"/"Export to Excel" and a
// single item's own export — a single-item request is just an array of one.
export class BulkItemCodesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  itemCodes: string[];
}
