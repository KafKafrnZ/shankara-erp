export type ItemKeyKind = 'sapItemCode' | 'alias' | 'catalogueNo' | 'itemCode';

export type ItemKeyFields = {
  layoutKey?: string | null;
  itemCode: string;
  sapItemCode?: string | null;
  alias?: string | null;
  catalogueNo?: string | null;
};

export type ItemPrimaryKey = {
  kind: ItemKeyKind;
  label: string;
  value: string;
};

const LABEL: Record<ItemKeyKind, string> = {
  sapItemCode: 'SAP code',
  alias: 'Alias',
  catalogueNo: 'Catalogue no',
  itemCode: 'Item code',
};

function nonempty(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Which field is the stable identifier for this row.
 *
 * Chosen at ingest from the sheet layout (SAP item master → SAP code,
 * master-code sheet → alias, CP/sani sheet → the first-column code).
 * Falls back to whichever stored field actually equals itemCode so older
 * rows still light up the right cell.
 */
export function itemPrimaryKey(row: ItemKeyFields): ItemPrimaryKey {
  const layout = (row.layoutKey || '').trim();

  if (layout === 'sap_item_master_v1') {
    if (nonempty(row.sapItemCode)) return { kind: 'sapItemCode', label: LABEL.sapItemCode, value: row.sapItemCode };
    if (nonempty(row.catalogueNo)) return { kind: 'catalogueNo', label: LABEL.catalogueNo, value: row.catalogueNo };
  }
  if (layout === 'master_code_v1') {
    if (nonempty(row.alias)) return { kind: 'alias', label: LABEL.alias, value: row.alias };
    if (nonempty(row.catalogueNo)) return { kind: 'catalogueNo', label: LABEL.catalogueNo, value: row.catalogueNo };
  }
  if (layout === 'cp_sani_others_v1' && nonempty(row.itemCode)) {
    return { kind: 'itemCode', label: LABEL.itemCode, value: row.itemCode };
  }

  if (nonempty(row.sapItemCode) && row.sapItemCode === row.itemCode) {
    return { kind: 'sapItemCode', label: LABEL.sapItemCode, value: row.sapItemCode };
  }
  if (nonempty(row.alias) && row.alias === row.itemCode) {
    return { kind: 'alias', label: LABEL.alias, value: row.alias };
  }
  if (nonempty(row.catalogueNo) && row.catalogueNo === row.itemCode) {
    return { kind: 'catalogueNo', label: LABEL.catalogueNo, value: row.catalogueNo };
  }

  return { kind: 'itemCode', label: LABEL.itemCode, value: row.itemCode };
}
