import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProbeCommand } from '@ld/core';
import { api } from '../api/client.js';
import type { Probe, ProbeInfo, ProbeSample, ProbeStatus, TimedProbeEvent } from '../ble/probe.js';
import { SimulatedProbe, type SimScenario } from '../ble/simulator.js';
import { WebBluetoothProbe, webBluetoothSupported, webBluetoothUnavailableReason } from '../ble/webBluetooth.js';

interface ProbeContextValue {
  probe: Probe | null;
  status: ProbeStatus;
  latest: ProbeSample | null;
  info: ProbeInfo | null;
  lastEvent: TimedProbeEvent | null;
  error: string | null;
  busy: boolean;
  supported: boolean;
  unsupportedReason: string | null;
  connectBluetooth: (opts?: { acceptAll?: boolean }) => Promise<void>;
  reconnect: () => Promise<void>;
  connectSimulator: (scenario: SimScenario) => Promise<void>;
  setSimulatorScenario: (scenario: SimScenario) => void;
  pressSimulatedButton: () => void;
  sendCommand: (command: ProbeCommand) => Promise<void>;
  setMeasurementInterval: (seconds: number) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Subscribe to instrument events (button presses). */
  onProbeEvent: (cb: (e: TimedProbeEvent) => void) => () => void;
}

const ProbeContext = createContext<ProbeContextValue | null>(null);

export function ProbeProvider({ children }: { children: ReactNode }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [status, setStatus] = useState<ProbeStatus>('disconnected');
  const [latest, setLatest] = useState<ProbeSample | null>(null);
  const [info, setInfo] = useState<ProbeInfo | null>(null);
  const [lastEvent, setLastEvent] = useState<TimedProbeEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const savedModel = useRef<string | null>(null);

  useEffect(() => {
    if (!probe) return;
    setStatus(probe.status);
    setLatest(probe.latest);
    setInfo(probe.info);
    const offSample = probe.subscribe((s) => setLatest(s));
    const offStatus = probe.onStatus((s) => setStatus(s));
    const offInfo = probe.onInfo((i) => setInfo({ ...i }));
    const offEvent = probe.onEvent((e) => setLastEvent(e));
    return () => {
      offSample();
      offStatus();
      offInfo();
      offEvent();
    };
  }, [probe]);

  // Keep the probe register up to date once the model number is known.
  useEffect(() => {
    if (!probe || probe.kind !== 'bluetooth' || !info?.model) return;
    const key = `${probe.id}|${info.model}`;
    if (savedModel.current === key) return;
    savedModel.current = key;
    api.saveDevice(probe.id, { name: probe.name, driverId: probe.driverId, model: info.model, lastSeenAt: new Date().toISOString() }).catch(() => undefined);
  }, [probe, info?.model]);

  const swap = useCallback(
    async (next: Probe | null) => {
      if (probe && probe !== next) await probe.disconnect().catch(() => undefined);
      setLatest(null);
      setLastEvent(null);
      setInfo(next?.info ?? null);
      setProbe(next);
    },
    [probe],
  );

  const connectBluetooth = useCallback(
    async (opts: { acceptAll?: boolean } = {}) => {
      setBusy(true);
      setError(null);
      try {
        const p = await WebBluetoothProbe.request(opts);
        await swap(p);
        await p.connect();
        api.saveDevice(p.id, { name: p.name, driverId: p.driverId, lastSeenAt: new Date().toISOString() }).catch(() => undefined);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // The user cancelling the chooser is not an error worth showing.
        if (!/cancel/i.test(msg)) setError(msg);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [swap],
  );

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
      await swap(p);
      await p.connect();
    },
    [swap],
  );

  const setSimulatorScenario = useCallback(
    (scenario: SimScenario) => {
      if (probe instanceof SimulatedProbe) probe.setScenario(scenario);
    },
    [probe],
  );

  const pressSimulatedButton = useCallback(() => {
    if (probe instanceof SimulatedProbe) probe.pressButton();
  }, [probe]);

  const sendCommand = useCallback(
    async (command: ProbeCommand) => {
      if (!probe?.sendCommand) throw new Error('This probe does not accept commands');
      setError(null);
      try {
        await probe.sendCommand(command);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [probe],
  );

  const setMeasurementInterval = useCallback(
    async (seconds: number) => {
      if (!probe?.setMeasurementInterval) throw new Error('This probe does not expose its measurement interval');
      setError(null);
      try {
        await probe.setMeasurementInterval(seconds);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [probe],
  );

  const disconnect = useCallback(async () => {
    await swap(null);
    setStatus('disconnected');
  }, [swap]);

  const onProbeEvent = useCallback((cb: (e: TimedProbeEvent) => void) => (probe ? probe.onEvent(cb) : () => undefined), [probe]);

  const value = useMemo<ProbeContextValue>(
    () => ({
      probe,
      status,
      latest,
      info,
      lastEvent,
      error,
      busy,
      supported: webBluetoothSupported(),
      unsupportedReason: webBluetoothUnavailableReason(),
      connectBluetooth,
      reconnect,
      connectSimulator,
      setSimulatorScenario,
      pressSimulatedButton,
      sendCommand,
      setMeasurementInterval,
      disconnect,
      onProbeEvent,
    }),
    [probe, status, latest, info, lastEvent, error, busy, connectBluetooth, reconnect, connectSimulator, setSimulatorScenario, pressSimulatedButton, sendCommand, setMeasurementInterval, disconnect, onProbeEvent],
  );

  return <ProbeContext.Provider value={value}>{children}</ProbeContext.Provider>;
}

export function useProbe(): ProbeContextValue {
  const ctx = useContext(ProbeContext);
  if (!ctx) throw new Error('useProbe must be used inside ProbeProvider');
  return ctx;
}
