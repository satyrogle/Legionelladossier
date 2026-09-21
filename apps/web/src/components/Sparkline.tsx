import type { TemperatureSample } from '@ld/core';

interface Props {
  samples: readonly TemperatureSample[];
  targetC?: number;
  limitMs?: number;
}

/** Tiny inline chart of a capture: temperature over time with the target and time-limit guides. */
export function Sparkline({ samples, targetC, limitMs }: Props) {
  if (samples.length < 2) return null;
  const w = 320;
  const h = 80;
  const pad = 4;
  const tMax = Math.max(samples[samples.length - 1]!.t, limitMs ?? 0, 1);
  const values = samples.map((s) => s.c);
  const cMin = Math.min(...values, targetC ?? Number.POSITIVE_INFINITY) - 1;
  const cMax = Math.max(...values, targetC ?? Number.NEGATIVE_INFINITY) + 1;
  const x = (t: number) => pad + (t / tMax) * (w - 2 * pad);
  const y = (c: number) => h - pad - ((c - cMin) / (cMax - cMin)) * (h - 2 * pad);
  const path = samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)},${y(s.c).toFixed(1)}`).join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Temperature trace">
      {targetC !== undefined && <line x1={pad} x2={w - pad} y1={y(targetC)} y2={y(targetC)} stroke="var(--ok)" strokeDasharray="4 3" strokeWidth="1" />}
      {limitMs !== undefined && limitMs <= tMax && <line x1={x(limitMs)} x2={x(limitMs)} y1={pad} y2={h - pad} stroke="var(--warn)" strokeDasharray="4 3" strokeWidth="1" />}
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" />
    </svg>
  );
}
