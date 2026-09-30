/** Probe abstraction shared by the Web Bluetooth runtime and the simulator. */
import type { ProbeCommand, ProbeEvent, ProbeSettings } from '@ld/core';

export interface ProbeSample {
  celsius: number;
  /** performance.now() timestamp so it lines up with capture timers. */
  at: number;
}

export type ProbeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ProbeInfo {
  model?: string;
  manufacturer?: string;
  firmware?: string;
  batteryPct?: number | null;
  settings?: ProbeSettings | null;
  /** The instrument sends button presses (Thermapen MEASURE/TRANSFER). */
  supportsButton: boolean;
  supportsCommands: boolean;
  canSetInterval: boolean;
}

export interface TimedProbeEvent extends ProbeEvent {
  at: number;
}

/** One raw frame for the diagnostics log. */
export interface ProbeFrame {
  at: number;
  source: 'reading' | 'event' | 'command' | 'settings' | 'info';
  hex: string;
  decoded: string;
}

export interface Probe {
  readonly id: string;
  readonly name: string;
  readonly driverId: string;
  readonly kind: 'bluetooth' | 'simulator';
  readonly status: ProbeStatus;
  readonly latest: ProbeSample | null;
  readonly error: string | null;
  readonly info: ProbeInfo;
  readonly frames: readonly ProbeFrame[];
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Called on every sample; returns an unsubscribe function. */
  subscribe(cb: (s: ProbeSample) => void): () => void;
  onStatus(cb: (status: ProbeStatus) => void): () => void;
  onEvent(cb: (e: TimedProbeEvent) => void): () => void;
  onInfo(cb: (info: ProbeInfo) => void): () => void;
  sendCommand?(command: ProbeCommand): Promise<void>;
  setMeasurementInterval?(seconds: number): Promise<void>;
  refreshInfo?(): Promise<void>;
  /** Simulators restart their scenario; real probes ignore this. */
  restart?(): void;
}

export class Emitter<T> {
  private listeners = new Set<(v: T) => void>();
  on(cb: (v: T) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(v: T): void {
    for (const l of this.listeners) l(v);
  }
}

/** Ring buffer of recent frames for the diagnostics panel. */
export class FrameLog {
  private items: ProbeFrame[] = [];
  constructor(private readonly max = 60) {}
  push(frame: ProbeFrame): void {
    this.items.push(frame);
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }
  get frames(): readonly ProbeFrame[] {
    return this.items;
  }
}
