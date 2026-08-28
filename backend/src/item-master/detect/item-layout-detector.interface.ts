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
  /** Normalized header strings this layout already maps into a fixed
   *  field — everything else in the file's header row becomes `extra`. */
  knownHeaderKeys: string[];
  detect(headerRow: string[]): boolean;
  parseRow(
    row: any[],
    columns: Record<string, number>,
  ): ParsedItemRow | { skip: true; reason: string; code: string };
}
