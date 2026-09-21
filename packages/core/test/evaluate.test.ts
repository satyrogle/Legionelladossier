import { describe, expect, it } from 'vitest';
import { assessLegionellaSample, describeRule, evaluateTask, requireTemplate, targetFor } from '../src/index.js';

const site = { healthcare: false };
const nhs = { healthcare: true };

describe('evaluateTask', () => {
  const hot = requireTemplate('HWS-SENTINEL');
  const cold = requireTemplate('CWS-SENTINEL');
  const cal = requireTemplate('CAL-FLOW-RETURN');

  it('passes a hot sentinel that reaches 50 °C inside a minute', () => {
    const r = evaluateTask(hot, site, [{ channel: 'hot', valueC: 52.4, reachedTargetAtS: 38 }]);
    expect(r.outcome).toBe('pass');
  });

  it('fails a hot sentinel that only reaches 50 °C after a minute', () => {
    const r = evaluateTask(hot, site, [{ channel: 'hot', valueC: 51, reachedTargetAtS: 75 }]);
    expect(r.outcome).toBe('fail');
    expect(r.findings[0]?.message).toMatch(/after 75 s/);
  });

  it('fails a hot sentinel that never reaches target', () => {
    const r = evaluateTask(hot, site, [{ channel: 'hot', valueC: 46.2, reachedTargetAtS: null }]);
    expect(r.outcome).toBe('fail');
  });

  it('raises the hot target to 55 °C on healthcare sites', () => {
    expect(targetFor(hot.rules[0]!, nhs)).toBe(55);
    expect(describeRule(hot.rules[0]!, nhs)).toBe('at least 55 °C within 1 minute');
    const manual = evaluateTask(hot, nhs, [{ channel: 'hot', valueC: 52 }]);
    expect(manual.outcome).toBe('fail');
  });

  it('judges manual readings on value alone', () => {
    expect(evaluateTask(hot, site, [{ channel: 'hot', valueC: 50 }]).outcome).toBe('pass');
    expect(evaluateTask(cold, site, [{ channel: 'cold', valueC: 20.1 }]).outcome).toBe('fail');
    expect(evaluateTask(cold, site, [{ channel: 'cold', valueC: 17.9, reachedTargetAtS: 40 }]).outcome).toBe('pass');
  });

  it('needs every channel before it can pass', () => {
    expect(evaluateTask(cal, site, [{ channel: 'flow', valueC: 61 }]).outcome).toBe('incomplete');
    expect(evaluateTask(cal, site, [{ channel: 'flow', valueC: 61 }, { channel: 'return', valueC: 49 }]).outcome).toBe('fail');
    expect(evaluateTask(cal, nhs, [{ channel: 'flow', valueC: 61 }, { channel: 'return', valueC: 54 }]).outcome).toBe('fail');
    expect(evaluateTask(cal, site, [{ channel: 'flow', valueC: 61 }, { channel: 'return', valueC: 54 }]).outcome).toBe('pass');
  });

  it('treats an advisory rule as advisory, not failure', () => {
    const tank = requireTemplate('CWS-TANK-TEMP');
    const r = evaluateTask(tank, site, [{ channel: 'tank', valueC: 18 }, { channel: 'mains', valueC: 22 }]);
    expect(r.outcome).toBe('advisory');
  });

  it('checks ranges for POU heaters', () => {
    const pou = requireTemplate('POU-TEMP');
    expect(evaluateTask(pou, site, [{ channel: 'pou', valueC: 55 }]).outcome).toBe('pass');
    expect(evaluateTask(pou, site, [{ channel: 'pou', valueC: 62 }]).outcome).toBe('fail');
    expect(describeRule(pou.rules[0]!, site)).toBe('50–60 °C');
  });
});

describe('assessLegionellaSample (Table 2.2)', () => {
  it('bands results', () => {
    expect(assessLegionellaSample(50).level).toBe('satisfactory');
    expect(assessLegionellaSample(100).level).toBe('satisfactory');
    expect(assessLegionellaSample(101).level).toBe('low');
    expect(assessLegionellaSample(1000).level).toBe('low');
    expect(assessLegionellaSample(1001).level).toBe('high');
    expect(assessLegionellaSample(500, true).actions[0]).toMatch(/Majority/);
  });
});
