import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ASSET_TYPE_LABELS, type Asset, type ComplianceSummary, type Site } from '@ld/core';
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
        {site.code ? `${site.code} · ` : ''}
        {site.address ?? ''} {site.healthcare ? '· healthcare premises (55 °C hot targets)' : ''}
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
              <th>Type</th>
              <th>Location</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.tag ?? ''}</td>
                <td>{a.name}</td>
                <td>{ASSET_TYPE_LABELS[a.type]}</td>
                <td>{a.location ?? ''}</td>
                <td>
                  {a.sentinel && <span className="pill pill-muted">sentinel</span>} {a.littleUsed && <span className="pill pill-muted">little used</span>}{' '}
                  {a.loopRank && <span className="pill pill-muted">{a.loopRank}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
