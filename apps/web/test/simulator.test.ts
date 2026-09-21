import { describe, expect, it } from 'vitest';
import { TemperatureCapture } from '@ld/core';
import { SimulatedProbe } from '../src/ble/simulator.js';

/** Drive a capture from the simulator's noise-free curve at four samples a second. */
function run(scenario: ConstructorParameters<typeof SimulatedProbe>[0], cfg: ConstructorParameters<typeof TemperatureCapture>[0], seconds: number) {
  const probe = new SimulatedProbe(scenario);
  const cap = new TemperatureCapture(cfg);
  cap.start(0);
  for (let t = 0; t <= seconds * 1000; t += 250) cap.push(probe.valueAt(t / 1000), t);
  return { snap: cap.snapshot(seconds * 1000), result: cap.stop(seconds * 1000) };
}

describe('simulator scenarios behave as their labels promise', () => {
  const hot = { comparator: 'min' as const, targetC: 50, withinSeconds: 60 };
  const cold = { comparator: 'max' as const, targetC: 20, withinSeconds: 120 };

  it('hot-pass reaches 50 °C well inside a minute', () => {
    const { result } = run('hot-pass', hot, 90);
    expect(result.reachedTargetAtS).not.toBeNull();
    expect(result.reachedTargetAtS!).toBeLessThan(45);
    expect(result.valueC).toBeGreaterThan(52);
  });

  it('hot-slow only reaches 50 °C after the limit', () => {
    const { snap, result } = run('hot-slow', hot, 150);
    expect(snap.verdict).toBe('fail');
    expect(result.reachedTargetAtS!).toBeGreaterThan(60);
  });

  it('hot-fail never reaches 50 °C', () => {
    const { snap, result } = run('hot-fail', hot, 100);
    expect(snap.verdict).toBe('fail');
    expect(result.reachedTargetAtS).toBeNull();
    expect(result.maxC).toBeLessThan(50);
  });

  it('cold-pass drops below 20 °C inside two minutes; cold-fail does not', () => {
    expect(run('cold-pass', cold, 60).snap.verdict).toBe('pass');
    const fail = run('cold-fail', cold, 130);
    expect(fail.snap.verdict).toBe('fail');
    expect(fail.result.reachedTargetAtS).toBeNull();
  });

  it('calorifier scenario settles above 60 °C for an untimed rule', () => {
    const { snap } = run('calorifier', { comparator: 'min', targetC: 60 }, 15);
    expect(snap.stable).toBe(true);
    expect(snap.verdict).toBe('pass');
  });
});
