import { useEffect, useState } from 'react';
import type { ProbeFrame } from '../ble/probe.js';
import { useProbe } from '../state/probe.jsx';

function fmtTime(at: number): string {
  const d = new Date(performance.timeOrigin + at);
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/** Raw frames and device details, for first contact with a new instrument. */
export function ProbeDiagnostics() {
  const { probe, info, status } = useProbe();
  const [frames, setFrames] = useState<readonly ProbeFrame[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!probe) return;
    const id = setInterval(() => setFrames([...probe.frames]), 500);
    return () => clearInterval(id);
  }, [probe]);

  if (!probe) return null;

  const report = () =>
    JSON.stringify(
      {
        userAgent: navigator.userAgent,
        probe: { name: probe.name, id: probe.id, kind: probe.kind, driverId: probe.driverId, status },
        info,
        frames: frames.slice(-40).map((f) => ({ t: fmtTime(f.at), source: f.source, hex: f.hex, decoded: f.decoded })),
      },
      null,
      2,
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy the diagnostics below', report());
    }
  };

  return (
    <details className="card">
      <summary>
        <b>Diagnostics</b> <span className="small muted">raw Bluetooth frames, for troubleshooting a new probe</span>
      </summary>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-sm" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
      </div>
      <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Source</th>
              <th>Bytes</th>
              <th>Decoded</th>
            </tr>
          </thead>
          <tbody>
            {frames.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Waiting for frames…
                </td>
              </tr>
            )}
            {[...frames].reverse().slice(0, 40).map((f, i) => (
              <tr key={`${f.at}-${i}`}>
                <td className="mono small">{fmtTime(f.at)}</td>
                <td className="small">{f.source}</td>
                <td className="mono small">{f.hex}</td>
                <td className="small">{f.decoded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
