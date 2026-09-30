import { useCallback, useEffect, useRef, useState } from 'react';
import { CHANNEL_LABELS, TemperatureCapture, describeRule, targetFor, type CaptureSnapshot, type Finding, type Reading, type Site, type TemperatureRule } from '@ld/core';
import { Link } from 'react-router';
import type { ReadingInput } from '../api/client.js';
import { useProbe } from '../state/probe.jsx';
import { useWakeLock } from '../state/useWakeLock.js';
import { Sparkline } from './Sparkline.jsx';

interface Props {
  rule: TemperatureRule;
  site: Site;
  existing?: Reading;
  finding?: Finding;
  engineer: string;
  disabled?: boolean;
  /** This card answers the probe's button (only one card on a page does). */
  buttonTarget?: boolean;
  onRunningChange?: (channel: TemperatureRule['channel'], running: boolean) => void;
  onRecord: (reading: ReadingInput) => Promise<void>;
}

/** Ignore a second button event within this window (switch bounce, double notifications). */
const BUTTON_DEBOUNCE_MS = 800;

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Keep at most `max` evenly spaced samples so a two-minute trace stays small in the dossier. */
function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) out.push(items[Math.floor(i * step)]!);
  out.push(items[items.length - 1]!);
  return out;
}

/**
 * One rule of a task, fed live from the connected probe. Start the run with the probe under the
 * outlet; the card times the run, flags when the target is met, calls pass / fail against the
 * HSG274 limit, and records the reading when the temperature has stabilised.
 */
