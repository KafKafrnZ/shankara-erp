import { ItemLayoutDetector, ParsedItemRow } from './item-layout-detector.interface';

function normalizeHeader(header: any): string {
  if (typeof header !== 'string') return '';
  // match daybook.detector.ts cleanHeader: trim, collapse whitespace, lowercase, strip trailing dot
  return header.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\.$/, '');
}

function matchHeaders(actual: any[], expected: string[]): boolean {
  const normActual = actual.map(normalizeHeader);
  return expected.every(exp => normActual.includes(exp));
}

// 1. SAP Item Master Detector
export const sapItemMasterDetector: ItemLayoutDetector = {
  key: 'sap_item_master_v1',
  detect(headerRow: any[]): boolean {
    const required = ['sap item code', 'catalogue no', 'brand', 'main group', 'uom'];
    return matchHeaders(headerRow, required);
  },
  parseRow(row: any[], columns: Record<string, number>): ParsedItemRow | { skip: true; reason: string; code: string } {
    const sapItemCode = row[columns['sap item code']];
    const catalogueNo = row[columns['catalogue no']];
    
    // Fallbacks since some files might have 'sap item description' or 'stock item name for searching'
    const itemName = row[columns['sap item description']] || row[columns['stock item name for searching']] || row[columns['stock item name for migration']];
    
    const brand = row[columns['brand']];
    const mainGroup = row[columns['main group']];
    const subGroup = row[columns['sub group']];
    const uom = row[columns['uom']];
    const hsnDescription = row[columns['hsn description']];
    const alias = row[columns['alias']];

    const itemCode = sapItemCode || catalogueNo;
    if (!itemCode) {
      return { skip: true, reason: 'Missing stable identifier (SAP Item Code / Catalogue No)', code: 'MISSING_ITEM_CODE' };
    }
    if (!itemName) {
      return { skip: true, reason: 'Missing item name', code: 'MISSING_ITEM_NAME' };
    }

    return {
      itemCode: String(itemCode),
      catalogueNo: catalogueNo ? String(catalogueNo) : undefined,
      sapItemCode: sapItemCode ? String(sapItemCode) : undefined,
      brand: brand ? String(brand) : undefined,
      itemName: String(itemName),
      hsnDescription: hsnDescription ? String(hsnDescription) : undefined,
      mainGroup: mainGroup ? String(mainGroup) : undefined,
      subGroup: subGroup ? String(subGroup) : undefined,
      uom: uom ? String(uom) : undefined,
      alias: alias ? String(alias) : undefined,
    };
  }
};

// 2. Master Code Detector
export const masterCodeDetector: ItemLayoutDetector = {
  key: 'master_code_v1',
  detect(headerRow: any[]): boolean {
    const required = ['catalogue no', 'brand', 'stock item name for migration', 'alias', 'main group', 'sub group', 'uom'];
    return matchHeaders(headerRow, required) && !normalizeHeader(headerRow[0]).match(/^$/); // Make sure it's not the blank first header layout
  },
  parseRow(row: any[], columns: Record<string, number>): ParsedItemRow | { skip: true; reason: string; code: string } {
    const alias = row[columns['alias']];
    const catalogueNo = row[columns['catalogue no']];
    const itemName = row[columns['stock item name for migration']];
    
    const brand = row[columns['brand']];
    const mainGroup = row[columns['main group']];
    const subGroup = row[columns['sub group']];
    const uom = row[columns['uom']];
    const hsnDescription = row[columns['hsn description']];

    const itemCode = alias || catalogueNo;
    if (!itemCode) {
      return { skip: true, reason: 'Missing stable identifier (Alias / Catalogue No)', code: 'MISSING_ITEM_CODE' };
    }
    if (!itemName) {
      return { skip: true, reason: 'Missing item name', code: 'MISSING_ITEM_NAME' };
    }

    return {
      itemCode: String(itemCode),
      catalogueNo: catalogueNo ? String(catalogueNo) : undefined,
      brand: brand ? String(brand) : undefined,
      itemName: String(itemName),
      hsnDescription: hsnDescription ? String(hsnDescription) : undefined,
      mainGroup: mainGroup ? String(mainGroup) : undefined,
      subGroup: subGroup ? String(subGroup) : undefined,
      uom: uom ? String(uom) : undefined,
      alias: alias ? String(alias) : undefined,
    };
  }
};

// 3. CP Sani Others Detector
export const cpSaniOthersDetector: ItemLayoutDetector = {
  key: 'cp_sani_others_v1',
  detect(headerRow: any[]): boolean {
    const required = ['stock item name', 'alias', 'main group', 'sub group', 'uom', 'category'];
    // First header cell is blank
    const isFirstBlank = !headerRow[0] || normalizeHeader(headerRow[0]) === '';
    return isFirstBlank && matchHeaders(headerRow, required);
  },
  parseRow(row: any[], columns: Record<string, number>): ParsedItemRow | { skip: true; reason: string; code: string } {
    // First column (index 0) is the code directly
    const directCode = row[0];
    const alias = row[columns['alias']];
    const itemName = row[columns['stock item name']];
    
    const brand = row[columns['brand']]; // Might not exist
    const mainGroup = row[columns['main group']];
    const subGroup = row[columns['sub group']];
    const uom = row[columns['uom']];
    const hsnDescription = row[columns['hsn description']];

    const itemCode = directCode || alias;
    if (!itemCode) {
      return { skip: true, reason: 'Missing stable identifier (Col 0 / Alias)', code: 'MISSING_ITEM_CODE' };
    }
    if (!itemName) {
      return { skip: true, reason: 'Missing item name', code: 'MISSING_ITEM_NAME' };
    }

    return {
      itemCode: String(itemCode),
      brand: brand ? String(brand) : undefined,
      itemName: String(itemName),
      hsnDescription: hsnDescription ? String(hsnDescription) : undefined,
      mainGroup: mainGroup ? String(mainGroup) : undefined,
      subGroup: subGroup ? String(subGroup) : undefined,
      uom: uom ? String(uom) : undefined,
      alias: alias ? String(alias) : undefined,
    };
  }
};

export const ITEM_LAYOUT_REGISTRY: ItemLayoutDetector[] = [
  sapItemMasterDetector,
  masterCodeDetector,
  cpSaniOthersDetector,
];

export function buildColumnMap(headerRow: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const val = normalizeHeader(headerRow[i]);
    if (val) {
      // Keep first occurrence to avoid overwriting with later empty/duplicate cols
      if (!(val in map)) {
        map[val] = i;
      }
    }
  }
  return map;
}
