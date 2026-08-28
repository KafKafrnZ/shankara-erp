import { describe, it, expect } from 'vitest';
import { itemPrimaryKey } from './item-key.ts';

describe('itemPrimaryKey', () => {
  it('picks sapItemCode for the SAP item master layout', () => {
    const key = itemPrimaryKey({
      layoutKey: 'sap_item_master_v1',
      itemCode: 'ROW-1',
      sapItemCode: 'SAP-001',
      catalogueNo: 'CAT-001',
    });
    expect(key).toEqual({ kind: 'sapItemCode', label: 'SAP code', value: 'SAP-001' });
  });

  it('falls back to catalogueNo on the SAP layout when sapItemCode is blank', () => {
    const key = itemPrimaryKey({
      layoutKey: 'sap_item_master_v1',
      itemCode: 'ROW-1',
      sapItemCode: '   ',
      catalogueNo: 'CAT-001',
    });
    expect(key).toEqual({ kind: 'catalogueNo', label: 'Catalogue no', value: 'CAT-001' });
  });

  it('picks alias for the master-code layout', () => {
    const key = itemPrimaryKey({
      layoutKey: 'master_code_v1',
      itemCode: 'ROW-2',
      alias: 'ALIAS-002',
    });
    expect(key).toEqual({ kind: 'alias', label: 'Alias', value: 'ALIAS-002' });
  });

  it('picks itemCode itself for the CP/sani layout', () => {
    const key = itemPrimaryKey({
      layoutKey: 'cp_sani_others_v1',
      itemCode: 'CP-003',
    });
    expect(key).toEqual({ kind: 'itemCode', label: 'Item code', value: 'CP-003' });
  });

  it('falls back to whichever stored field equals itemCode when layoutKey is unknown/missing', () => {
    const key = itemPrimaryKey({
      layoutKey: null,
      itemCode: 'SAP-004',
      sapItemCode: 'SAP-004',
      alias: 'unrelated',
    });
    expect(key).toEqual({ kind: 'sapItemCode', label: 'SAP code', value: 'SAP-004' });
  });

  it('defaults to itemCode when nothing else matches', () => {
    const key = itemPrimaryKey({
      layoutKey: 'some_future_layout',
      itemCode: 'PLAIN-005',
      sapItemCode: 'unrelated',
      alias: 'also-unrelated',
      catalogueNo: 'still-unrelated',
    });
    expect(key).toEqual({ kind: 'itemCode', label: 'Item code', value: 'PLAIN-005' });
  });

  it('treats a whitespace-only field as blank, not a real value', () => {
    const key = itemPrimaryKey({
      layoutKey: 'master_code_v1',
      itemCode: 'ROW-6',
      alias: '   ',
      catalogueNo: '   ',
    });
    expect(key).toEqual({ kind: 'itemCode', label: 'Item code', value: 'ROW-6' });
  });
});
