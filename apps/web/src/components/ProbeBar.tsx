import { Link } from 'react-router';
import { useProbe } from '../state/probe.jsx';
import { useSync } from '../state/sync.jsx';

/** Status strip under the top bar: connection, live temperature, offline queue. */
export function ProbeBar() {
  const { probe, status, latest } = useProbe();
  const { online, pending, syncing } = useSync();
  return (
    <div className="statusline">
      <Link to="/devices" className="pill pill-light">
        {probe && status === 'connected' ? `${probe.name}: ${latest ? `${latest.celsius.toFixed(1)} °C` : 'waiting…'}` : probe && status === 'connecting' ? 'Connecting probe…' : 'No probe'}
      </Link>
      <span className="pill pill-light">{online ? 'online' : 'offline'}</span>
      {(pending > 0 || syncing) && <span className="pill pill-light">{syncing ? 'syncing…' : `${pending} queued`}</span>}
    </div>
  );
}
