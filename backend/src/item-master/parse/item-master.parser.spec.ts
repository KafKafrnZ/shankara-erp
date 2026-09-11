import { parseItemMasterStream } from './item-master.parser';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

describe('ItemMasterParser', () => {
  it('should parse master code layout with formula resolution', async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      'fixtures/item-master/test-fixture-1.xlsx',
    );
    const result = await parseItemMasterStream(fixturePath);

    expect(result.recognizedSheets).toBe(1);
    expect(result.skippedSheets).toBe(0);
    expect(result.acceptedRows).toBe(1);
    expect(result.skippedRows).toBe(0);

    const item = result.items[0];
    expect(item.brand).toBe('TEST_BRAND');
    expect(item.itemName).toBe('TEST_ITEM_NAME');
    expect(item.itemCode).toBe('TEST_ALIAS');

    // Ensure no [object Object] is present
    const stringified = JSON.stringify(result.items);
    expect(stringified).not.toContain('[object Object]');
  });

  it('should parse sap item master layout with formula resolution', async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      'fixtures/item-master/sap-fixture.xlsx',
    );
    const result = await parseItemMasterStream(fixturePath);

    expect(result.recognizedSheets).toBe(1);
    expect(result.acceptedRows).toBe(1);

    const item = result.items[0];
    expect(item.brand).toBe('Nike');
    expect(item.itemName).toBe('Super Sneaker'); // resolved from formula
    expect(item.itemCode).toBe('SAP123');

    const stringified = JSON.stringify(result.items);
    expect(stringified).not.toContain('[object Object]');
  });

  it('should parse cp sani others layout with formula resolution', async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      'fixtures/item-master/cp-fixture.xlsx',
    );
    const result = await parseItemMasterStream(fixturePath);

    expect(result.recognizedSheets).toBe(1);
    expect(result.acceptedRows).toBe(1);

    const item = result.items[0];
    expect(item.brand).toBe('Ashirvad'); // resolved from formula
    expect(item.itemName).toBe('Pipe 2"');
    expect(item.itemCode).toBe('CP123'); // from blank header col

    const stringified = JSON.stringify(result.items);
    expect(stringified).not.toContain('[object Object]');
  });

  it('captures a column the layout does not recognize into extra', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    // master_code_v1 layout header, plus one column with no fixed home.
    sheet.addRow([
      'Item Type',
      'Catalogue No',
      'Brand',
      'Stock Item Name for Migration',
      'Alias',
      'Main Group',
      'Sub Group',
      'UOM',
      'GST Rate',
    ]);
    sheet.addRow([
      'Finished',
      'CAT001',
      'TEST_BRAND',
      'Extra Column Item',
      'ALIAS001',
      'GROUP1',
      'SUBGROUP1',
      'PCS',
      '18%',
    ]);

    const tmpPath = path.join(os.tmpdir(), `extra-capture-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(tmpPath);
    try {
      const result = await parseItemMasterStream(tmpPath);
      expect(result.acceptedRows).toBe(1);

      const item = result.items[0];
      expect(item.layoutKey).toBe('master_code_v1');
      // 'Item Type' (column 0) has no fixed home in this layout either —
      // both unmapped columns should be captured, not just one.
      expect(item.extra).toEqual({
        'GST Rate': '18%',
        'Item Type': 'Finished',
      });
      // Fields the layout already maps into a fixed column must not also
      // duplicate into extra.
      expect(item.extra).not.toHaveProperty('Brand');
      expect(item.extra).not.toHaveProperty('Catalogue No');
      // Empty extra columns still belong on the batch header list so
      // copy/export can pad them. This fixture has no blank extra col;
      // the next test covers that case.
      expect(result.extraHeaders).toEqual(['Item Type', 'GST Rate']);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('records empty extra columns on extraHeaders so export can pad them', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow([
      'Catalogue No',
      'Brand',
      'Stock Item Name for Migration',
      'Alias',
      'Main Group',
      'Sub Group',
      'UOM',
      'SAP Item Code',
      'MRP Value',
      'GST Rate',
    ]);
    sheet.addRow([
      'CAT002',
      'TEST_BRAND',
      'Blank Extra Item',
      'ALIAS002',
      'GROUP1',
      'SUBGROUP1',
      'PCS',
      'SAP-002',
      '',
      '18%',
    ]);

    const tmpPath = path.join(os.tmpdir(), `empty-extra-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(tmpPath);
    try {
      const result = await parseItemMasterStream(tmpPath);
      expect(result.acceptedRows).toBe(1);
      const item = result.items[0];
      expect(item.sapItemCode).toBe('SAP-002');
      expect(item.extra).toEqual({ 'GST Rate': '18%' });
      expect(item.extra).not.toHaveProperty('MRP Value');
      expect(result.extraHeaders).toEqual(['MRP Value', 'GST Rate']);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  const MASTER_HEADERS = [
    'Item Type',
    'Catalogue No',
    'Brand',
    'Stock Item Name for Migration',
    'Alias',
    'Main Group',
    'Sub Group',
    'UOM',
    'GST Rate',
  ];
  const MASTER_ROW = [
    'Finished',
    'CAT001',
    'TEST_BRAND',
    'Extra Column Item',
    'ALIAS001',
    'GROUP1',
    'SUBGROUP1',
    'PCS',
    '18%',
  ];

  it('parses the same master-code layout from a CSV', async () => {
    const csv =
      MASTER_HEADERS.map((h) => `"${h}"`).join(',') +
      '\n' +
      MASTER_ROW.map((c) => `"${c}"`).join(',') +
      '\n';
    const tmpPath = path.join(os.tmpdir(), `csv-capture-${Date.now()}.csv`);
    fs.writeFileSync(tmpPath, csv);
    try {
      const result = await parseItemMasterStream(tmpPath);
      expect(result.recognizedSheets).toBe(1);
      expect(result.acceptedRows).toBe(1);
      expect(result.items[0].itemCode).toBe('ALIAS001');
      expect(result.items[0].extra).toEqual({
        'GST Rate': '18%',
        'Item Type': 'Finished',
      });
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('falls back to Alias as the key when no stricter layout matches', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    // Shape of a raw Tally stock-item export: named "Stock Item Name" in
    // column A (not blank), so cp_sani_others_v1 does not match. Only
    // 'Alias' plus a few recognized names are required for the fallback.
    sheet.addRow([
      'Stock Item Name',
      'Alias',
      'Main Group',
      'Sub Group',
      'UOM',
      'Category',
      'Part No',
    ]);
    sheet.addRow([
      'B2210101XX - U SHAPED RAIL - CERA',
      'BAHCERB2jgfkcutkrcrck',
      'NSTL ACCESSORIES & HARDWARE',
      'AH-CERA',
      'PCS',
      'CERA',
      'B2210101XX',
    ]);

    const tmpPath = path.join(os.tmpdir(), `generic-alias-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(tmpPath);
    try {
      const result = await parseItemMasterStream(tmpPath);
      expect(result.recognizedSheets).toBe(1);
      expect(result.acceptedRows).toBe(1);

      const item = result.items[0];
      expect(item.layoutKey).toBe('generic_alias_v1');
      expect(item.itemCode).toBe('BAHCERB2jgfkcutkrcrck');
      expect(item.alias).toBe('BAHCERB2jgfkcutkrcrck');
      expect(item.itemName).toBe('B2210101XX - U SHAPED RAIL - CERA');
      expect(item.mainGroup).toBe('NSTL ACCESSORIES & HARDWARE');
      // Not a fixed field on this layout — must still show up, not drop.
      expect(item.extra).toEqual({
        Category: 'CERA',
        'Part No': 'B2210101XX',
      });
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('reports a small unrecognized sheet instead of silently producing nothing', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    // Fewer than 20 rows and no 'Alias' column at all — used to hit EOF
    // before the old 20-row check ever fired, leaving 0 recognized sheets,
    // 0 rows, and no skip message explaining why.
    sheet.addRow(['Some Column', 'Another Column']);
    sheet.addRow(['x', 'y']);

    const tmpPath = path.join(os.tmpdir(), `unrecognized-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(tmpPath);
    try {
      const result = await parseItemMasterStream(tmpPath);
      expect(result.recognizedSheets).toBe(0);
      expect(result.skippedSheets).toBe(1);
      expect(result.skips).toHaveLength(1);
      expect(result.skips[0].code).toBe('UNRECOGNIZED_SHEET');
      expect(result.skips[0].message).toMatch(/checked 2 rows/);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('parses the same master-code layout from an .xls workbook', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([MASTER_HEADERS, MASTER_ROW]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const tmpPath = path.join(os.tmpdir(), `xls-capture-${Date.now()}.xls`);
    XLSX.writeFile(wb, tmpPath, { bookType: 'xls' });
    try {
      const result = await parseItemMasterStream(tmpPath);
      expect(result.recognizedSheets).toBe(1);
      expect(result.acceptedRows).toBe(1);
      expect(result.items[0].brand).toBe('TEST_BRAND');
      expect(result.items[0].itemCode).toBe('ALIAS001');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});
