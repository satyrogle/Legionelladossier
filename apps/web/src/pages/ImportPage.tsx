import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  IMPORT_FIELDS,
  detectHeaderRow,
  parseSpreadsheet,
  splitTririgaPath,
  suggestMapping,
  suggestMode,
  type AssetAction,
  type ColumnMapping,
  type ImportField,
  type ImportMode,
  type ParsedSheet,
} from '@ld/core';
import { api, type AssetType, type ImportBatchRecord, type ImportCommitResult, type ImportPreview, type ImportRequestBody, type SiteRow } from '../api/client.js';
import { useLocalStorage } from '../state/useLocalStorage.js';

const FORMAT_LABELS: Record<ParsedSheet['format'], string> = {
  xlsx: 'Excel workbook',
  html: 'HTML table (.xls)',
  spreadsheetml: 'Excel 2003 XML',
  delimited: 'Delimited text',
  json: 'OSLC / JSON',
};

const ACTION_CLASS: Record<AssetAction, string> = { create: 'pill-ok', update: 'pill-warn', unchanged: 'pill-muted', skip: 'pill-muted', error: 'pill-bad' };

function pad(rows: string[][], width: number): string[][] {
  return rows.map((r) => (r.length >= width ? r.slice(0, width) : [...r, ...Array<string>(width - r.length).fill('')]));
}

