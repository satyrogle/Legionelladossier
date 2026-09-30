import { collapseWhitespace, decodeEntities } from './text.js';

function cellText(html: string): string {
  return collapseWhitespace(decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')));
}

/** Rows of every <tr> in an HTML document (old "Excel" exports are often HTML tables saved as .xls). */
export function parseHtmlTable(html: string): string[][] {
  const rows: string[][] = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: string[] = [];
    for (const td of (tr[1] ?? '').matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      row.push(cellText(td[3] ?? ''));
      const span = Number(/colspan\s*=\s*"?(\d+)/i.exec(td[2] ?? '')?.[1] ?? 1);
      for (let k = 1; k < span && k < 50; k += 1) row.push('');
    }
    rows.push(row);
  }
  return rows;
}

/** Rows of the first worksheet of an Excel 2003 XML (SpreadsheetML) file. */
export function parseSpreadsheetMl(xml: string): string[][] {
  const ws = /<(?:\w+:)?Worksheet\b[\s\S]*?<\/(?:\w+:)?Worksheet>/i.exec(xml)?.[0] ?? xml;
  const rows: string[][] = [];
  for (const r of ws.matchAll(/<(?:\w+:)?Row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?Row>)/g)) {
    const row: string[] = [];
    for (const c of (r[1] ?? '').matchAll(/<(?:\w+:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?Cell>)/g)) {
      const attrs = c[1] ?? '';
      const index = /(?:ss:)?Index="(\d+)"/.exec(attrs)?.[1];
      if (index) while (row.length < Number(index) - 1) row.push('');
      const data = /<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/.exec(c[2] ?? '')?.[1] ?? '';
      row.push(cellText(data));
      const across = Number(/(?:ss:)?MergeAcross="(\d+)"/.exec(attrs)?.[1] ?? 0);
      for (let k = 0; k < across && k < 50; k += 1) row.push('');
    }
    rows.push(row);
  }
  return rows;
}
