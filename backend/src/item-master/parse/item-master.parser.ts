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

const unwrapCell = (v: any) => {
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('error' in v) return String(v.error);
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return v.text;
    if (v instanceof Date) return v.toISOString();
  }
  return v;
};

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
    hyperlinks: 'emit',
  });

  for await (const worksheetReader of workbook) {
    result.totalSheets++;
    const sheetName = (worksheetReader as any).name || `Sheet${result.totalSheets}`;
    
    let headerRow: any[] | null = null;
    let detector: typeof ITEM_LAYOUT_REGISTRY[0] | null = null;
    let columnMap: Record<string, number> = {};
    let isSkippedSheet = false;
    let rowsScanned = 0;

    for await (const row of worksheetReader) {
      const rowValues = (Array.isArray(row.values) ? row.values.slice(1) : []).map(unwrapCell);

      if (!headerRow) {
        rowsScanned++;
        
        // Find matching detector
        for (const det of ITEM_LAYOUT_REGISTRY) {
          if (det.detect(rowValues)) {
            detector = det;
            break;
          }
        }

        if (detector) {
          headerRow = rowValues;
          result.recognizedSheets++;
          columnMap = buildColumnMap(headerRow);
          continue; // Move to data rows
        }

        if (rowsScanned >= 20) {
          isSkippedSheet = true;
          result.skippedSheets++;
          result.skips.push({
            sheetName,
            sourceRowNo: null,
            code: 'UNRECOGNIZED_SHEET',
            message: `Sheet ${sheetName} did not match any known layout after 20 rows.`,
          });
          break; // Skip rest of the sheet
        }
        continue; // Keep scanning
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
