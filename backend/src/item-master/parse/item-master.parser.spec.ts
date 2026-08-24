import { parseItemMasterStream } from './item-master.parser';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';

describe('ItemMasterParser', () => {
  it('should parse master code layout with formula resolution', async () => {
    const fixturePath = path.resolve(process.cwd(), 'fixtures/item-master/test-fixture-1.xlsx');
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
    const fixturePath = path.resolve(process.cwd(), 'fixtures/item-master/sap-fixture.xlsx');
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
    const fixturePath = path.resolve(process.cwd(), 'fixtures/item-master/cp-fixture.xlsx');
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
      'Item Type', 'Catalogue No', 'Brand', 'Stock Item Name for Migration',
      'Alias', 'Main Group', 'Sub Group', 'UOM', 'GST Rate',
    ]);
    sheet.addRow([
      'Finished', 'CAT001', 'TEST_BRAND', 'Extra Column Item',
      'ALIAS001', 'GROUP1', 'SUBGROUP1', 'PCS', '18%',
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
      expect(item.extra).toEqual({ 'GST Rate': '18%', 'Item Type': 'Finished' });
      // Fields the layout already maps into a fixed column must not also
      // duplicate into extra.
      expect(item.extra).not.toHaveProperty('Brand');
      expect(item.extra).not.toHaveProperty('Catalogue No');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});
