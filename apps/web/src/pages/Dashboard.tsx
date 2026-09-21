import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, type SiteRow } from '../api/client.js';
import { CompliancePct } from '../components/Badges.jsx';

export function Dashboard() {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', client: '', healthcare: false });

  const load = () =>
    api
      .sites()
      .then(setSites)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.createSite({ name: form.name, code: form.code || undefined, client: form.client || undefined, healthcare: form.healthcare });
    setForm({ name: '', code: '', client: '', healthcare: false });
    setAdding(false);
    await load();
  };

  return (
    <>
      <div className="row between">
        <h1>Sites</h1>
        <button className="btn btn-sm" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Close' : 'Add site'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {adding && (
        <form className="card" onSubmit={submit}>
          <label className="field">
            <span>Name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              <span>Site code</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Client</span>
              <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.healthcare} onChange={(e) => setForm({ ...form, healthcare: e.target.checked })} />
            Healthcare premises (HTM 04-01: hot targets 55 °C)
          </label>
          <button className="btn btn-primary" type="submit">
            Create site
          </button>
        </form>
      )}
      {sites === null && !error && <p className="spinner">Loading…</p>}
      <div className="grid">
        {sites?.map((s) => (
          <Link key={s.id} to={`/sites/${s.id}`} className="card" style={{ color: 'inherit', margin: 0 }}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>{s.name}</h3>
              <CompliancePct pct={s.summary.compliancePct} />
            </div>
            <p className="small muted">
              {s.code ? `${s.code} · ` : ''}
              {s.client ?? ''} {s.healthcare ? '· healthcare' : ''}
            </p>
            <div className="row" style={{ marginTop: 8, gap: 16 }}>
              <div className="stat">
                <b>{s.assetCount}</b>
                <span>assets</span>
              </div>
              <div className="stat">
                <b>{s.summary.due}</b>
                <span>due</span>
              </div>
              <div className="stat" style={{ color: s.summary.overdue ? 'var(--bad)' : undefined }}>
                <b>{s.summary.overdue}</b>
                <span>overdue</span>
              </div>
              <div className="stat" style={{ color: s.summary.failed ? 'var(--bad)' : undefined }}>
                <b>{s.summary.failed}</b>
                <span>failed</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {sites?.length === 0 && <p className="muted">No sites yet. Add one, then add its assets: the HSG274 tasks are scheduled automatically.</p>}
    </>
  );
}
