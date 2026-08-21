export interface ParsedItemRow {
  itemCode: string;
  catalogueNo?: string;
  sapItemCode?: string;
  brand?: string;
  itemName: string;
  hsnDescription?: string;
  mainGroup?: string;
  subGroup?: string;
  uom?: string;
  alias?: string;
  extra?: Record<string, any>;
}

export interface ItemLayoutDetector {
  key: string;
  detect(headerRow: string[]): boolean;
  parseRow(row: any[], columns: Record<string, number>): ParsedItemRow | { skip: true; reason: string; code: string };
}
