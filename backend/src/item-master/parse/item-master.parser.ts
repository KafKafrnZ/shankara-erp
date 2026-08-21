import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { ITEM_LAYOUT_REGISTRY, buildColumnMap } from '../detect/item-layout.registry';
import { ParsedItemRow } from '../detect/item-layout-detector.interface';

export interface ParseResult {
  totalSheets: number;
  recognizedSheets: number;
  skippedSheets: number;
  totalRows: number;
  acceptedRows: number;
  skippedRows: number;
  skips: Array<{ sheetName: string; sourceRowNo: number | null; code: string; message: string; raw?: any }>;
  items: Array<ParsedItemRow & { layoutKey: string; sourceRowNo: number; sheetName: string }>;
}

export async function parseItemMasterStream(filePath: string): Promise<ParseResult> {
  const result: ParseResult = {
    totalSheets: 0,
    recognizedSheets: 0,
    skippedSheets: 0,
    totalRows: 0,
    acceptedRows: 0,
    skippedRows: 0,
    skips: [],
    items: [],
  };

  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: 'emit',
    sharedStrings: 'emit',
    hyperlinks: 'emit',
  });

  for await (const worksheetReader of workbook) {
    result.totalSheets++;
    const sheetName = (worksheetReader as any).name || `Sheet${result.totalSheets}`;
    
    let headerRow: any[] | null = null;
    let detector: typeof ITEM_LAYOUT_REGISTRY[0] | null = null;
    let columnMap: Record<string, number> = {};
    let isSkippedSheet = false;

    for await (const row of worksheetReader) {
      // ExcelJS 1-based indexing for rows.
      // row.values is 1-indexed sparse array, meaning row.values[1] is the first column.
      const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];

      if (!headerRow) {
        headerRow = rowValues;
        
        // Find matching detector
        for (const det of ITEM_LAYOUT_REGISTRY) {
          if (det.detect(headerRow)) {
            detector = det;
            break;
          }
        }

        if (!detector) {
          isSkippedSheet = true;
          result.skippedSheets++;
          result.skips.push({
            sheetName,
            sourceRowNo: null,
            code: 'UNRECOGNIZED_SHEET',
            message: `Sheet ${sheetName} did not match any known layout. Headers: ${JSON.stringify(headerRow).substring(0, 100)}`,
          });
          break; // Skip rest of the sheet
        }

        result.recognizedSheets++;
        columnMap = buildColumnMap(headerRow);
        continue;
      }

      if (isSkippedSheet) {
        break; // Double break
      }

      // Process data row
      result.totalRows++;
      
      const parsed = detector!.parseRow(rowValues, columnMap);
      if ('skip' in parsed && parsed.skip) {
        result.skippedRows++;
        result.skips.push({
          sheetName,
          sourceRowNo: row.number,
          code: parsed.code,
          message: parsed.reason,
          raw: rowValues,
        });
      } else {
        result.acceptedRows++;
        result.items.push({
          ...(parsed as ParsedItemRow),
          layoutKey: detector!.key,
          sourceRowNo: row.number,
          sheetName,
        });
      }
    }
  }

  return result;
}
