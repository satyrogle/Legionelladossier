import { describe, expect, it } from 'vitest';
import { TemperatureCapture } from '../src/index.js';

/** Feed a linear ramp from `fromC` to `toC` over `seconds`, one sample per second, then hold. */
function ramp(capture: TemperatureCapture, fromC: number, toC: number, seconds: number, holdSeconds: number, startMs = 1000) {
  capture.start(startMs);
  let now = startMs;
  for (let s = 0; s <= seconds + holdSeconds; s += 1) {
    const c = s <= seconds ? fromC + ((toC - fromC) * s) / seconds : toC;
    now = startMs + s * 1000;
    capture.push(c, now);
  }
  return now;
}

describe('TemperatureCapture: timed hot outlet', () => {
  it('passes when 50 °C is reached inside 60 s and records the value at the limit', () => {
    const cap = new TemperatureCapture({ comparator: 'min', targetC: 50, withinSeconds: 60 });
    const end = ramp(cap, 24, 56, 40, 30);
    const snap = cap.snapshot(end);
    expect(snap.verdict).toBe('pass');
    expect(snap.reachedTargetAtS).toBe(33); // 24 + 0.8*t ≥ 50 → t ≥ 32.5, first whole-second sample is 33
    const r = cap.stop(end);
    expect(r.reachedTargetAtS).toBe(33);
    expect(r.valueC).toBe(56);
    expect(r.minC).toBe(24);
    expect(r.maxC).toBe(56);
    expect(r.durationS).toBe(70);
    expect(r.stable).toBe(true);
  });

  it('fails once 60 s pass without reaching target', () => {
    const cap = new TemperatureCapture({ comparator: 'min', targetC: 50, withinSeconds: 60 });
    cap.start(0);
    for (let s = 0; s <= 59; s += 1) expect(cap.push(30 + s * 0.2, s * 1000).verdict).toBeNull();
    const snap = cap.push(42, 60_000);
    expect(snap.timeLimitPassed).toBe(true);
    expect(snap.verdict).toBe('fail');
    const r = cap.stop(61_000);
    expect(r.reachedTargetAtS).toBeNull();
    expect(r.valueC).toBe(42);
  });

  it('fails when the target is reached only after the limit', () => {
    const cap = new TemperatureCapture({ comparator: 'min', targetC: 50, withinSeconds: 60 });
    const end = ramp(cap, 20, 52, 80, 5);
    expect(cap.snapshot(end).verdict).toBe('fail');
    expect(cap.stop(end).reachedTargetAtS).toBe(75);
  });

  it('judges cold outlets against a maximum', () => {
    const cap = new TemperatureCapture({ comparator: 'max', targetC: 20, withinSeconds: 120 });
    const end = ramp(cap, 24, 15, 30, 10);
    expect(cap.snapshot(end).verdict).toBe('pass');
    expect(cap.stop(end).reachedTargetAtS).toBe(14);
  });
});

describe('TemperatureCapture: untimed stable reading', () => {
  it('waits for stability before giving a verdict', () => {
    const cap = new TemperatureCapture({ comparator: 'min', targetC: 60 });
    cap.start(0);
    expect(cap.push(58, 0).verdict).toBeNull();
    expect(cap.push(60.5, 1000).stable).toBe(false);
    for (let s = 2; s <= 5; s += 1) cap.push(61.2 + (s % 2) * 0.1, s * 1000);
    const snap = cap.push(61.2, 6000);
    expect(snap.stable).toBe(true);
    expect(snap.verdict).toBe('pass');
    const r = cap.stop(6000);
    expect(r.reachedTargetAtS).toBeUndefined();
    expect(r.valueC).toBeCloseTo(61.2, 0);
  });

  it('ignores samples before start and non-finite values', () => {
    const cap = new TemperatureCapture({ comparator: 'max', targetC: 20 });
    expect(cap.push(19, 0).sampleCount).toBe(0);
    cap.start(0);
    cap.push(Number.NaN, 100);
    expect(cap.push(19, 200).sampleCount).toBe(1);
    expect(() => new TemperatureCapture({ comparator: 'max', targetC: 20 }).result()).toThrow();
  });
});
