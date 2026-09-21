/** Probe abstraction shared by the Web Bluetooth runtime and the simulator. */

export interface ProbeSample {
  celsius: number;
  /** performance.now() timestamp so it lines up with capture timers. */
  at: number;
}

export type ProbeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Probe {
  readonly id: string;
  readonly name: string;
  readonly driverId: string;
  readonly kind: 'bluetooth' | 'simulator';
  readonly status: ProbeStatus;
  readonly latest: ProbeSample | null;
  readonly error: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Called on every sample; returns an unsubscribe function. */
  subscribe(cb: (s: ProbeSample) => void): () => void;
  onStatus(cb: (status: ProbeStatus) => void): () => void;
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
