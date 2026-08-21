import { parseItemMasterStream } from './src/item-master/parse/item-master.parser';
(async () => {
  for (const f of [
    '/mnt/games/Shankara_erp_matrix/MAIN MASTER ALL BRAND 130526.xlsx',
    '/mnt/games/Shankara_erp_matrix/TILES 15062026 NEW.xlsx',
  ]) {
    const r = await parseItemMasterStream(f);
    console.log(f, { totalSheets: r.totalSheets, recognizedSheets: r.recognizedSheets, skippedSheets: r.skippedSheets, totalRows: r.totalRows, acceptedRows: r.acceptedRows, skippedRows: r.skippedRows });
    const bad = r.items.filter((i: any) => JSON.stringify(i).includes('[object Object]'));
    console.log('items with unresolved formula garbage:', bad.length);
    console.log('SAP_Item_Master rows:', r.items.filter((i: any) => i.sheetName === 'SAP_Item_Master').length);
  }
})();
