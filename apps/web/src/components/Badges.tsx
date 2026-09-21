import type { Outcome, TaskStatus } from '@ld/core';

export function StatusPill({ status }: { status: TaskStatus }) {
  const cls = status === 'completed' ? 'pill-ok' : status === 'failed' || status === 'overdue' ? 'pill-bad' : status === 'due' ? 'pill-warn' : 'pill-muted';
  return <span className={`pill ${cls}`}>{status}</span>;
}

export function OutcomePill({ outcome }: { outcome: Outcome | undefined }) {
  if (!outcome) return null;
  const cls = outcome === 'pass' ? 'pill-ok' : outcome === 'fail' ? 'pill-bad' : outcome === 'advisory' ? 'pill-warn' : 'pill-muted';
  return <span className={`pill ${cls}`}>{outcome}</span>;
}

export function CompliancePct({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="pill pill-muted">no history</span>;
  const cls = pct >= 95 ? 'pill-ok' : pct >= 80 ? 'pill-warn' : 'pill-bad';
  return <span className={`pill ${cls}`}>{pct}% on time</span>;
}
