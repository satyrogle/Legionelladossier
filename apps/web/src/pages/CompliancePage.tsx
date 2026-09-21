import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, type ComplianceReport } from '../api/client.js';
import { CompliancePct, StatusPill } from '../components/Badges.jsx';

export function CompliancePage() {
  const { siteId = '' } = useParams();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .compliance(siteId)
      .then(setReport)
      .catch((e: Error) => setError(e.message));
  }, [siteId]);

  if (error) return <p className="error">{error}</p>;
  if (!report) return <p className="spinner">Loading…</p>;
  const { site, summary } = report;

  return (
    <>
      <p className="small">
        <Link to={`/sites/${siteId}`}>{site.name}</Link> / Compliance report
      </p>
      <div className="row between">
        <h1 style={{ margin: '4px 0' }}>Compliance</h1>
        <CompliancePct pct={summary.compliancePct} />
      </div>
      <p className="small muted">As at {report.today}. On-time means completed (pass or fail recorded) by the due date of each period.</p>
      <div className="card">
        <div className="row" style={{ gap: 20 }}>
          <div className="stat"><b>{summary.total}</b><span>tasks</span></div>
          <div className="stat"><b>{summary.completedOnTime}</b><span>on time</span></div>
          <div className="stat"><b>{summary.completed}</b><span>completed</span></div>
          <div className="stat" style={{ color: summary.failed ? 'var(--bad)' : undefined }}><b>{summary.failed}</b><span>failed</span></div>
          <div className="stat" style={{ color: summary.overdue ? 'var(--bad)' : undefined }}><b>{summary.overdue}</b><span>overdue</span></div>
          <div className="stat"><b>{summary.due}</b><span>due</span></div>
          <div className="stat"><b>{summary.skipped}</b><span>skipped</span></div>
        </div>
        <p style={{ marginTop: 10 }}>
          <a className="btn btn-sm" href={api.exportUrl(siteId)}>Export dossier CSV</a>
        </p>
      </div>

      <h2>By task type</h2>
      <div className="card tight table-wrap">
        <table>
          <thead>
            <tr><th>Task</th><th>Total</th><th>On time</th><th>Failed</th><th>Overdue</th><th>Compliance</th></tr>
          </thead>
          <tbody>
            {report.byTemplate.map((t) => (
              <tr key={t.code}>
                <td>{t.title}<div className="small muted mono">{t.code}</div></td>
                <td>{t.summary.total}</td>
                <td>{t.summary.completedOnTime}</td>
                <td className={t.summary.failed ? 'error' : ''}>{t.summary.failed}</td>
                <td className={t.summary.overdue ? 'error' : ''}>{t.summary.overdue}</td>
                <td><CompliancePct pct={t.summary.compliancePct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Overdue <span className="muted small">({report.overdue.length})</span></h2>
      <div className="card tight">
        {report.overdue.length === 0 && <p className="small muted">Nothing overdue.</p>}
        {report.overdue.map((t) => (
          <Link key={t.id} to={`/tasks/${t.id}`} className="task-item">
            <div className="row between"><b>{t.templateTitle}</b><StatusPill status={t.status} /></div>
            <div className="small muted">{t.assetName}{t.assetLocation ? ` · ${t.assetLocation}` : ''} · due {t.dueDate}</div>
          </Link>
        ))}
      </div>

      <h2>Failed <span className="muted small">({report.failed.length})</span></h2>
      <div className="card tight">
        {report.failed.length === 0 && <p className="small muted">No failed tasks.</p>}
        {report.failed.map((t) => (
          <Link key={t.id} to={`/tasks/${t.id}`} className="task-item">
            <div className="row between"><b>{t.templateTitle}</b><StatusPill status={t.status} /></div>
            <div className="small muted">{t.assetName}{t.assetLocation ? ` · ${t.assetLocation}` : ''} · due {t.dueDate}{t.notes ? ` · ${t.notes}` : ''}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
