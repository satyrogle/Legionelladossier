import { describe, expect, it } from 'vitest';
import { FREQUENCIES, PPM_TEMPLATES, requireTemplate, templatesForAsset, isProbeFed } from '../src/index.js';

describe('HSG274 catalogue', () => {
  it('has unique codes and valid frequencies', () => {
    const codes = PPM_TEMPLATES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const t of PPM_TEMPLATES) {
      expect(FREQUENCIES).toContain(t.frequency);
      expect(t.appliesTo.length).toBeGreaterThan(0);
      expect(t.reference).toMatch(/HSG274/);
      for (const r of t.rules) {
        if (r.comparator === 'range') expect(r.max).toBeGreaterThan(r.value);
      }
    }
  });

  it('encodes the Table 2.1 sentinel thresholds', () => {
    const hot = requireTemplate('HWS-SENTINEL');
    expect(hot.frequency).toBe('monthly');
    expect(hot.rules[0]).toMatchObject({ comparator: 'min', value: 50, valueHealthcare: 55, withinSeconds: 60 });
    const cold = requireTemplate('CWS-SENTINEL');
    expect(cold.frequency).toBe('monthly');
    expect(cold.rules[0]).toMatchObject({ comparator: 'max', value: 20, withinSeconds: 120 });
    const cal = requireTemplate('CAL-FLOW-RETURN');
    expect(cal.rules.map((r) => [r.channel, r.value])).toEqual([
      ['flow', 60],
      ['return', 50],
    ]);
    expect(requireTemplate('SHOWER-CLEAN').frequency).toBe('quarterly');
    expect(requireTemplate('FLUSH-LITTLE-USED').frequency).toBe('weekly');
    expect(requireTemplate('CAL-INSPECT').frequency).toBe('annually');
  });

  it('assigns templates by asset attributes', () => {
    const codes = (a: Parameters<typeof templatesForAsset>[0]) => templatesForAsset(a).map((t) => t.code);
    expect(codes({ type: 'hot_outlet', sentinel: true, littleUsed: false })).toEqual(['HWS-SENTINEL']);
    expect(codes({ type: 'hot_outlet', sentinel: false, littleUsed: false })).toEqual(['HWS-PROFILE']);
    expect(codes({ type: 'hot_outlet', sentinel: false, littleUsed: true })).toEqual(['HWS-PROFILE', 'FLUSH-LITTLE-USED']);
    expect(codes({ type: 'cold_outlet', sentinel: true, littleUsed: false })).toEqual(['CWS-SENTINEL']);
    expect(codes({ type: 'mixed_outlet', sentinel: true, littleUsed: false })).toEqual(['HWS-SENTINEL', 'CWS-SENTINEL']);
    expect(codes({ type: 'calorifier', sentinel: false, littleUsed: false })).toEqual(['CAL-INSPECT', 'CAL-FLOW-RETURN']);
    expect(codes({ type: 'return_loop', sentinel: false, littleUsed: false, loopRank: 'principal' })).toEqual(['HWS-PRINCIPAL-LOOP']);
    expect(codes({ type: 'return_loop', sentinel: false, littleUsed: false, loopRank: 'subordinate' })).toEqual(['HWS-SUBORDINATE-LOOP']);
    expect(codes({ type: 'return_loop', sentinel: false, littleUsed: false, loopRank: 'tertiary' })).toEqual(['HWS-PROFILE']);
    expect(codes({ type: 'little_used_outlet', sentinel: false, littleUsed: false })).toEqual(['FLUSH-LITTLE-USED']);
    expect(codes({ type: 'cold_water_tank', sentinel: false, littleUsed: false })).toEqual(['CWS-TANK-INSPECT', 'CWS-TANK-TEMP']);
  });

  it('marks probe-fed templates', () => {
    expect(isProbeFed(requireTemplate('HWS-SENTINEL'))).toBe(true);
    expect(isProbeFed(requireTemplate('CAL-INSPECT'))).toBe(false);
  });
});
