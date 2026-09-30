import { useEffect, useState } from 'react';
import { api, type DeviceRecord, type DriverInfo } from '../api/client.js';
import { SIM_SCENARIOS, type SimScenario } from '../ble/simulator.js';
import { ProbeDiagnostics } from '../components/ProbeDiagnostics.jsx';
import { useProbe } from '../state/probe.jsx';

export function DevicesPage() {
  const {
    probe,
    status,
    latest,
    info,
    lastEvent,
    error,
    busy,
    supported,
    unsupportedReason,
    connectBluetooth,
    reconnect,
    connectSimulator,
    setSimulatorScenario,
    pressSimulatedButton,
    sendCommand,
    setMeasurementInterval,
    disconnect,
  } = useProbe();
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [scenario, setScenario] = useState<SimScenario>('hot-pass');
  const [presses, setPresses] = useState(0);

  useEffect(() => {
    api.drivers().then(setDrivers).catch(() => undefined);
    api.devices().then(setDevices).catch(() => undefined);
  }, [probe, info?.model]);

  useEffect(() => {
    if (lastEvent?.type === 'button') setPresses((n) => n + 1);
  }, [lastEvent]);

  useEffect(() => setPresses(0), [probe]);

  const connected = probe !== null && status === 'connected';
  const interval = info?.settings?.measurementIntervalS;
  const eventAge = lastEvent ? Math.round((performance.now() - lastEvent.at) / 1000) : null;

  return (
    <>
      <h1>Probe</h1>
      <div className="card">
        <div className="row between">
          <div>
            <b>{probe ? probe.name : 'No probe connected'}</b>
            <div className="small muted">
              {probe
                ? `${probe.kind === 'simulator' ? 'simulator' : 'Bluetooth'} · ${status}${probe.driverId !== 'unknown' ? ` · driver ${probe.driverId}` : ''}`
                : 'Connect the thermometer the engineer carries; readings then feed each task directly.'}
            </div>
          </div>
          <div className="big-temp mono" data-testid="live-temp">
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
        {supported && !probe && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Probe not in the list?{' '}
            <button className="btn btn-sm" onClick={() => connectBluetooth({ acceptAll: true }).catch(() => undefined)} disabled={busy}>
              Show all nearby Bluetooth devices
            </button>
          </p>
        )}
        {!supported && <p className="small error">{unsupportedReason}</p>}
        {error && <p className="small error">{error}</p>}
      </div>

      {probe && (
        <div className="card">
          <h3>Instrument</h3>
          <table>
            <tbody>
              <tr>
                <th>Model</th>
                <td>{[info?.manufacturer, info?.model].filter(Boolean).join(' ') || <span className="muted">not reported</span>}</td>
              </tr>
              <tr>
                <th>Firmware</th>
                <td>{info?.firmware ?? <span className="muted">not reported</span>}</td>
              </tr>
              <tr>
                <th>Battery</th>
                <td>
                  {info?.batteryPct != null ? (
                    <span className={`pill ${info.batteryPct <= 20 ? 'pill-bad' : info.batteryPct <= 40 ? 'pill-warn' : 'pill-ok'}`}>{info.batteryPct}%</span>
                  ) : (
                    <span className="muted">not reported</span>
                  )}
                </td>
              </tr>
              <tr>
                <th>Readings every</th>
                <td>
                  {interval ? `${interval} s` : <span className="muted">not reported</span>}
                  {interval && interval > 1 && info?.canSetInterval && (
                    <>
                      {' '}
                      <button className="btn btn-sm" onClick={() => setMeasurementInterval(1).catch(() => undefined)}>
                        Set 1-second readings
                      </button>
                      <div className="small muted">Timed outlet runs need about one reading a second to time the 1-minute and 2-minute limits well.</div>
                    </>
                  )}
                </td>
              </tr>
              <tr>
                <th>Probe button</th>
                <td data-testid="button-status">
                  {info?.supportsButton ? (
                    presses > 0 ? (
                      <span className="pill pill-ok">
                        {presses} press{presses === 1 ? '' : 'es'} received{eventAge !== null ? ` · last ${eventAge} s ago` : ''}
                      </span>
                    ) : (
                      <span className="small">Press MEASURE/TRANSFER on the probe to test it.</span>
                    )
                  ) : connected ? (
                    <span className="muted small">This probe does not report button presses.</span>
                  ) : (
                    <span className="muted small">–</span>
                  )}
                </td>
              </tr>
              {lastEvent && lastEvent.type !== 'button' && (
                <tr>
                  <th>Last event</th>
                  <td>{lastEvent.label}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            {info?.supportsCommands && (
              <>
                <button className="btn btn-sm" onClick={() => sendCommand('identify').catch(() => undefined)} disabled={!connected}>
                  Identify probe
                </button>
                <button className="btn btn-sm" onClick={() => sendCommand('measure').catch(() => undefined)} disabled={!connected}>
                  Read now
                </button>
              </>
            )}
            {probe.kind === 'simulator' && (
              <button className="btn btn-sm" onClick={pressSimulatedButton} data-testid="sim-button">
                Press probe button
              </button>
            )}
          </div>
        </div>
      )}

      <ProbeDiagnostics />

      <details className="card" open={!probe}>
        <summary>
          <b>Connecting a Thermapen ONE Blue</b>
        </summary>
        <ol className="small" style={{ paddingLeft: 18 }}>
          <li>Unfold the probe to switch it on. Keep it unfolded while you connect.</li>
          <li>Do not pair it in the phone's Bluetooth settings. Close ThermaData, ThermoWorks or any other app that might already be connected, because the probe accepts one connection at a time.</li>
          <li>On Android, turn on Bluetooth and allow Chrome the "Nearby devices" (or Location) permission when asked.</li>
          <li>Press Connect Bluetooth probe and pick the Thermapen. The Bluetooth symbol shows on the probe display once connected.</li>
          <li>Watch the live reading above change as you hold the tip in your hand, then press MEASURE/TRANSFER to check the button arrives.</li>
          <li>In a task, the button starts the timed run and pressing it again records the reading.</li>
        </ol>
        <p className="small muted">
          If the probe is not listed, use Show all nearby Bluetooth devices. If it connects but shows no reading, open Diagnostics and use Copy diagnostics.
        </p>
      </details>

      <div className="card">
        <h3>Simulator</h3>
        <p className="small muted">For training and testing without hardware. Produces a realistic outlet warm-up or cool-down curve and has a virtual probe button.</p>
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
        Web Bluetooth works in Chrome and Edge on Android, Windows, macOS and ChromeOS over HTTPS. On an iPhone, use the Bluefy browser.
      </p>

      <h2>Probes seen</h2>
      <div className="card tight table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Model</th>
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
                <td className="small">{d.model ?? d.driverId}</td>
                <td>
                  <input
                    type="date"
                    defaultValue={d.calibrationDue ?? ''}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== d.calibrationDue)
                        void api.saveDevice(d.id, { name: d.name, driverId: d.driverId, model: d.model, serial: d.serial, calibrationDue: e.target.value });
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
