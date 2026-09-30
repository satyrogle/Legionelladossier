import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ASSET_TYPE_LABELS, externalIdOf, type Asset, type AssetType, type ComplianceSummary, type LoopRank, type Site } from '@ld/core';

/** Plant items: the sentinel and little-used flags only apply to outlets. */
const PLANT = new Set<AssetType>(['calorifier', 'cold_water_tank', 'return_loop', 'tmv', 'expansion_vessel', 'pou_heater', 'combi_heater']);
import { api, type TaskView } from '../api/client.js';
import { CompliancePct, StatusPill } from '../components/Badges.jsx';

export function SitePage() {
  const { siteId = '' } = useParams();
  const [data, setData] = useState<{ site: Site; assets: Asset[]; summary: ComplianceSummary } | null>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([api.site(siteId), api.tasks({ siteId, status: 'open' })]);
      setData(d);
      setTasks(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchAsset = async (asset: Asset, patch: Partial<Asset>) => {
    try {
      const res = await api.updateAsset(asset.id, { ...patch, autoSchedule: true });
      const s = res.schedules;
      setMessage(`${asset.name} updated${s && (s.activated || s.deactivated) ? `: ${s.activated} schedule(s) added, ${s.deactivated} stopped` : ''}.`);
      await load();
    } catch (e) {
      setMessage(`Could not update ${asset.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const generate = async () => {
    const res = await api.generateTasks(siteId);
    setMessage(`${res.created} new task${res.created === 1 ? '' : 's'} for the current period.`);
    await load();
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="spinner">Loading…</p>;
  const { site, assets, summary } = data;

  return (
    <>
      <p className="small">
        <Link to="/">Sites</Link> / {site.name}
      </p>
      <div className="row between">
        <h1 style={{ margin: '4px 0' }}>{site.name}</h1>
        <CompliancePct pct={summary.compliancePct} />
      </div>
      <p className="small muted">
        {[site.code, site.property, site.address, site.healthcare ? 'healthcare premises (55 °C hot targets)' : undefined].filter(Boolean).join(' · ')}
      </p>

      <div className="row">
        <button className="btn btn-primary" onClick={() => void generate()}>
          Generate this period's tasks
        </button>
        <Link className="btn" to={`/sites/${siteId}/report`}>
          Compliance report
        </Link>
        <a className="btn" href={api.exportUrl(siteId)}>
          Export dossier CSV
        </a>
      </div>
      <details className="card tight" style={{ marginTop: 10 }}>
        <summary className="small">
          <b>TRIRIGA exports</b> <span className="muted">asset register and PPM results for this building</span>
        </summary>
        <div className="row" style={{ marginTop: 8 }}>
          <a className="btn btn-sm" href={api.tririgaAssetsUrl('xlsx', siteId)}>
            Asset register (Excel)
          </a>
          <a className="btn btn-sm" href={api.tririgaAssetsUrl('txt', siteId)}>
            Asset register (Data Integrator .txt)
          </a>
          <a className="btn btn-sm" href={api.tririgaResultsUrl('xlsx', { siteId })}>
            PPM results (Excel)
          </a>
        </div>
        {site.externalRef && (
          <p className="small muted">
            Linked to TRIRIGA building {externalIdOf(site.externalRef) ?? site.name}
            {site.externalPath ? ` (${site.externalPath})` : ''}.
          </p>
        )}
      </details>
      {message && <p className="small muted">{message}</p>}

      <h2>
        Open tasks <span className="muted small">({tasks.length})</span>
      </h2>
      <div className="card tight">
        {tasks.length === 0 && <p className="muted small">Nothing open. Generate tasks for the current period, or add assets.</p>}
        {tasks.map((t) => (
          <Link key={t.id} to={`/tasks/${t.id}`} className="task-item">
            <div className="row between">
              <b>{t.templateTitle}</b>
              <StatusPill status={t.status} />
            </div>
            <div className="small muted">
              {t.assetName}
              {t.assetLocation ? ` · ${t.assetLocation}` : ''} · due {t.dueDate}
            </div>
          </Link>
        ))}
      </div>

      <div className="row between">
        <h2>
          Assets <span className="muted small">({assets.length})</span>
        </h2>
        <Link className="btn btn-sm" to={`/sites/${siteId}/assets/new`}>
          Add asset
        </Link>
      </div>
      <div className="card tight table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Asset</th>
              <th title="Sentinel outlet">Sentinel</th>
              <th title="Little-used outlet: weekly flush">Little used</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const outlet = !PLANT.has(a.type);
              const tririgaId = externalIdOf(a.externalRef);
              const where = a.location ?? [a.floor, a.space].filter(Boolean).join(' · ');
              return (
                <tr key={a.id} style={a.active ? undefined : { opacity: 0.55 }}>
                  <td className="mono small">
                    {a.tag ?? ''}
                    {a.externalSystem === 'tririga' && tririgaId && tririgaId !== a.tag && <div className="muted">TRIRIGA {tririgaId}</div>}
                  </td>
                  <td>
                    {a.name}
                    {!a.active && (
                      <span className="pill pill-muted" style={{ marginLeft: 6 }}>
                        inactive
                      </span>
                    )}
                    <div className="asset-sub">{[ASSET_TYPE_LABELS[a.type], where].filter(Boolean).join(' · ')}</div>
                    {a.classification && <div className="asset-sub">TRIRIGA class: {a.classification}</div>}
                    {a.type === 'return_loop' && (
                      <select value={a.loopRank ?? ''} onChange={(e) => void patchAsset(a, { loopRank: e.target.value as LoopRank })} style={{ marginTop: 4, maxWidth: 220, fontSize: 13, padding: '6px 4px' }} aria-label="Loop rank">
                        <option value="principal">Principal (monthly)</option>
                        <option value="subordinate">Subordinate (quarterly)</option>
                        <option value="tertiary">Tertiary (annual)</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {outlet && <input type="checkbox" checked={a.sentinel} onChange={(e) => void patchAsset(a, { sentinel: e.target.checked })} aria-label={`Sentinel: ${a.name}`} />}
                  </td>
                  <td>
                    {outlet && a.type !== 'little_used_outlet' && (
                      <input type="checkbox" checked={a.littleUsed} onChange={(e) => void patchAsset(a, { littleUsed: e.target.checked })} aria-label={`Little used: ${a.name}`} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
