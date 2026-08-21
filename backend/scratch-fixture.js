const ExcelJS = require('exceljs');
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('MASTER CODE');
ws.addRow(['SI No.', 'Catalogue No', 'Brand', 'Stock Item Name for Migration', 'Alias', 'Main Group', 'Sub Group', 'UOM']);
ws.addRow([1, 'TEST_CAT', { formula: '"TEST_BRAND"', result: 'TEST_BRAND' }, { formula: 'CONCATENATE("TEST_ITEM_", "NAME")', result: 'TEST_ITEM_NAME' }, 'TEST_ALIAS', 'TEST_MAIN', 'TEST_SUB', 'PCS']);
wb.xlsx.writeFile('fixtures/item-master/test-fixture-1.xlsx').then(() => console.log('fixture created'));