export function ImportPage() {
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mode, setMode] = useState<ImportMode>('assets');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [pathBuildingIndex, setPathBuildingIndex] = useState(1);
  const [targetSiteId, setTargetSiteId] = useState('');
  const [classMap, setClassMap] = useState<Record<string, AssetType | 'skip'>>({});
  const [generateTasks, setGenerateTasks] = useState(true);
  const [system, setSystem] = useState<'tririga' | 'other'>('tririga');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AssetAction | 'all'>('all');
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [engineer] = useLocalStorage('ld.engineer', '');
  const [resultsFrom, setResultsFrom] = useState('');
  const [resultsTo, setResultsTo] = useState('');
  const previewSeq = useRef(0);

  useEffect(() => {
    api.sites().then(setSites).catch(() => undefined);
    api.importBatches().then(setBatches).catch(() => undefined);
  }, [result]);

  const headers = useMemo(() => (sheet ? (sheet.rows[headerRow] ?? []).map((h, i) => h || `Column ${i + 1}`) : []), [sheet, headerRow]);
  const dataRows = useMemo(() => (sheet ? pad(sheet.rows.slice(headerRow + 1), headers.length) : []), [sheet, headerRow, headers.length]);

  const body = useMemo<ImportRequestBody | null>(() => {
    if (!sheet || headers.length === 0) return null;
    return {
      headers,
      rows: dataRows,
      mapping,
      options: { mode, classMap, pathBuildingIndex, targetSiteId: targetSiteId || undefined, system },
      filename: fileName,
      importedBy: engineer || undefined,
      generateTasks,
    };
  }, [sheet, headers, dataRows, mapping, mode, classMap, pathBuildingIndex, targetSiteId, system, fileName, engineer, generateTasks]);

  // Re-plan whenever the mapping or options change, so the preview always matches what Import will do.
  useEffect(() => {
    if (!body) return;
    const seq = ++previewSeq.current;
    setPreviewing(true);
    const t = setTimeout(() => {
      api
        .importPreview(body)
        .then((p) => {
          if (seq === previewSeq.current) {
            setPreview(p);
            setError(null);
          }
        })
        .catch((e: Error) => seq === previewSeq.current && setError(e.message))
        .finally(() => seq === previewSeq.current && setPreviewing(false));
    }, 400);
    return () => clearTimeout(t);
  }, [body]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      const parsed = parseSpreadsheet(new Uint8Array(await file.arrayBuffer()));
      if (parsed.rows.length < 2) throw new Error('The file has no data rows.');
      const hr = detectHeaderRow(parsed.rows);
      const hdrs = parsed.rows[hr] ?? [];
      const m = suggestMode(hdrs);
      setFileName(file.name);
      setSheet(parsed);
      setHeaderRow(hr);
      setMode(m);
      setMapping(suggestMapping(hdrs, m));
      setClassMap({});
      setPathBuildingIndex(1);
    } catch (err) {
      setSheet(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const changeHeaderRow = (i: number) => {
    if (!sheet) return;
    setHeaderRow(i);
    setMapping(suggestMapping(sheet.rows[i] ?? [], mode));
  };

  const changeMode = (m: ImportMode) => {
    setMode(m);
    setMapping(suggestMapping(headers, m));
  };

  const setField = (field: ImportField, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === '') delete next[field];
      else {
        const idx = Number(value);
        for (const k of Object.keys(next) as ImportField[]) if (next[k] === idx) delete next[k];
        next[field] = idx;
      }
      return next;
    });
  };

  const commit = async () => {
    if (!body) return;
    setCommitting(true);
    setError(null);
    try {
      const r = await api.importCommit(body);
      setResult(r);
      setPreview(null);
      setSheet(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  };

  const samplePath = mapping.path !== undefined ? dataRows.find((r) => r[mapping.path!]?.startsWith('\\'))?.[mapping.path!] : undefined;
  const pathSegments = samplePath ? splitTririgaPath(samplePath) : [];
  const fields = IMPORT_FIELDS.filter((f) => f.modes.includes(mode));
  const visibleRows = (preview?.assets ?? []).filter((a) => filter === 'all' || a.action === filter).slice(0, 200);
  const willWrite = preview ? preview.summary.sites.create + preview.summary.sites.update + preview.summary.assets.create + preview.summary.assets.update : 0;

  return (
    <>
      <h1>TRIRIGA import and export</h1>
      <p className="small muted">
        Import buildings and building equipment exported from TRIRIGA (Excel, CSV, Data Integrator text or an OSLC JSON response). Re-importing a newer export updates the same
        records by TRIRIGA ID. See <code>docs/tririga.md</code> for how to export from TRIRIGA.
      </p>

      <div className="card">
        <h3>1. Choose the export file</h3>
        <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,.json,.xml,.htm,.html" onChange={(e) => void onFile(e)} data-testid="import-file" />
        {sheet && (
          <p className="small muted" style={{ marginTop: 8 }}>
            {fileName}: {FORMAT_LABELS[sheet.format]}
            {sheet.sheetName ? `, sheet "${sheet.sheetName}"` : ''}, {dataRows.length} data rows.
          </p>
        )}
        {error && <p className="error small">{error}</p>}
      </div>

      {sheet && (
        <>
          <div className="card">
            <h3>2. What the file holds</h3>
            <div className="row">
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'assets'} onChange={() => changeMode('assets')} /> Assets (building equipment, outlets)
              </label>
              <label className="check">
                <input type="radio" name="mode" checked={mode === 'locations'} onChange={() => changeMode('locations')} /> Buildings only
              </label>
            </div>
            <label className="field" style={{ maxWidth: 420 }}>
              <span>Where the file comes from</span>
              <select value={system} onChange={(e) => setSystem(e.target.value as 'tririga' | 'other')}>
                <option value="tririga">TRIRIGA (IDs are TRIRIGA IDs)</option>
                <option value="other">Another register (risk assessment, spreadsheet)</option>
              </select>
            </label>
            <label className="field" style={{ maxWidth: 420 }}>
              <span>Header row</span>
              <select value={headerRow} onChange={(e) => changeHeaderRow(Number(e.target.value))}>
                {sheet.rows.slice(0, 10).map((r, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="card">
            <h3>3. Match the columns</h3>
            <div className="map-list">
              {fields.map((f) => (
                <div key={f.key} className="map-row">
                  <div>
                    <b className="small">{f.label}</b>
                    {f.hint && <div className="small muted">{f.hint}</div>}
                  </div>
                  <select value={mapping[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} data-testid={`map-${f.key}`} aria-label={f.label}>
                    <option value="">(not in file)</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {mapping[f.key] !== undefined && dataRows[0]?.[mapping[f.key]!] ? <div className="sample">first value: {dataRows[0][mapping[f.key]!]}</div> : null}
                </div>
              ))}
            </div>

            {pathSegments.length > 0 && (
              <label className="field" style={{ maxWidth: 520 }}>
                <span>In the location path, the building is</span>
                <select value={pathBuildingIndex} onChange={(e) => setPathBuildingIndex(Number(e.target.value))}>
                  {pathSegments.map((seg, i) => (
                    <option key={i} value={i}>
                      segment {i + 1}: {seg}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {mode === 'assets' && (
              <label className="field" style={{ maxWidth: 520 }}>
                <span>Site for each asset</span>
                <select value={targetSiteId} onChange={(e) => setTargetSiteId(e.target.value)}>
                  <option value="">From the file (building ID, name or path)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      Put everything in: {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {preview && preview.classes.length > 0 && (
            <div className="card">
              <h3>4. Water-hygiene type for each classification</h3>
              <p className="small muted">The type decides which HSG274 tasks are scheduled. Anything that is not part of the water system can be skipped.</p>
              <div className="map-list" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {preview.classes.map((c) => (
                  <div key={c.value} className="map-row">
                    <div>
                      <b className="small">{c.value || '(blank)'}</b>
                      <div className="small muted">
                        {c.count} row{c.count === 1 ? '' : 's'}
                        {c.value ? '' : ': type taken from each asset name'}
                      </div>
                    </div>
                    {c.value ? (
                      <select value={c.effective} onChange={(e) => setClassMap((m) => ({ ...m, [c.value]: e.target.value as AssetType | 'skip' }))} data-testid={`class-${c.value}`} aria-label={`Import ${c.value} as`}>
                        <option value="skip">Skip (not a water-system asset)</option>
                        {ASSET_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {ASSET_TYPE_LABELS[t]}
                            {c.suggested === t ? ' (suggested)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="small muted">per row</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3>{mode === 'assets' && preview?.classes.length ? '5' : '4'}. Preview</h3>
            {previewing && <p className="spinner">Checking…</p>}
            {preview && (
              <>
                <div className="row" style={{ gap: 20 }} data-testid="import-summary">
                  <div className="stat">
                    <b>{preview.summary.sites.create}</b>
                    <span>new sites</span>
                  </div>
                  <div className="stat">
                    <b>{preview.summary.sites.update}</b>
                    <span>sites updated</span>
                  </div>
                  {mode === 'assets' && (
                    <>
                      <div className="stat">
                        <b>{preview.summary.assets.create}</b>
                        <span>new assets</span>
                      </div>
                      <div className="stat">
                        <b>{preview.summary.assets.update}</b>
                        <span>assets updated</span>
                      </div>
                      <div className="stat">
                        <b>{preview.summary.assets.unchanged}</b>
                        <span>unchanged</span>
                      </div>
                      <div className="stat">
                        <b>{preview.summary.assets.skip}</b>
                        <span>skipped</span>
                      </div>
                    </>
                  )}
                  <div className="stat" style={{ color: preview.summary.assets.error ? 'var(--bad)' : undefined }}>
                    <b>{preview.summary.assets.error}</b>
                    <span>rows with problems</span>
                  </div>
                </div>
                {preview.warnings.map((w) => (
                  <div key={w} className="banner banner-warn">
                    {w}
                  </div>
                ))}
                <div className="row" style={{ marginTop: 10 }}>
                  {(['all', 'create', 'update', 'unchanged', 'skip', 'error'] as const).map((f) => (
                    <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>
                      {f}
                    </button>
                  ))}
                </div>
                <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto', marginTop: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Action</th>
                        <th>{mode === 'assets' ? 'Asset' : 'Building'}</th>
                        <th>Site</th>
                        <th>Type / detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((a) => (
                        <tr key={a.row}>
                          <td className="mono small">{a.row}</td>
                          <td>
                            <span className={`pill ${ACTION_CLASS[a.action]}`}>{a.action}</span>
                          </td>
                          <td>{a.name}</td>
                          <td className="small">{a.siteLabel ?? ''}</td>
                          <td className="small">
                            {a.typeLabel ?? ''}
                            {a.data?.sentinel ? ' · sentinel' : ''}
                            {a.data?.littleUsed ? ' · little used' : ''}
                            {a.data && !a.data.active ? ' · inactive' : ''}
                            {a.changes?.length ? <div className="muted">changes: {a.changes.join(', ')}</div> : null}
                            {a.reason ? <div className={a.action === 'error' ? 'error' : 'muted'}>{a.reason}</div> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.truncated && <p className="small muted">Showing the first 500 rows of the plan.</p>}
                <label className="check" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={generateTasks} onChange={(e) => setGenerateTasks(e.target.checked)} /> Create this period's tasks for the imported sites
                </label>
                <button className="btn btn-primary" onClick={() => void commit()} disabled={committing || previewing || willWrite === 0} data-testid="import-commit">
                  {committing ? 'Importing…' : willWrite === 0 ? 'Nothing to import' : 'Import'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {result && (
        <div className="card" data-testid="import-result">
          <div className="banner banner-ok">
            Imported: {result.summary.sites.create} new site{result.summary.sites.create === 1 ? '' : 's'}, {result.summary.assets.create} new asset
            {result.summary.assets.create === 1 ? '' : 's'}, {result.summary.assets.update + result.summary.sites.update} updated, {result.tasksCreated} task
            {result.tasksCreated === 1 ? '' : 's'} created.
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="small">
              {w}
            </p>
          ))}
          <div className="row">
            {sites
              .filter((s) => result.siteIds.includes(s.id))
              .map((s) => (
                <Link key={s.id} className="btn btn-sm" to={`/sites/${s.id}`}>
                  {s.name}
                </Link>
              ))}
          </div>
          <p className="small muted">Mark sentinel and little-used outlets on each site page if your TRIRIGA export does not carry them.</p>
        </div>
      )}

      <div className="card">
        <h3>Export for TRIRIGA</h3>
        <p className="small muted">All sites. Each site page has the same exports for one building.</p>
        <div className="stack">
          <div className="row">
            <b className="small" style={{ minWidth: 140 }}>
              Asset register
            </b>
            <a className="btn btn-sm" href={api.tririgaAssetsUrl('xlsx')}>
              Excel
            </a>
            <a className="btn btn-sm" href={api.tririgaAssetsUrl('txt')}>
              Data Integrator (.txt)
            </a>
            <a className="btn btn-sm" href={api.tririgaAssetsUrl('csv')}>
              CSV
            </a>
          </div>
          <div className="row">
            <b className="small" style={{ minWidth: 140 }}>
              PPM results
            </b>
            <input type="date" value={resultsFrom} onChange={(e) => setResultsFrom(e.target.value)} style={{ maxWidth: 160 }} aria-label="From" />
            <input type="date" value={resultsTo} onChange={(e) => setResultsTo(e.target.value)} style={{ maxWidth: 160 }} aria-label="To" />
            <a className="btn btn-sm" href={api.tririgaResultsUrl('xlsx', { from: resultsFrom || undefined, to: resultsTo || undefined })}>
              Excel
            </a>
            <a className="btn btn-sm" href={api.tririgaResultsUrl('txt', { from: resultsFrom || undefined, to: resultsTo || undefined })}>
              Tab-delimited
            </a>
          </div>
        </div>
      </div>

      {batches.length > 0 && (
        <div className="card tight table-wrap">
          <h3 style={{ margin: '4px 0 8px' }}>Recent imports</h3>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>File</th>
                <th>By</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {batches.slice(0, 10).map((b) => (
                <tr key={b.id}>
                  <td className="small">{b.createdAt.slice(0, 16).replace('T', ' ')}</td>
                  <td className="small">{b.filename ?? b.mode}</td>
                  <td className="small">{b.importedBy ?? ''}</td>
                  <td className="small">
                    {b.summary.sites.create} new sites, {b.summary.assets.create} new assets, {b.summary.sites.update + b.summary.assets.update} updated
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
