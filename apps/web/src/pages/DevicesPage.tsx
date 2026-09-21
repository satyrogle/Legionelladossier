import { useEffect, useState } from 'react';
import { api, type DeviceRecord, type DriverInfo } from '../api/client.js';
import { SIM_SCENARIOS, type SimScenario } from '../ble/simulator.js';
import { useProbe } from '../state/probe.jsx';

export function DevicesPage() {
  const { probe, status, latest, error, busy, supported, unsupportedReason, connectBluetooth, reconnect, connectSimulator, setSimulatorScenario, disconnect } = useProbe();
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [scenario, setScenario] = useState<SimScenario>('hot-pass');

  useEffect(() => {
    api.drivers().then(setDrivers).catch(() => undefined);
    api.devices().then(setDevices).catch(() => undefined);
  }, [probe]);

  return (
    <>
      <h1>Probe</h1>
      <div className="card">
        <div className="row between">
          <div>
            <b>{probe ? probe.name : 'No probe connected'}</b>
            <div className="small muted">{probe ? `${probe.kind === 'simulator' ? 'simulator' : 'Bluetooth'} · ${status} · driver ${probe.driverId}` : 'Connect the thermometer the engineer carries; readings then feed each task directly.'}</div>
          </div>
          <div className="big-temp mono">
            {latest ? latest.celsius.toFixed(1) : '--.-'}
            <small>°C</small>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={() => connectBluetooth().catch(() => undefined)} disabled={!supported || busy}>
            {busy ? 'Connecting…' : 'Connect Bluetooth probe'}
          </button>
          {probe && status !== 'connected' && probe.kind === 'bluetooth' && (
            <button className="btn" onClick={() => void reconnect()} disabled={busy}>
              Reconnect
            </button>
          )}
          {probe && (
            <button className="btn" onClick={() => void disconnect()}>
              Disconnect
            </button>
          )}
        </div>
        {!supported && <p className="small error">{unsupportedReason}</p>}
        {error && <p className="small error">{error}</p>}
      </div>

      <div className="card">
        <h3>Simulator</h3>
        <p className="small muted">For training and testing without hardware. Produces a realistic outlet warm-up or cool-down curve.</p>
        <div className="row">
          <select
            value={scenario}
            onChange={(e) => {
              const s = e.target.value as SimScenario;
              setScenario(s);
              setSimulatorScenario(s);
            }}
            style={{ maxWidth: 360 }}
            data-testid="sim-scenario"
          >
            {SIM_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => void connectSimulator(scenario)} data-testid="use-simulator">
            Use simulator
          </button>
        </div>
      </div>

      <h2>Supported thermometers</h2>
      <div className="grid">
        {drivers.map((d) => (
          <div key={d.id} className="card" style={{ margin: 0 }}>
            <h3>{d.name}</h3>
            <p className="small muted">{d.vendor}</p>
            <p className="small">{d.models.join(', ')}</p>
            <p className="small muted">{d.notes}</p>
          </div>
        ))}
      </div>
      <p className="small muted">
        Web Bluetooth works in Chrome and Edge on Android, Windows, macOS and ChromeOS over HTTPS. iOS Safari does not support it; use the Bluefy browser there.
      </p>

      <h2>Probes seen</h2>
      <div className="card tight table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Driver</th>
              <th>Calibration due</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  None yet.
                </td>
              </tr>
            )}
            {devices.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.driverId}</td>
                <td>
                  <input
                    type="date"
                    defaultValue={d.calibrationDue ?? ''}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== d.calibrationDue) void api.saveDevice(d.id, { name: d.name, driverId: d.driverId, model: d.model, serial: d.serial, calibrationDue: e.target.value });
                    }}
                    style={{ maxWidth: 170 }}
                  />
                </td>
                <td className="small muted">{d.lastSeenAt?.slice(0, 16).replace('T', ' ') ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
