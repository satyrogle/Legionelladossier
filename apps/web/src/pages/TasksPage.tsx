import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, type TaskView } from '../api/client.js';
import { StatusPill } from '../components/Badges.jsx';

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filter = params.get('filter') ?? 'open';
  const search = params.get('q') ?? '';

  useEffect(() => {
    api
      .tasks({ status: filter === 'overdue' ? 'overdue' : filter === 'done' ? 'completed' : filter === 'failed' ? 'failed' : 'open' })
      .then(setTasks)
      .catch((e: Error) => setError(e.message));
  }, [filter]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!tasks) return [];
    return q ? tasks.filter((t) => [t.assetName, t.assetTag, t.assetLocation, t.templateTitle, t.siteName].some((s) => s?.toLowerCase().includes(q))) : tasks;
  }, [tasks, search]);

  const groups = useMemo(() => {
    const m = new Map<string, TaskView[]>();
    for (const t of visible) m.set(t.siteName, [...(m.get(t.siteName) ?? []), t]);
    return [...m.entries()];
  }, [visible]);

  const setFilter = (f: string) => setParams((p) => {
    p.set('filter', f);
    return p;
  });

  return (
    <>
      <h1>Tasks</h1>
      <div className="row">
        {['open', 'overdue', 'done', 'failed'].map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <input
          placeholder="Search asset, tag, location…"
          value={search}
          onChange={(e) =>
            setParams((p) => {
              if (e.target.value) p.set('q', e.target.value);
              else p.delete('q');
              return p;
            })
          }
          style={{ maxWidth: 280, marginLeft: 'auto' }}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {tasks === null && !error && <p className="spinner">Loading…</p>}
      {tasks && visible.length === 0 && <p className="muted">No tasks match.</p>}
      {groups.map(([siteName, list]) => (
        <section key={siteName}>
          <h2>
            {siteName} <span className="muted small">({list.length})</span>
          </h2>
          <div className="card tight">
            {list.map((t) => (
              <Link key={t.id} to={`/tasks/${t.id}`} className="task-item">
                <div className="row between">
                  <b>{t.templateTitle}</b>
                  <StatusPill status={t.status} />
                </div>
                <div className="small muted">
                  {t.assetTag ? `${t.assetTag} · ` : ''}
                  {t.assetName}
                  {t.assetLocation ? ` · ${t.assetLocation}` : ''} · due {t.dueDate}
                  {t.readingCount > 0 ? ` · ${t.readingCount} reading${t.readingCount === 1 ? '' : 's'}` : ''}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
