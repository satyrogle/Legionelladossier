/** Local name of an RDF-style key: "spi:triIdTX" → "triIdTX", "dcterms:identifier" → "identifier". */
export function localName(key: string): string {
  const i = key.lastIndexOf(':');
  return i >= 0 && !key.includes('://') ? key.slice(i + 1) : key;
}

function flatten(value: unknown, prefix: string, out: Record<string, string>, depth: number): void {
  if (value === null || value === undefined) {
    out[prefix] = '';
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] !== 'object') out[prefix] = value.join('; ');
    return;
  }
  if (typeof value === 'object') {
    if (depth >= 3) return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${localName(k)}` : localName(k), out, depth + 1);
    return;
  }
  out[prefix] = typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value);
}

/**
 * Rows from JSON: a TRIRIGA OSLC query response ({ "rdfs:member": [...] }), an OSLC "oslc:results"
 * list, or a plain array of objects. Namespaces are dropped and nested links flattened with dots.
 */
export function parseJsonRecords(text: string): string[][] {
  const data: unknown = JSON.parse(text);
  let records: unknown[] = [];
  if (Array.isArray(data)) records = data;
  else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const list = o['rdfs:member'] ?? o['member'] ?? o['oslc:results'] ?? o['results'] ?? o['data'] ?? o['items'];
    if (Array.isArray(list)) records = list;
    else records = [o];
  }
  const flat = records.filter((r) => r && typeof r === 'object').map((r) => {
    const out: Record<string, string> = {};
    flatten(r, '', out, 0);
    return out;
  });
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of flat) for (const k of Object.keys(r)) if (!seen.has(k)) seen.add(k), headers.push(k);
  return [headers, ...flat.map((r) => headers.map((h) => r[h] ?? ''))];
}
