const ExcelJS = require('exceljs');
const path = require('path');

async function generate() {
  const sapPath = path.join(__dirname, 'fixtures/item-master/sap-fixture.xlsx');
  const sapWb = new ExcelJS.Workbook();
  const sapWs = sapWb.addWorksheet('SAP_Item_Master');
  sapWs.addRow(['sap item code', 'catalogue no', 'brand', 'main group', 'sub group', 'uom', 'sap item description']);
  sapWs.addRow(['SAP123', 'CAT123', 'Nike', 'Shoes', 'Sneakers', 'Pairs', { formula: '"Super " & "Sneaker"', result: 'Super Sneaker' }]);
  await sapWb.xlsx.writeFile(sapPath);
  console.log('Created sap-fixture.xlsx');

  const cpPath = path.join(__dirname, 'fixtures/item-master/cp-fixture.xlsx');
  const cpWb = new ExcelJS.Workbook();
  const cpWs = cpWb.addWorksheet('Sheet1');
  // CP Sani Others: first header blank, 'stock item name', 'alias', 'main group', 'sub group', 'uom', 'category'
  cpWs.addRow(['', 'stock item name', 'alias', 'main group', 'sub group', 'uom', 'category', 'brand']);
  cpWs.addRow(['CP123', 'Pipe 2"', 'P-2', 'Plumbing', 'Pipes', 'Meters', 'Cat', { formula: '"Ashir" & "vad"', result: 'Ashirvad' }]);
  await cpWb.xlsx.writeFile(cpPath);
  console.log('Created cp-fixture.xlsx');
}

generate().catch(console.error);
