import { parseItemMasterStream } from './item-master.parser';
import * as path from 'path';

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
});
