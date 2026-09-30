import { unzipSync } from 'fflate';
import { decodeEntities } from './text.js';

const td = new TextDecoder('utf-8');

function file(files: Record<string, Uint8Array>, path: string): string | undefined {
  const bytes = files[path] ?? files[path.replace(/^\//, '')];
  return bytes ? td.decode(bytes) : undefined;
}

/** Concatenated text of every <t> run, skipping phonetic (<rPh>) runs. */
function textRuns(xml: string): string {
  const clean = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)) out += m[1] ?? '';
  return decodeEntities(out);
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? decodeEntities(m[1] ?? '') : undefined;
}

export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

/** Read the first worksheet of an .xlsx workbook into rows of strings. */
export function readXlsx(bytes: Uint8Array): XlsxSheet {
  const files = unzipSync(bytes);
  const workbook = file(files, 'xl/workbook.xml');
  if (!workbook) throw new Error('Not an Excel workbook (xl/workbook.xml missing)');
  const sheetTag = /<(?:\w+:)?sheet\b([^>]*)\/?>/.exec(workbook);
  if (!sheetTag) throw new Error('Workbook has no sheets');
  const sheetName = attr(sheetTag[1] ?? '', 'name') ?? 'Sheet1';
  const relId = attr(sheetTag[1] ?? '', 'r:id') ?? attr(sheetTag[1] ?? '', 'id');

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const rels = file(files, 'xl/_rels/workbook.xml.rels');
  if (rels && relId) {
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
      if (attr(m[1] ?? '', 'Id') === relId) {
        const target = attr(m[1] ?? '', 'Target');
        if (target) sheetPath = resolveTarget(target);
      }
    }
  }
  const sheet = file(files, sheetPath);
  if (!sheet) throw new Error(`Worksheet ${sheetPath} missing from workbook`);

  const shared: string[] = [];
  const sst = file(files, 'xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) shared.push(textRuns(m[1] ?? ''));

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const row: string[] = [];
    let next = 0;
    for (const c of (rowMatch[1] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = c[1] ?? '';
      const body = c[2] ?? '';
      const ref = attr(attrs, 'r');
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = attr(attrs, 't');
      const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textRuns(body);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v === undefined ? '' : decodeEntities(v);
      while (row.length < col) row.push('');
      row[col] = value.trim();
    }
    rows.push(row);
  }
  return { name: sheetName, rows };
}
