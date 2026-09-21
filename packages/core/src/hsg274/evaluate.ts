import type { Evaluation, Finding, PpmTemplate, Reading, Site, TemperatureRule } from '../types.js';

type SiteContext = Pick<Site, 'healthcare'>;
type ReadingLike = Pick<Reading, 'channel' | 'valueC' | 'reachedTargetAtS'>;

export function targetFor(rule: TemperatureRule, site: SiteContext): number {
  return site.healthcare && rule.valueHealthcare !== undefined ? rule.valueHealthcare : rule.value;
}

export function describeRule(rule: TemperatureRule, site: SiteContext): string {
  const target = targetFor(rule, site);
  const timing = rule.withinSeconds ? ` within ${formatSeconds(rule.withinSeconds)}` : '';
  switch (rule.comparator) {
    case 'min':
      return `at least ${target} °C${timing}`;
    case 'max':
      return `below ${target} °C${timing}`;
    case 'range':
      return `${target}–${rule.max} °C${timing}`;
  }
}

export function formatSeconds(s: number): string {
  if (s % 60 === 0) return s === 60 ? '1 minute' : `${s / 60} minutes`;
  return `${s} s`;
}

export function satisfiesRule(rule: TemperatureRule, site: SiteContext, valueC: number): boolean {
  const target = targetFor(rule, site);
  switch (rule.comparator) {
    case 'min':
      return valueC >= target;
    case 'max':
      return valueC <= target;
    case 'range':
      return valueC >= target && valueC <= (rule.max ?? Number.POSITIVE_INFINITY);
  }
}

/** Judge one reading against one rule. */
export function evaluateChannel(rule: TemperatureRule, site: SiteContext, reading: ReadingLike): Finding {
  const failSeverity = rule.severity ?? 'fail';
  const target = describeRule(rule, site);
  const value = `${reading.valueC.toFixed(1)} °C`;

  if (rule.withinSeconds !== undefined && reading.reachedTargetAtS !== undefined) {
    if (reading.reachedTargetAtS === null) {
      return {
        channel: rule.channel,
        severity: failSeverity,
        message: `${rule.label}: ${value}, target (${target}) not reached during the run`,
      };
    }
    if (reading.reachedTargetAtS > rule.withinSeconds) {
      return {
        channel: rule.channel,
        severity: failSeverity,
        message: `${rule.label}: target reached only after ${Math.round(reading.reachedTargetAtS)} s (limit ${formatSeconds(rule.withinSeconds)})`,
      };
    }
    return {
      channel: rule.channel,
      severity: 'info',
      message: `${rule.label}: ${value}, target reached at ${Math.round(reading.reachedTargetAtS)} s (${target})`,
    };
  }

  if (satisfiesRule(rule, site, reading.valueC)) {
    return { channel: rule.channel, severity: 'info', message: `${rule.label}: ${value} (${target})` };
  }
  return { channel: rule.channel, severity: failSeverity, message: `${rule.label}: ${value}, outside ${target}` };
}

/** Judge a whole task from its readings. Rules without a reading leave the task incomplete. */
export function evaluateTask(template: PpmTemplate, site: SiteContext, readings: readonly ReadingLike[]): Evaluation {
  const findings: Finding[] = [];
  let missing = 0;
  for (const rule of template.rules) {
    const reading = readings.find((r) => r.channel === rule.channel);
    if (!reading) {
      missing += 1;
      findings.push({ channel: rule.channel, severity: 'info', message: `${rule.label}: no reading recorded` });
      continue;
    }
    findings.push(evaluateChannel(rule, site, reading));
  }
  let outcome: Evaluation['outcome'] = 'pass';
  if (findings.some((f) => f.severity === 'fail')) outcome = 'fail';
  else if (findings.some((f) => f.severity === 'advisory')) outcome = 'advisory';
  else if (missing > 0) outcome = 'incomplete';
  return { outcome, findings };
}

export type SampleLevel = 'satisfactory' | 'low' | 'high';

export interface SampleAssessment {
  level: SampleLevel;
  actions: string[];
}

/**
 * Action levels following microbiological monitoring for legionella in hot and cold water systems
 * (HSG274 Part 2, Table 2.2). `majorityPositive` describes the sample set the result belongs to.
 */
export function assessLegionellaSample(cfuPerLitre: number, majorityPositive = false): SampleAssessment {
  if (cfuPerLitre > 1000) {
    return {
      level: 'high',
      actions: [
        'Resample the system immediately',
        'Carry out an immediate review of the control measures and risk assessment; identify remedial actions, including possible disinfection',
        'Retest a few days after disinfection and at frequent intervals until control is regained',
      ],
    };
  }
  if (cfuPerLitre > 100) {
    return majorityPositive
      ? {
          level: 'low',
          actions: [
            'Majority of samples positive: the system may be colonised at a low level',
            'Carry out an immediate review of the control measures and risk assessment; identify further remedial action',
            'Consider disinfection of the system',
          ],
        }
      : {
          level: 'low',
          actions: [
            'Minority of samples positive: resample the system',
            'If similar results recur, review the control measures and risk assessment and identify remedial actions',
          ],
        };
  }
  return { level: 'satisfactory', actions: ['No action beyond routine monitoring'] };
}
