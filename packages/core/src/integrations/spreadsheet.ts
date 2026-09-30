import { detectDelimiter, parseDelimited } from './delimited.js';
import { parseJsonRecords } from './json.js';
import { parseHtmlTable, parseSpreadsheetMl } from './markup.js';
import { decodeText } from './text.js';
import { readXlsx } from './xlsx.js';

export type SheetFormat = 'xlsx' | 'html' | 'spreadsheetml' | 'delimited' | 'json';

export interface ParsedSheet {
  format: SheetFormat;
  rows: string[][];
  sheetName?: string;
  delimiter?: string;
}

export const MAX_IMPORT_ROWS = 50_000;

/** Read any export TRIRIGA or Excel is likely to produce, by content rather than file extension. */
export function parseSpreadsheet(bytes: Uint8Array): ParsedSheet {
  let parsed: ParsedSheet;
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const sheet = readXlsx(bytes);
    parsed = { format: 'xlsx', rows: sheet.rows, sheetName: sheet.name };
  } else if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error('This is a legacy binary .xls file. Open it in Excel and save it as .xlsx or CSV, then import that.');
  } else {
    const text = decodeText(bytes);
    const head = text.trimStart().slice(0, 2000);
    if (head.startsWith('{') || head.startsWith('[')) parsed = { format: 'json', rows: parseJsonRecords(text) };
    else if (/<Workbook\b|urn:schemas-microsoft-com:office:spreadsheet/i.test(head)) parsed = { format: 'spreadsheetml', rows: parseSpreadsheetMl(text) };
    else if (/<(html|table)\b/i.test(head) || /<table\b/i.test(text.slice(0, 20000))) parsed = { format: 'html', rows: parseHtmlTable(text) };
    else {
      const delimiter = detectDelimiter(text);
      parsed = { format: 'delimited', rows: parseDelimited(text, delimiter), delimiter };
    }
  }
  const rows = parsed.rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length > MAX_IMPORT_ROWS + 20) throw new Error(`File has ${rows.length} rows; split it into files of at most ${MAX_IMPORT_ROWS} rows.`);
  return { ...parsed, rows };
}
