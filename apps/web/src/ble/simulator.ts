import { Emitter, type Probe, type ProbeSample, type ProbeStatus } from './probe.js';

export type SimScenario = 'hot-pass' | 'hot-slow' | 'hot-fail' | 'cold-pass' | 'cold-fail' | 'calorifier' | 'tank';

export const SIM_SCENARIOS: { id: SimScenario; label: string }[] = [
  { id: 'hot-pass', label: 'Hot outlet: reaches 54 °C in ~35 s' },
  { id: 'hot-slow', label: 'Hot outlet: reaches 50 °C only after ~80 s' },
  { id: 'hot-fail', label: 'Hot outlet: stalls at 46 °C' },
  { id: 'cold-pass', label: 'Cold outlet: falls to 15 °C in ~25 s' },
  { id: 'cold-fail', label: 'Cold outlet: stays at 23 °C' },
  { id: 'calorifier', label: 'Calorifier flow: steady 62 °C' },
  { id: 'tank', label: 'Tank water: steady 17 °C' },
];

interface Curve {
  start: number;
  end: number;
  /** Seconds for the exponential approach to close ~63 % of the gap. */
  tau: number;
  /** Seconds before the outlet starts to respond (dead leg). */
  delay: number;
}

const CURVES: Record<SimScenario, Curve> = {
  'hot-pass': { start: 22, end: 55, tau: 12, delay: 4 },
  'hot-slow': { start: 20, end: 52, tau: 45, delay: 10 },
  'hot-fail': { start: 21, end: 46, tau: 15, delay: 3 },
  'cold-pass': { start: 24, end: 14.5, tau: 9, delay: 2 },
  'cold-fail': { start: 23.5, end: 23, tau: 20, delay: 0 },
  calorifier: { start: 61.6, end: 62.1, tau: 3, delay: 0 },
  tank: { start: 17.2, end: 17, tau: 3, delay: 0 },
};

/** A fake probe producing realistic outlet warm-up / cool-down curves, four samples a second. */
export class SimulatedProbe implements Probe {
  readonly kind = 'simulator' as const;
  readonly id: string;
  readonly driverId = 'simulator';
  private samples = new Emitter<ProbeSample>();
  private statuses = new Emitter<ProbeStatus>();
  private _status: ProbeStatus = 'disconnected';
  private _latest: ProbeSample | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private t0 = 0;
  private noiseSeed = 1;

  constructor(
    public scenario: SimScenario = 'hot-pass',
    private readonly intervalMs = 250,
    /** Time multiplier: 10 runs the curve ten times faster (training and automated tests). */
    private readonly speed = 1,
  ) {
    this.id = `sim-${scenario}`;
  }

  get name(): string {
    return `Simulated probe (${this.scenario})`;
  }
  get status(): ProbeStatus {
    return this._status;
  }
  get latest(): ProbeSample | null {
    return this._latest;
  }
  get error(): string | null {
    return null;
  }

  async connect(): Promise<void> {
    this.restart();
    if (!this.timer) this.timer = setInterval(() => this.tick(), this.intervalMs);
    this._status = 'connected';
    this.statuses.emit('connected');
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._status = 'disconnected';
    this.statuses.emit('disconnected');
  }

  restart(): void {
    this.t0 = performance.now();
  }

  setScenario(s: SimScenario): void {
    this.scenario = s;
    this.restart();
  }

  subscribe(cb: (s: ProbeSample) => void): () => void {
    return this.samples.on(cb);
  }

  onStatus(cb: (status: ProbeStatus) => void): () => void {
    return this.statuses.on(cb);
  }

  /** Temperature at `seconds` after the run started, without noise. */
  valueAt(seconds: number): number {
    const c = CURVES[this.scenario];
    const s = Math.max(0, seconds - c.delay);
    return c.start + (c.end - c.start) * (1 - Math.exp(-s / c.tau));
  }

  private tick(): void {
    const now = performance.now();
    const seconds = ((now - this.t0) / 1000) * this.speed;
    this.noiseSeed = (this.noiseSeed * 1664525 + 1013904223) >>> 0;
    const noise = ((this.noiseSeed / 0x100000000) - 0.5) * 0.2;
    const sample = { celsius: Math.round((this.valueAt(seconds) + noise) * 10) / 10, at: now };
    this._latest = sample;
    this.samples.emit(sample);
  }
}
