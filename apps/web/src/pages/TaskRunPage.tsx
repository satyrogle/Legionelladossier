import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ASSET_TYPE_LABELS, FREQUENCY_LABELS, MEASUREMENT_LABELS, evaluateTask, type Reading } from '@ld/core';
import { api, type ReadingInput, type TaskDetail } from '../api/client.js';
import { OutcomePill, StatusPill } from '../components/Badges.jsx';
import { CaptureCard } from '../components/CaptureCard.jsx';
import { enqueue, isNetworkError, pendingForTask, type PendingOp } from '../offline/queue.js';
import { useSync } from '../state/sync.jsx';
import { useLocalStorage } from '../state/useLocalStorage.js';

export function TaskRunPage() {
  const { taskId = '' } = useParams();
  const { refresh, online } = useSync();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [queued, setQueued] = useState<PendingOp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [engineer, setEngineer] = useLocalStorage('ld.engineer', '');
  const [busy, setBusy] = useState(false);
  const [flushStart, setFlushStart] = useState<number | null>(null);
  const [flushElapsed, setFlushElapsed] = useState(0);
  const [runningChannel, setRunningChannel] = useState<string | null>(null);
  const onRunningChange = useCallback((channel: string, running: boolean) => {
    setRunningChannel((current) => (running ? channel : current === channel ? null : current));
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api.task(taskId);
      setDetail(d);
      setNotes((n) => n || d.task.notes || '');
      setChecklist((c) => (Object.keys(c).length ? c : d.task.checklist ?? Object.fromEntries((d.template.checklist ?? []).map((i) => [i, false]))));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setQueued(await pendingForTask(taskId).catch(() => []));
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (flushStart === null) return;
    const id = setInterval(() => setFlushElapsed(Math.floor((performance.now() - flushStart) / 1000)), 500);
    return () => clearInterval(id);
  }, [flushStart]);

  // Readings the server knows about plus any still sitting in the offline queue.
  const localReadings = useMemo<Reading[]>(() => {
    if (!detail) return [];
    const queuedReadings = queued
      .filter((q) => q.kind === 'reading')
      .map((q, i) => ({ ...(q.payload as ReadingInput), id: `queued-${i}`, taskId, assetId: detail.asset.id, takenAt: q.createdAt }) as Reading);
    const byChannel = new Map<string, Reading>();
    for (const r of [...detail.readings, ...queuedReadings]) byChannel.set(r.channel, r);
    return [...byChannel.values()];
  }, [detail, queued, taskId]);

  const evaluation = useMemo(() => (detail ? evaluateTask(detail.template, detail.site, localReadings) : null), [detail, localReadings]);
  // The probe button drives one card at a time: the running one, else the first rule still without a reading.
  const buttonChannel = useMemo(() => {
    if (!detail) return null;
    if (runningChannel) return runningChannel;
    return detail.template.rules.find((r) => !localReadings.some((x) => x.channel === r.channel))?.channel ?? null;
  }, [detail, runningChannel, localReadings]);
  const queuedCompletion = queued.some((q) => q.kind === 'complete' || q.kind === 'skip');
  const closed = detail ? detail.task.status === 'completed' || detail.task.status === 'failed' || detail.task.status === 'skipped' : false;

  const recordReading = useCallback(
    async (input: ReadingInput) => {
      try {
        await api.addReading(taskId, input);
        await load();
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await enqueue({ kind: 'reading', taskId, payload: input });
        await refresh();
        setQueued(await pendingForTask(taskId));
      }
    },
    [taskId, load, refresh],
  );

  const complete = async () => {
    if (!detail || !evaluation) return;
    setBusy(true);
    setError(null);
    const body = { completedBy: engineer || undefined, notes: notes || undefined, checklist: detail.template.checklist ? checklist : undefined };
    try {
      await api.completeTask(taskId, body);
      await load();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueue({ kind: 'complete', taskId, payload: body });
        await refresh();
        setQueued(await pendingForTask(taskId));
      } else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    const reason = window.prompt('Why is this task being skipped? (e.g. no access, outlet removed)');
    if (!reason) return;
    setBusy(true);
    try {
      await api.skipTask(taskId, reason, engineer || undefined);
      await load();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueue({ kind: 'skip', taskId, payload: { reason, completedBy: engineer || undefined } });
        await refresh();
        setQueued(await pendingForTask(taskId));
      } else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    await api.reopenTask(taskId);
    await load();
  };

  if (error && !detail) return <p className="error">{error}</p>;
  if (!detail || !evaluation) return <p className="spinner">Loading…</p>;
  const { task, template, asset, site } = detail;
  const canComplete = !closed && !queuedCompletion && evaluation.outcome !== 'incomplete';
  const flushFinish = async () => {
    if (flushStart === null) return;
    const seconds = Math.round((performance.now() - flushStart) / 1000);
    setFlushStart(null);
    setNotes((n) => `${n ? `${n}\n` : ''}Flushed for ${seconds} s.`);
  };

  return (
    <>
      <p className="small">
        <Link to={`/sites/${site.id}`}>{site.name}</Link> / <Link to="/tasks">Tasks</Link>
      </p>
      <div className="row between">
        <h1 style={{ margin: '4px 0' }}>{template.title}</h1>
        <span className="row">
          <StatusPill status={task.status} />
          <OutcomePill outcome={task.outcome} />
        </span>
      </div>
      <div className="card tight">
        <div className="row between">
          <div>
            <b>{asset.name}</b>
            <div className="small muted">
              {asset.tag ? `${asset.tag} · ` : ''}
              {ASSET_TYPE_LABELS[asset.type]}
              {asset.location ? ` · ${asset.location}` : ''}
            </div>
          </div>
          <div className="small muted" style={{ textAlign: 'right' }}>
            {FREQUENCY_LABELS[template.frequency]} · period {task.periodStart} → {task.periodEnd}
            <br />
            due {task.dueDate} · {MEASUREMENT_LABELS[template.measurement]}
          </div>
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          {template.summary}
        </p>
        <p className="small muted">{template.reference}</p>
        {asset.notes && <p className="small">Asset notes: {asset.notes}</p>}
      </div>

      {!online && <div className="banner banner-warn">Offline: readings and completion are queued on this device and sent when the connection returns.</div>}
      {queued.length > 0 && <div className="banner banner-info">{queued.length} change{queued.length === 1 ? '' : 's'} queued for sync.</div>}

      <label className="field">
        <span>Engineer</span>
        <input value={engineer} onChange={(e) => setEngineer(e.target.value)} placeholder="Your name (kept on this device)" />
      </label>

      {template.rules.map((rule) => (
        <CaptureCard
          key={rule.channel}
          rule={rule}
          site={site}
          existing={localReadings.find((r) => r.channel === rule.channel)}
          finding={evaluation.findings.find((f) => f.channel === rule.channel)}
          engineer={engineer}
          disabled={closed || queuedCompletion}
          buttonTarget={buttonChannel === rule.channel}
          onRunningChange={onRunningChange}
          onRecord={recordReading}
        />
      ))}

      {template.measurement === 'flush' && (
        <div className="card">
          <h3>Flush to drain</h3>
          <p className="small muted">Run the outlet until the temperature stabilises. The duration is added to the notes.</p>
          <div className="row">
            <span className="timer mono">{Math.floor(flushElapsed / 60)}:{String(flushElapsed % 60).padStart(2, '0')}</span>
            {flushStart === null ? (
              <button className="btn btn-primary" onClick={() => {
                setFlushElapsed(0);
                setFlushStart(performance.now());
              }} disabled={closed}>
                Start flush timer
              </button>
            ) : (
              <button className="btn btn-ok" onClick={() => void flushFinish()}>
                Stop and log
              </button>
            )}
          </div>
        </div>
      )}

      {template.checklist && (
        <div className="card">
          <h3>Checklist</h3>
          {template.checklist.map((item) => (
            <label key={item} className="check">
              <input type="checkbox" checked={checklist[item] ?? false} disabled={closed} onChange={(e) => setChecklist({ ...checklist, [item]: e.target.checked })} />
              {item}
            </label>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Result</h3>
        {template.rules.length > 0 && (
          <ul className="small" style={{ paddingLeft: 18, margin: '4px 0' }}>
            {evaluation.findings.map((f, i) => (
              <li key={i} className={f.severity === 'fail' ? 'error' : f.severity === 'advisory' ? '' : 'muted'}>
                {f.message}
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ margin: '6px 0' }}>
          <b>Outcome:</b> <OutcomePill outcome={closed ? task.outcome : evaluation.outcome} />
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={closed} placeholder="Observations, remedial actions, who was informed" />
        </label>
        {error && <p className="error small">{error}</p>}
        {closed ? (
          <div className="row">
            <span className="small muted">
              {task.status} {task.completedAt ? `on ${task.completedAt.slice(0, 16).replace('T', ' ')}` : ''} {task.completedBy ? `by ${task.completedBy}` : ''}
            </span>
            <button className="btn btn-sm" onClick={() => void reopen()}>
              Reopen
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn btn-primary" onClick={() => void complete()} disabled={!canComplete || busy}>
              {evaluation.outcome === 'fail' ? 'Complete as failed' : 'Complete task'}
            </button>
            <button className="btn" onClick={() => void skip()} disabled={busy || queuedCompletion}>
              Skip…
            </button>
            {evaluation.outcome === 'incomplete' && <span className="small muted">Record every reading first.</span>}
          </div>
        )}
      </div>
    </>
  );
}
