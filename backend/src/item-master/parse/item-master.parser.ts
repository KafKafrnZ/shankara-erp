import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import {
  ITEM_LAYOUT_REGISTRY,
  buildColumnMap,
  extraHeadersFromHeaderRow,
  isPlaceholderValue,
} from '../detect/item-layout.registry';
import { ParsedItemRow } from '../detect/item-layout-detector.interface';
import {
  detectSpreadsheetKind,
  type SpreadsheetKind,
} from '../../common/spreadsheet-kind';
import { decodeSpreadsheetText, parseCsvText } from './csv';

function extractExtra(
  row: any[],
  headerRow: any[],
  columnMap: Record<string, number>,
  knownHeaderKeys: string[],
): Record<string, string> {
  const known = new Set(knownHeaderKeys);
  const extra: Record<string, string> = {};
  for (const [normalizedHeader, colIndex] of Object.entries(columnMap)) {
    if (known.has(normalizedHeader)) continue;
    const value = row[colIndex];
    if (isPlaceholderValue(value)) continue;
    const label = String(headerRow[colIndex] ?? normalizedHeader).trim();
    if (!label) continue;
    extra[label] = String(value).trim();
  }
  return extra;
}

export interface ParseResult {
  totalSheets: number;
  recognizedSheets: number;
  skippedSheets: number;
  totalRows: number;
  acceptedRows: number;
  skippedRows: number;
  skips: Array<{
    sheetName: string;
    sourceRowNo: number | null;
    code: string;
    message: string;
    raw?: any;
  }>;
  items: Array<
    ParsedItemRow & {
      layoutKey: string;
      sourceRowNo: number;
      sheetName: string;
    }
  >;
  /** Extra-column headers from every recognized sheet, in file order,
   *  including columns that were blank on every row. Stored on the batch
   *  so copy/export can pad those columns even when `extra` jsonb only
   *  holds keys that actually had a value. */
  extraHeaders: string[];
}

const unwrapCell = (v: any) => {
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('error' in v) return String(v.error);
    if ('richText' in v && Array.isArray(v.richText))
      return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return v.text;
    if (v instanceof Date) return v.toISOString();
  }
  return v;
};

type SheetRow = { values: any[]; number: number };

function emptyResult(): ParseResult {
  return {
    totalSheets: 0,
    recognizedSheets: 0,
    skippedSheets: 0,
    totalRows: 0,
    acceptedRows: 0,
    skippedRows: 0,
    skips: [],
    items: [],
    extraHeaders: [],
  };
}

function mergeExtraHeaders(into: string[], add: string[]): void {
  const seen = new Set(into);
  for (const label of add) {
    if (!label || seen.has(label)) continue;
    seen.add(label);
    into.push(label);
  }
}

async function ingestSheet(
  result: ParseResult,
  sheetName: string,
  rows: AsyncIterable<SheetRow>,
): Promise<void> {
  result.totalSheets++;

  let headerRow: any[] | null = null;
  let detector: (typeof ITEM_LAYOUT_REGISTRY)[0] | null = null;
  let columnMap: Record<string, number> = {};
  let rowsScanned = 0;

  for await (const row of rows) {
    const rowValues = row.values.map(unwrapCell);

    if (!headerRow) {
      rowsScanned++;
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
        mergeExtraHeaders(
          result.extraHeaders,
          extraHeadersFromHeaderRow(headerRow, detector.knownHeaderKeys),
        );
        continue;
      }
      if (rowsScanned >= 20) {
        result.skippedSheets++;
        result.skips.push({
          sheetName,
          sourceRowNo: null,
          code: 'UNRECOGNIZED_SHEET',
          message: `Sheet ${sheetName} did not match any known layout after 20 rows.`,
        });
        return;
      }
      continue;
    }

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
        extra: extractExtra(
          rowValues,
          headerRow,
          columnMap,
          detector!.knownHeaderKeys,
        ),
        layoutKey: detector!.key,
        sourceRowNo: row.number,
        sheetName,
      });
    }
  }
}

async function* rowsFromMatrix(matrix: any[][]): AsyncIterable<SheetRow> {
  for (let i = 0; i < matrix.length; i++) {
    yield { values: matrix[i] ?? [], number: i + 1 };
  }
}

async function parseXlsxStream(filePath: string): Promise<ParseResult> {
  const result = emptyResult();
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: 'emit',
    hyperlinks: 'emit',
  });

  for await (const worksheetReader of workbook) {
    const sheetName =
      (worksheetReader as any).name || `Sheet${result.totalSheets + 1}`;
    async function* excelRows(): AsyncIterable<SheetRow> {
      for await (const row of worksheetReader) {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        yield { values, number: row.number };
      }
    }
    await ingestSheet(result, sheetName, excelRows());
  }
  return result;
}

async function parseXlsFile(filePath: string): Promise<ParseResult> {
  const result = emptyResult();
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false,
  });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as any[][];
    await ingestSheet(result, sheetName, rowsFromMatrix(matrix));
  }
  return result;
}

async function parseCsvFile(filePath: string): Promise<ParseResult> {
  const result = emptyResult();
  const buffer = fs.readFileSync(filePath);
  const matrix = parseCsvText(decodeSpreadsheetText(buffer));
  await ingestSheet(result, 'Sheet1', rowsFromMatrix(matrix));
  return result;
}

function sniffFile(filePath: string): SpreadsheetKind | null {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, 8192, 0);
    return detectSpreadsheetKind(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}

export async function parseItemMasterFile(
  filePath: string,
  kind?: SpreadsheetKind | null,
): Promise<ParseResult> {
  const sniffed = kind ?? sniffFile(filePath);
  switch (sniffed) {
    case 'xls':
      return parseXlsFile(filePath);
    case 'csv':
      return parseCsvFile(filePath);
    case 'xlsx':
    default:
      return parseXlsxStream(filePath);
  }
}

/** @deprecated alias — same as parseItemMasterFile, kept for existing tests */
export async function parseItemMasterStream(
  filePath: string,
): Promise<ParseResult> {
  return parseItemMasterFile(filePath);
}
