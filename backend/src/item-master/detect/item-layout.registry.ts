import {
  ItemLayoutDetector,
  ParsedItemRow,
} from './item-layout-detector.interface';

function normalizeHeader(header: any): string {
  if (typeof header !== 'string') return '';
  // trim, collapse whitespace, lowercase, strip trailing dot
  return header.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\.$/, '');
}

function matchHeaders(actual: any[], expected: string[]): boolean {
  const normActual = actual.map(normalizeHeader);
  return expected.every((exp) => normActual.includes(exp));
}

// Some real exports use a literal "-" (or similar) as an end-of-data /
// separator marker, not an actual value — confirmed live: a real row in
// the TILES sample file had item code, item name, main group, sub group,
// and UOM all literally "-", and was silently accepted as a real catalog
// item before this check existed. Treat that the same as genuinely empty.
export function isPlaceholderValue(v: any): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  if (s === '') return true;
  return /^[-–—.]+$/.test(s);
}

// 1. SAP Item Master Detector
export const sapItemMasterDetector: ItemLayoutDetector = {
  key: 'sap_item_master_v1',
  // Every header this layout maps into a fixed column — anything else in
  // the file lands in `extra` instead of being silently dropped.
  knownHeaderKeys: [
    'sap item code',
    'catalogue no',
    'brand',
    'main group',
    'sub group',
    'uom',
    'hsn description',
    'alias',
    'sap item description',
    'stock item name for searching',
    'stock item name for migration',
  ],
  detect(headerRow: any[]): boolean {
    const required = [
      'sap item code',
      'catalogue no',
      'brand',
      'main group',
      'uom',
    ];
    return matchHeaders(headerRow, required);
  },
  parseRow(
    row: any[],
    columns: Record<string, number>,
  ): ParsedItemRow | { skip: true; reason: string; code: string } {
    const sapItemCode = row[columns['sap item code']];
    const catalogueNo = row[columns['catalogue no']];

    // Fallbacks since some files might have 'sap item description' or 'stock item name for searching'
    const itemName =
      row[columns['sap item description']] ||
      row[columns['stock item name for searching']] ||
      row[columns['stock item name for migration']];

    const brand = row[columns['brand']];
    const mainGroup = row[columns['main group']];
    const subGroup = row[columns['sub group']];
    const uom = row[columns['uom']];
    const hsnDescription = row[columns['hsn description']];
    const alias = row[columns['alias']];

    const itemCode = sapItemCode || catalogueNo;
    if (isPlaceholderValue(itemCode)) {
      return {
        skip: true,
        reason: 'Missing stable identifier (SAP Item Code / Catalogue No)',
        code: 'MISSING_ITEM_CODE',
      };
    }
    if (isPlaceholderValue(itemName)) {
      return {
        skip: true,
        reason: 'Missing item name',
        code: 'MISSING_ITEM_NAME',
      };
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
  },
};

// 2. Master Code Detector
export const masterCodeDetector: ItemLayoutDetector = {
  key: 'master_code_v1',
  knownHeaderKeys: [
    'catalogue no',
    'brand',
    'stock item name for migration',
    'alias',
    'main group',
    'sub group',
    'uom',
    'hsn description',
    // Present on the SAP item-master sheet; some master-code files carry
    // it too. Capture into the fixed field so export/copy don't have to
    // fish it out of extra.
    'sap item code',
  ],
  detect(headerRow: any[]): boolean {
    const required = [
      'catalogue no',
      'brand',
      'stock item name for migration',
      'alias',
      'main group',
      'sub group',
      'uom',
    ];
    return (
      matchHeaders(headerRow, required) &&
      !normalizeHeader(headerRow[0]).match(/^$/)
    ); // Make sure it's not the blank first header layout
  },
  parseRow(
    row: any[],
    columns: Record<string, number>,
  ): ParsedItemRow | { skip: true; reason: string; code: string } {
    const alias = row[columns['alias']];
    const catalogueNo = row[columns['catalogue no']];
    const sapItemCode = row[columns['sap item code']];
    const itemName = row[columns['stock item name for migration']];

    const brand = row[columns['brand']];
    const mainGroup = row[columns['main group']];
    const subGroup = row[columns['sub group']];
    const uom = row[columns['uom']];
    const hsnDescription = row[columns['hsn description']];

    const itemCode = alias || catalogueNo || sapItemCode;
    if (isPlaceholderValue(itemCode)) {
      return {
        skip: true,
        reason: 'Missing stable identifier (Alias / Catalogue No)',
        code: 'MISSING_ITEM_CODE',
      };
    }
    if (isPlaceholderValue(itemName)) {
      return {
        skip: true,
        reason: 'Missing item name',
        code: 'MISSING_ITEM_NAME',
      };
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
  },
};

// 3. CP Sani Others Detector
export const cpSaniOthersDetector: ItemLayoutDetector = {
  key: 'cp_sani_others_v1',
  // 'category' is required for detection but was never captured into a
  // fixed field — leave it out of this list so it flows into `extra`
  // instead of being dropped.
  knownHeaderKeys: [
    'stock item name',
    'alias',
    'main group',
    'sub group',
    'uom',
    'brand',
    'hsn description',
    'sap item code',
  ],
  detect(headerRow: any[]): boolean {
    const required = [
      'stock item name',
      'alias',
      'main group',
      'sub group',
      'uom',
      'category',
    ];
    // First header cell is blank
    const isFirstBlank = !headerRow[0] || normalizeHeader(headerRow[0]) === '';
    return isFirstBlank && matchHeaders(headerRow, required);
  },
  parseRow(
    row: any[],
    columns: Record<string, number>,
  ): ParsedItemRow | { skip: true; reason: string; code: string } {
    // First column (index 0) is the code directly
    const directCode = row[0];
    const alias = row[columns['alias']];
    const sapItemCode = row[columns['sap item code']];
    const itemName = row[columns['stock item name']];

    const brand = row[columns['brand']]; // Might not exist
    const mainGroup = row[columns['main group']];
    const subGroup = row[columns['sub group']];
    const uom = row[columns['uom']];
    const hsnDescription = row[columns['hsn description']];

    const itemCode = directCode || alias;
    if (isPlaceholderValue(itemCode)) {
      return {
        skip: true,
        reason: 'Missing stable identifier (Col 0 / Alias)',
        code: 'MISSING_ITEM_CODE',
      };
    }
    if (isPlaceholderValue(itemName)) {
      return {
        skip: true,
        reason: 'Missing item name',
        code: 'MISSING_ITEM_NAME',
      };
    }

    return {
      itemCode: String(itemCode),
      sapItemCode: sapItemCode ? String(sapItemCode) : undefined,
      brand: brand ? String(brand) : undefined,
      itemName: String(itemName),
      hsnDescription: hsnDescription ? String(hsnDescription) : undefined,
      mainGroup: mainGroup ? String(mainGroup) : undefined,
      subGroup: subGroup ? String(subGroup) : undefined,
      uom: uom ? String(uom) : undefined,
      alias: alias ? String(alias) : undefined,
    };
  },
};

// 4. Generic Alias-Keyed Detector — permissive fallback for any file that
// simply has an Alias column, whatever else it does or doesn't have. Alias
// is the primary key; every other recognized field is filled in if present,
// anything else flows into `extra` same as the other layouts. Deliberately
// loose on purpose — tighten this once we know what a real, reliable Excel
// structure looks like. Must stay last in the registry: the stricter
// layouts above all include "alias" too and should win first when they fit.
export const genericAliasDetector: ItemLayoutDetector = {
  key: 'generic_alias_v1',
  knownHeaderKeys: [
    'alias',
    'stock item name',
    'stock item name for migration',
    'sap item description',
    'stock item name for searching',
    'brand',
    'main group',
    'sub group',
    'uom',
    'hsn description',
    'catalogue no',
    'sap item code',
  ],
  detect(headerRow: any[]): boolean {
    return matchHeaders(headerRow, ['alias']);
  },
  parseRow(
    row: any[],
    columns: Record<string, number>,
  ): ParsedItemRow | { skip: true; reason: string; code: string } {
    const alias = row[columns['alias']];
    const itemName =
      row[columns['stock item name']] ||
      row[columns['stock item name for migration']] ||
      row[columns['sap item description']] ||
      row[columns['stock item name for searching']];

    const catalogueNo = row[columns['catalogue no']];
    const sapItemCode = row[columns['sap item code']];
    const brand = row[columns['brand']];
    const mainGroup = row[columns['main group']];
    const subGroup = row[columns['sub group']];
    const uom = row[columns['uom']];
    const hsnDescription = row[columns['hsn description']];

    if (isPlaceholderValue(alias)) {
      return {
        skip: true,
        reason: 'Missing stable identifier (Alias)',
        code: 'MISSING_ITEM_CODE',
      };
    }
    if (isPlaceholderValue(itemName)) {
      return {
        skip: true,
        reason: 'Missing item name',
        code: 'MISSING_ITEM_NAME',
      };
    }

    return {
      itemCode: String(alias),
      alias: String(alias),
      catalogueNo: catalogueNo ? String(catalogueNo) : undefined,
      sapItemCode: sapItemCode ? String(sapItemCode) : undefined,
      brand: brand ? String(brand) : undefined,
      itemName: String(itemName),
      hsnDescription: hsnDescription ? String(hsnDescription) : undefined,
      mainGroup: mainGroup ? String(mainGroup) : undefined,
      subGroup: subGroup ? String(subGroup) : undefined,
      uom: uom ? String(uom) : undefined,
    };
  },
};

export const ITEM_LAYOUT_REGISTRY: ItemLayoutDetector[] = [
  sapItemMasterDetector,
  masterCodeDetector,
  cpSaniOthersDetector,
  genericAliasDetector,
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

/** Extra-column labels from a recognized sheet's header, in sheet order.
 *  Empty columns still count — copy/export has to show every field the
 *  file had, whether a given row filled it in or not. */
export function extraHeadersFromHeaderRow(
  headerRow: any[],
  knownHeaderKeys: string[],
): string[] {
  const columnMap = buildColumnMap(headerRow);
  const known = new Set(knownHeaderKeys);
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const [normalized, colIndex] of Object.entries(columnMap)) {
    if (known.has(normalized)) continue;
    const label = String(headerRow[colIndex] ?? '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}
