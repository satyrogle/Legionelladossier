export type Delimiter = '\t' | ',' | ';' | '|';

/** Pick the delimiter that splits the first non-empty line into the most fields. Tab wins ties (Data Integrator files). */
export function detectDelimiter(text: string): Delimiter {
  const line = text.split(/\r\n|\n|\r/).find((l) => l.trim().length > 0) ?? '';
  const candidates: Delimiter[] = ['\t', ',', ';', '|'];
  let best: Delimiter = ',';
  let bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 parser: quoted fields, doubled quotes, embedded delimiters and newlines, CRLF or LF. */
export function parseDelimited(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field.length === 0) {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

/**
 * Neutralise spreadsheet formulas in a CSV cell (OWASP "CSV injection"): a value starting with
 * = + - @ or a control character gets a leading apostrophe, unless it is a plain number such as -2.5.
 */
export function csvSafe(v: string): string {
  if (/^[=+\-@\t\r]/.test(v) && !/^[-+]?\d+(\.\d+)?$/.test(v)) return `'${v}`;
  return v;
}

/**
 * Serialise rows. TSV (Data Integrator) cannot quote, so tabs and line breaks inside values become
 * spaces and the text is passed through as is. CSV is quoted and made formula-safe for Excel.
 */
export function toDelimited(rows: readonly (readonly string[])[], delimiter: '\t' | ','): string {
  const cell =
    delimiter === '\t'
      ? (v: string) => v.replace(/[\t\r\n]+/g, ' ')
      : (v: string) => {
          const safe = csvSafe(v);
          return /[",\r\n]/.test(safe) || /^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        };
  return rows.map((r) => r.map((v) => cell(v ?? '')).join(delimiter)).join('\r\n') + '\r\n';
}