export function CaptureCard({ rule, site, existing, finding, engineer, disabled, buttonTarget, onRunningChange, onRecord }: Props) {
  const { probe, status, latest, info, onProbeEvent, pressSimulatedButton } = useProbe();
  const captureRef = useRef<TemperatureCapture | null>(null);
  const [snap, setSnap] = useState<CaptureSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [autoFinish, setAutoFinish] = useState(true);
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = targetFor(rule, site);
  const timed = rule.withinSeconds !== undefined;
  const connected = probe !== null && status === 'connected';
  const lastButtonAt = useRef(0);
  useWakeLock(running);

  useEffect(() => {
    onRunningChange?.(rule.channel, running);
  }, [running, rule.channel, onRunningChange]);

  const finish = useCallback(async () => {
    const cap = captureRef.current;
    if (!cap || !probe) return;
    setRunning(false);
    let result;
    try {
      result = cap.stop(performance.now());
    } catch {
      setSnap(null);
      return;
    }
    setSnap(cap.snapshot(performance.now()));
    setSaving(true);
    setError(null);
    try {
      await onRecord({
        channel: rule.channel,
        valueC: result.valueC,
        minC: result.minC,
        maxC: result.maxC,
        reachedTargetAtS: result.reachedTargetAtS,
        durationS: result.durationS,
        stable: result.stable,
        source: probe.kind === 'simulator' ? 'simulator' : 'bluetooth',
        deviceName: probe.name,
        driverId: probe.driverId,
        samples: downsample(result.samples, 240),
        takenBy: engineer || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [engineer, onRecord, probe, rule.channel]);

  // Feed probe samples into the capture while running.
  useEffect(() => {
    if (!running || !probe) return;
    const off = probe.subscribe((s) => {
      const cap = captureRef.current;
      if (cap?.isRunning) setSnap(cap.push(s.celsius, s.at));
    });
    return off;
  }, [running, probe]);

  // Tick the clock and apply the auto-finish policy.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const cap = captureRef.current;
      if (!cap?.isRunning) return;
      const now = performance.now();
      const s = cap.snapshot(now);
      setSnap(s);
      if (!autoFinish || s.sampleCount === 0) return;
      const limit = cap.timeLimitMs;
      if (limit !== undefined) {
        const settled = s.verdict !== null && s.stable;
        const overrun = s.elapsedMs >= limit + 30_000;
        if (settled || overrun) void finish();
      } else if (s.stable && s.elapsedMs >= 8000) {
        void finish();
      }
    }, 200);
    return () => clearInterval(id);
  }, [running, autoFinish, finish]);

  const start = () => {
    if (!probe) return;
    const cap = TemperatureCapture.fromRule(rule, target);
    captureRef.current = cap;
    cap.start(performance.now());
    probe.restart?.();
    setSnap(cap.snapshot(performance.now()));
    setError(null);
    setRunning(true);
  };

  // The probe's MEASURE/TRANSFER button: first press starts the run, the next press records it.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!buttonTarget) return;
    return onProbeEvent((e) => {
      if (e.type !== 'button') return;
      const now = performance.now();
      if (now - lastButtonAt.current < BUTTON_DEBOUNCE_MS) return;
      lastButtonAt.current = now;
      if (captureRef.current?.isRunning) {
        if ((captureRef.current.snapshot(now).sampleCount ?? 0) > 0) void finish();
      } else if (connected && !disabled && !saving) {
        startRef.current();
      }
    });
  }, [buttonTarget, onProbeEvent, finish, connected, disabled, saving]);

  const recordManual = async () => {
    const v = Number(manual);
    if (!Number.isFinite(v)) return;
    setSaving(true);
    setError(null);
    try {
      await onRecord({ channel: rule.channel, valueC: v, source: 'manual', takenBy: engineer || undefined });
      setManual('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const limitMs = rule.withinSeconds ? rule.withinSeconds * 1000 : undefined;
  const progressPct = snap && limitMs ? Math.min(100, (snap.elapsedMs / limitMs) * 100) : 0;
  const verdictCls = snap?.verdict === 'pass' ? 'ok' : snap?.verdict === 'fail' ? 'bad' : '';
  const live = running ? snap?.latestC ?? latest?.celsius ?? null : latest?.celsius ?? null;

  return (
    <div className="card">
      <div className="row between">
        <h3>
          {rule.label} <span className="muted small">({CHANNEL_LABELS[rule.channel]})</span>
        </h3>
        <span className="pill pill-muted">Target: {describeRule(rule, site)}</span>
      </div>

      {existing && !running && (
        <div className={`banner ${finding?.severity === 'fail' ? 'banner-bad' : finding?.severity === 'advisory' ? 'banner-warn' : 'banner-ok'}`}>
          Recorded {existing.valueC.toFixed(1)} °C
          {existing.reachedTargetAtS !== undefined && (existing.reachedTargetAtS === null ? ', target not reached' : `, target reached at ${Math.round(existing.reachedTargetAtS)} s`)}
          {existing.source !== 'manual' && existing.deviceName ? ` via ${existing.deviceName}` : existing.source === 'manual' ? ' (manual entry)' : ''}
          {finding && <div className="small" style={{ fontWeight: 400 }}>{finding.message}</div>}
        </div>
      )}
      {existing?.samples && existing.samples.length > 1 && !running && <Sparkline samples={existing.samples} targetC={target} limitMs={limitMs} />}

      <div className="row between" style={{ marginTop: 8 }}>
        <div className="big-temp mono">
          {live === null ? '--.-' : live.toFixed(1)}
          <small>°C</small>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end' }}>
          <div className="timer mono">{fmtClock(snap?.elapsedMs ?? 0)}</div>
          {timed && <div className="small muted">limit {fmtClock(limitMs!)}</div>}
        </div>
      </div>

      {timed && (
        <div className={`progress ${verdictCls}`}>
          <span style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {snap && (
        <div className="row small muted">
          <span>min {snap.minC?.toFixed(1) ?? '–'} / max {snap.maxC?.toFixed(1) ?? '–'} °C</span>
          <span>{snap.stable ? 'stable' : 'settling'}</span>
          {snap.reachedTargetAtS !== null && <span className="pill pill-ok">target at {Math.round(snap.reachedTargetAtS)} s</span>}
          {snap.verdict === 'fail' && running && <span className="pill pill-bad">outside limit</span>}
        </div>
      )}

      {connected && buttonTarget && info?.supportsButton && (
        <p className="small muted" data-testid="button-hint">
          {running ? 'Press the probe button to record now.' : 'Press the probe button to start the run.'}
        </p>
      )}

      {!connected && (
        <p className="small muted">
          No probe connected. <Link to="/devices">Connect a Bluetooth probe</Link> or enter the reading by hand below.
        </p>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        {!running ? (
          <button className="btn btn-primary" onClick={start} disabled={!connected || disabled || saving}>
            {existing ? 'Re-take with probe' : 'Start run'}
          </button>
        ) : (
          <button className="btn btn-ok" onClick={() => void finish()} disabled={saving || (snap?.sampleCount ?? 0) === 0}>
            Record now
          </button>
        )}
        {running && (
          <button
            className="btn"
            onClick={() => {
              captureRef.current = null;
              setRunning(false);
              setSnap(null);
            }}
          >
            Cancel
          </button>
        )}
        {probe?.kind === 'simulator' && buttonTarget && connected && (
          <button className="btn btn-sm" onClick={pressSimulatedButton} data-testid="sim-probe-button" title="Acts like the MEASURE/TRANSFER button on a Thermapen">
            Simulate probe button
          </button>
        )}
        <label className="check small" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={autoFinish} onChange={(e) => setAutoFinish(e.target.checked)} /> auto-record when settled
        </label>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="small muted">Manual entry (no probe)</summary>
        <div className="row" style={{ marginTop: 6 }}>
          <input type="number" step="0.1" inputMode="decimal" placeholder="°C" value={manual} onChange={(e) => setManual(e.target.value)} style={{ maxWidth: 140 }} disabled={disabled} />
          <button className="btn" onClick={() => void recordManual()} disabled={disabled || saving || manual === ''}>
            Record manual reading
          </button>
        </div>
      </details>

      {saving && <p className="spinner">Saving reading…</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
