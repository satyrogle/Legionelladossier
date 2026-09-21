import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Probe, ProbeSample, ProbeStatus } from '../ble/probe.js';
import { SimulatedProbe, type SimScenario } from '../ble/simulator.js';
import { WebBluetoothProbe, webBluetoothSupported, webBluetoothUnavailableReason } from '../ble/webBluetooth.js';

interface ProbeContextValue {
  probe: Probe | null;
  status: ProbeStatus;
  latest: ProbeSample | null;
  error: string | null;
  busy: boolean;
  supported: boolean;
  unsupportedReason: string | null;
  connectBluetooth: () => Promise<void>;
  reconnect: () => Promise<void>;
  connectSimulator: (scenario: SimScenario) => Promise<void>;
  setSimulatorScenario: (scenario: SimScenario) => void;
  disconnect: () => Promise<void>;
}

const ProbeContext = createContext<ProbeContextValue | null>(null);

export function ProbeProvider({ children }: { children: ReactNode }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [status, setStatus] = useState<ProbeStatus>('disconnected');
  const [latest, setLatest] = useState<ProbeSample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!probe) return;
    setStatus(probe.status);
    setLatest(probe.latest);
    const offSample = probe.subscribe((s) => setLatest(s));
    const offStatus = probe.onStatus((s) => setStatus(s));
    return () => {
      offSample();
      offStatus();
    };
  }, [probe]);

  const swap = useCallback(
    async (next: Probe | null) => {
      if (probe && probe !== next) await probe.disconnect().catch(() => undefined);
      setLatest(null);
      setProbe(next);
    },
    [probe],
  );

  const connectBluetooth = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await WebBluetoothProbe.request();
      await p.connect();
      await swap(p);
      api.saveDevice(p.id, { name: p.name, driverId: p.driverId, lastSeenAt: new Date().toISOString() }).catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The user cancelling the chooser is not an error worth showing.
      if (!/cancel/i.test(msg)) setError(msg);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [swap]);

  const reconnect = useCallback(async () => {
    if (!probe) return;
    setBusy(true);
    setError(null);
    try {
      await probe.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [probe]);

  const connectSimulator = useCallback(
    async (scenario: SimScenario) => {
      setError(null);
      let speed = 1;
      try {
        speed = Number(localStorage.getItem('ld.simSpeed') ?? '1') || 1;
      } catch {
        // storage unavailable
      }
      const p = new SimulatedProbe(scenario, 250, speed);
      await p.connect();
      await swap(p);
    },
    [swap],
  );

  const setSimulatorScenario = useCallback(
    (scenario: SimScenario) => {
      if (probe instanceof SimulatedProbe) probe.setScenario(scenario);
    },
    [probe],
  );

  const disconnect = useCallback(async () => {
    await swap(null);
    setStatus('disconnected');
  }, [swap]);

  const value = useMemo<ProbeContextValue>(
    () => ({
      probe,
      status,
      latest,
      error,
      busy,
      supported: webBluetoothSupported(),
      unsupportedReason: webBluetoothUnavailableReason(),
      connectBluetooth,
      reconnect,
      connectSimulator,
      setSimulatorScenario,
      disconnect,
    }),
    [probe, status, latest, error, busy, connectBluetooth, reconnect, connectSimulator, setSimulatorScenario, disconnect],
  );

  return <ProbeContext.Provider value={value}>{children}</ProbeContext.Provider>;
}

export function useProbe(): ProbeContextValue {
  const ctx = useContext(ProbeContext);
  if (!ctx) throw new Error('useProbe must be used inside ProbeProvider');
  return ctx;
}
