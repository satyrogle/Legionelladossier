import type { TemperatureRule, TemperatureSample } from '../types.js';

export type CaptureState = 'idle' | 'running' | 'stopped';

export interface CaptureConfig {
  comparator: TemperatureRule['comparator'];
  /** Threshold in °C (lower bound for range). */
  targetC: number;
  maxC?: number;
  /** Time limit in seconds for a timed outlet run (HSG274: 60 s hot, 120 s cold). */
  withinSeconds?: number;
  /** A reading is "stable" when every sample in this window sits within `stabilityBandC`. */
  stabilityWindowMs?: number;
  stabilityBandC?: number;
  minStableSamples?: number;
}

export interface CaptureSnapshot {
  state: CaptureState;
  elapsedMs: number;
  latestC: number | null;
  minC: number | null;
  maxC: number | null;
  sampleCount: number;
  stable: boolean;
  /** Whether the latest sample satisfies the rule right now. */
  satisfiedNow: boolean;
  /** Seconds at which the rule was first satisfied, null if not yet. */
  reachedTargetAtS: number | null;
  timeLimitPassed: boolean;
  /** Pass/fail can be called once the target is reached, or once the time limit has passed. */
  verdict: 'pass' | 'fail' | null;
}

export interface CaptureResult {
  valueC: number;
  minC: number;
  maxC: number;
  /** Seconds to first satisfy the rule; null when it never did during the run; undefined for untimed captures. */
  reachedTargetAtS: number | null | undefined;
  durationS: number;
  stable: boolean;
  samples: TemperatureSample[];
}

const DEFAULTS = { stabilityWindowMs: 5000, stabilityBandC: 0.3, minStableSamples: 3 };

/**
 * Turns a stream of probe samples into one reading for a task.
 *
 * For a timed rule (hot outlet ≥ 50 °C within 60 s) it records when the target was first met and
 * whether that was inside the limit. The recorded value is the sample at the time limit when the run
 * lasted that long, otherwise the last stabilised value. Untimed rules (calorifier flow, tank water)
 * just wait for a stable reading.
 */
export class TemperatureCapture {
  private readonly cfg: Required<Pick<CaptureConfig, 'stabilityWindowMs' | 'stabilityBandC' | 'minStableSamples'>> & CaptureConfig;
  private samples: TemperatureSample[] = [];
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private reachedAtMs: number | null = null;
  state: CaptureState = 'idle';

  constructor(config: CaptureConfig) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  static fromRule(rule: Pick<TemperatureRule, 'comparator' | 'max' | 'withinSeconds'>, targetC: number): TemperatureCapture {
    return new TemperatureCapture({ comparator: rule.comparator, targetC, maxC: rule.max, withinSeconds: rule.withinSeconds });
  }

  start(now: number): void {
    this.samples = [];
    this.startedAt = now;
    this.stoppedAt = null;
    this.reachedAtMs = null;
    this.state = 'running';
  }

  satisfies(c: number): boolean {
    switch (this.cfg.comparator) {
      case 'min':
        return c >= this.cfg.targetC;
      case 'max':
        return c <= this.cfg.targetC;
      case 'range':
        return c >= this.cfg.targetC && c <= (this.cfg.maxC ?? Number.POSITIVE_INFINITY);
    }
  }

  /** Feed one probe sample. Ignored unless running; non-finite values are dropped. */
  push(c: number, now: number): CaptureSnapshot {
    if (this.state === 'running' && this.startedAt !== null && Number.isFinite(c)) {
      const t = Math.max(0, now - this.startedAt);
      this.samples.push({ t, c });
      if (this.reachedAtMs === null && this.satisfies(c)) this.reachedAtMs = t;
    }
    return this.snapshot(now);
  }

  stop(now: number): CaptureResult {
    if (this.state === 'running') {
      this.stoppedAt = now;
      this.state = 'stopped';
    }
    return this.result();
  }

  get isRunning(): boolean {
    return this.state === 'running';
  }

  get timeLimitMs(): number | undefined {
    return this.cfg.withinSeconds === undefined ? undefined : this.cfg.withinSeconds * 1000;
  }

  snapshot(now: number): CaptureSnapshot {
    const elapsedMs = this.elapsedMs(now);
    const latest = this.samples[this.samples.length - 1];
    const stable = this.isStable();
    const reachedTargetAtS = this.reachedAtMs === null ? null : round1(this.reachedAtMs / 1000);
    const limit = this.timeLimitMs;
    const timeLimitPassed = limit !== undefined && elapsedMs >= limit;
    let verdict: CaptureSnapshot['verdict'] = null;
    if (limit !== undefined) {
      if (this.reachedAtMs !== null && this.reachedAtMs <= limit) verdict = 'pass';
      else if (timeLimitPassed) verdict = 'fail';
    } else if (latest && stable) {
      verdict = this.satisfies(latest.c) ? 'pass' : 'fail';
    }
    return {
      state: this.state,
      elapsedMs,
      latestC: latest?.c ?? null,
      minC: this.samples.length ? Math.min(...this.samples.map((s) => s.c)) : null,
      maxC: this.samples.length ? Math.max(...this.samples.map((s) => s.c)) : null,
      sampleCount: this.samples.length,
      stable,
      satisfiedNow: latest ? this.satisfies(latest.c) : false,
      reachedTargetAtS,
      timeLimitPassed,
      verdict,
    };
  }

  result(): CaptureResult {
    if (this.samples.length === 0) throw new Error('No samples captured');
    const end = this.stoppedAt ?? this.startedAt ?? 0;
    const durationS = Math.max(0, end - (this.startedAt ?? 0)) / 1000;
    const limit = this.timeLimitMs;
    const last = this.samples[this.samples.length - 1]!;
    let valueC: number;
    if (limit !== undefined) {
      const atLimit = this.samples.find((s) => s.t >= limit);
      valueC = atLimit ? atLimit.c : this.stableValue() ?? last.c;
    } else {
      valueC = this.stableValue() ?? last.c;
    }
    return {
      valueC: round1(valueC),
      minC: round1(Math.min(...this.samples.map((s) => s.c))),
      maxC: round1(Math.max(...this.samples.map((s) => s.c))),
      reachedTargetAtS: limit === undefined ? undefined : this.reachedAtMs === null ? null : round1(this.reachedAtMs / 1000),
      durationS: Math.round(durationS * 10) / 10,
      stable: this.isStable(),
      samples: this.samples.map((s) => ({ t: s.t, c: round1(s.c) })),
    };
  }

  private elapsedMs(now: number): number {
    if (this.startedAt === null) return 0;
    return Math.max(0, (this.stoppedAt ?? now) - this.startedAt);
  }

  private window(): TemperatureSample[] {
    const last = this.samples[this.samples.length - 1];
    if (!last) return [];
    const from = last.t - this.cfg.stabilityWindowMs;
    return this.samples.filter((s) => s.t > from);
  }

  private isStable(): boolean {
    const w = this.window();
    if (w.length < this.cfg.minStableSamples) return false;
    const last = this.samples[this.samples.length - 1]!;
    const first = this.samples[0]!;
    if (last.t - first.t < this.cfg.stabilityWindowMs) return false;
    const values = w.map((s) => s.c);
    return Math.max(...values) - Math.min(...values) <= this.cfg.stabilityBandC;
  }

  private stableValue(): number | null {
    if (!this.isStable()) return null;
    const w = this.window();
    return w.reduce((sum, s) => sum + s.c, 0) / w.length;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
