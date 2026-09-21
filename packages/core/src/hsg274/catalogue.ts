import type { Asset, PpmTemplate } from '../types.js';

const REF = 'HSG274 Part 2 (2014), Table 2.1';

/**
 * Planned preventive maintenance catalogue.
 *
 * Frequencies and thresholds follow HSG274 Part 2 Table 2.1 (hot and cold water systems) and
 * HTM 04-01 for healthcare premises. Task wording is paraphrased. A site's written scheme or
 * risk assessment may set a different frequency: that is stored on the schedule, not here.
 */
export const PPM_TEMPLATES: readonly PpmTemplate[] = [
  {
    code: 'CAL-INSPECT',
    title: 'Calorifier internal inspection and clean',
    summary:
      'Inspect the calorifier internally (inspection hatch or borescope), drain and clean, and check for scale and sludge. Frequency may be shortened where fouling is rapid.',
    frequency: 'annually',
    appliesTo: ['calorifier'],
    measurement: 'inspection',
    rules: [],
    checklist: [
      'Inspection hatch opened or borescope inspection completed',
      'Vessel drained and sediment / scale removed',
      'Internal surfaces free of significant corrosion',
      'Drain valve and flow / return thermometer pockets serviceable',
    ],
    reference: `${REF} – Calorifiers`,
  },
  {
    code: 'CAL-FLOW-RETURN',
    title: 'Calorifier flow and return temperatures',
    summary:
      'Confirm the calorifier flow is at least 60 °C and the return at least 50 °C (55 °C in healthcare premises).',
    frequency: 'monthly',
    appliesTo: ['calorifier'],
    measurement: 'flow_return_temperature',
    rules: [
      { channel: 'flow', label: 'Flow', comparator: 'min', value: 60 },
      { channel: 'return', label: 'Return', comparator: 'min', value: 50, valueHealthcare: 55 },
    ],
    reference: `${REF} – Calorifiers`,
  },
  {
    code: 'HWS-SENTINEL',
    title: 'Hot sentinel outlet temperature',
    summary:
      'Run the sentinel outlet (nearest and furthest from the calorifier) and confirm the water reaches at least 50 °C within one minute (55 °C in healthcare). For TMV blended outlets, measure the hot supply upstream of the valve.',
    frequency: 'monthly',
    appliesTo: ['hot_outlet', 'mixed_outlet'],
    requires: { sentinel: true },
    measurement: 'outlet_temperature',
    rules: [{ channel: 'hot', label: 'Hot outlet', comparator: 'min', value: 50, valueHealthcare: 55, withinSeconds: 60 }],
    reference: `${REF} – Hot water services (sentinel points)`,
  },
  {
    code: 'HWS-PRINCIPAL-LOOP',
    title: 'Principal return loop temperature',
    summary:
      'Circulating systems: confirm the return leg of each principal loop is at least 50 °C (55 °C in healthcare). Surface readings on metallic pipework are acceptable.',
    frequency: 'monthly',
    appliesTo: ['return_loop'],
    requires: { loopRank: ['principal'] },
    measurement: 'surface_temperature',
    rules: [{ channel: 'return', label: 'Return leg', comparator: 'min', value: 50, valueHealthcare: 55 }],
    reference: `${REF} – Hot water services (circulating systems)`,
  },
  {
    code: 'HWS-SUBORDINATE-LOOP',
    title: 'Subordinate return loop temperature',
    summary:
      'Circulating systems: confirm the return leg of each subordinate loop is at least 50 °C (55 °C in healthcare), by pipe surface reading or, where impractical, the last outlet on the loop within one minute of running.',
    frequency: 'quarterly',
    appliesTo: ['return_loop'],
    requires: { loopRank: ['subordinate'] },
    measurement: 'surface_temperature',
    rules: [{ channel: 'return', label: 'Return leg', comparator: 'min', value: 50, valueHealthcare: 55 }],
    reference: `${REF} – Hot water services (circulating systems)`,
  },
  {
    code: 'HWS-PROFILE',
    title: 'Hot water temperature profile (representative outlets)',
    summary:
      'Take temperatures at a representative selection of other hot outlets and tertiary loops, rotating through them so the whole system is profiled over a defined period. Outlets should reach at least 50 °C within one minute (55 °C in healthcare).',
    frequency: 'annually',
    appliesTo: ['hot_outlet', 'mixed_outlet', 'return_loop'],
    requires: { sentinel: false, loopRank: ['tertiary'] },
    measurement: 'outlet_temperature',
    rules: [{ channel: 'hot', label: 'Hot outlet', comparator: 'min', value: 50, valueHealthcare: 55, withinSeconds: 60 }],
    reference: `${REF} – Hot water services (representative selection)`,
  },
  {
    code: 'CWS-TANK-INSPECT',
    title: 'Cold water storage tank inspection',
    summary:
      'Inspect the cold water storage tank (lid, insulation, screens, overflow, internal condition) and carry out remedial work where necessary.',
    frequency: 'annually',
    appliesTo: ['cold_water_tank'],
    measurement: 'inspection',
    rules: [],
    checklist: [
      'Lid close-fitting and insect / vermin screens intact',
      'Insulation complete and dry',
      'Water clear, no debris, sediment, scale or biofilm',
      'No stagnation: inlet and outlet arranged for through-flow',
      'Overflow and warning pipes screened',
    ],
    reference: `${REF} – Cold water tanks`,
  },
  {
    code: 'CWS-TANK-TEMP',
    title: 'Cold water storage tank and incoming mains temperatures',
    summary:
      'Measure the tank water temperature remote from the ball valve and the incoming mains temperature. Note any max / min thermometer readings. Best done in summer, or as indicated by temperature profiling. Stored water should be below 20 °C.',
    frequency: 'annually',
    appliesTo: ['cold_water_tank'],
    measurement: 'tank_temperature',
    rules: [
      { channel: 'tank', label: 'Tank water', comparator: 'max', value: 20 },
      { channel: 'mains', label: 'Incoming mains', comparator: 'max', value: 20, severity: 'advisory' },
    ],
    reference: `${REF} – Cold water tanks`,
  },
  {
    code: 'CWS-SENTINEL',
    title: 'Cold sentinel outlet temperature',
    summary:
      'Run the sentinel cold tap (nearest and furthest from the incoming main, plus key points on long branches) and confirm the water is below 20 °C within two minutes.',
    frequency: 'monthly',
    appliesTo: ['cold_outlet', 'mixed_outlet'],
    requires: { sentinel: true },
    measurement: 'outlet_temperature',
    rules: [{ channel: 'cold', label: 'Cold outlet', comparator: 'max', value: 20, withinSeconds: 120 }],
    reference: `${REF} – Cold water services (sentinel taps)`,
  },
  {
    code: 'CWS-PROFILE',
    title: 'Cold water temperature profile (representative outlets)',
    summary:
      'Take temperatures at a representative selection of other cold outlets, rotating through them so the whole system is profiled over a defined period. Any reading above 20 °C indicates a problem.',
    frequency: 'annually',
    appliesTo: ['cold_outlet', 'mixed_outlet'],
    requires: { sentinel: false },
    measurement: 'outlet_temperature',
    rules: [{ channel: 'cold', label: 'Cold outlet', comparator: 'max', value: 20, withinSeconds: 120 }],
    reference: `${REF} – Cold water services (representative selection)`,
  },
  {
    code: 'SHOWER-CLEAN',
    title: 'Shower and spray tap clean and descale',
    summary:
      'Dismantle, clean and descale removable parts, heads, inserts and hoses. Shorten the interval where fouling is rapid or users are at higher risk.',
    frequency: 'quarterly',
    appliesTo: ['shower'],
    measurement: 'service',
    rules: [],
    checklist: ['Head and hose removed and descaled', 'Inserts / flow restrictors cleaned', 'Reassembled and flushed to drain'],
    reference: `${REF} – Showers and spray taps`,
  },
  {
    code: 'POU-TEMP',
    title: 'Point-of-use water heater temperature',
    summary:
      'Confirm the heater (no greater than 15 litres) delivers water at 50–60 °C, or that the installation has a high turnover. The interval is set by the risk assessment, between monthly and six-monthly.',
    frequency: 'monthly',
    appliesTo: ['pou_heater'],
    measurement: 'outlet_temperature',
    rules: [{ channel: 'pou', label: 'Heater outlet', comparator: 'range', value: 50, max: 60 }],
    reference: `${REF} – POU water heaters`,
  },
  {
    code: 'COMBI-OUTLET-TEMP',
    title: 'Combination water heater outlet temperature',
    summary: 'Confirm the heater delivers water at an outlet at 55–60 °C.',
    frequency: 'monthly',
    appliesTo: ['combi_heater'],
    measurement: 'outlet_temperature',
    rules: [{ channel: 'pou', label: 'Heater outlet', comparator: 'range', value: 55, max: 60 }],
    reference: `${REF} – Combination water heaters`,
  },
  {
    code: 'COMBI-HEADER-INSPECT',
    title: 'Combination water heater header tank inspection',
    summary:
      'Inspect the integral cold water header tank as part of the tank inspection regime; clean and disinfect as necessary. If hot water regularly overflows into the header tank, start weekly temperature monitoring of it.',
    frequency: 'annually',
    appliesTo: ['combi_heater'],
    measurement: 'inspection',
    rules: [],
    checklist: ['Header tank clean, lid fitted', 'No evidence of hot water overflowing into header tank', 'Cleaned / disinfected if required'],
    reference: `${REF} – Combination water heaters`,
  },
  {
    code: 'FLUSH-LITTLE-USED',
    title: 'Flush little-used outlet',
    summary:
      'Flush the outlet through and purge to drain until the temperature stabilises. Consider removing the outlet and cutting back redundant pipework. The interval is set by the risk assessment.',
    frequency: 'weekly',
    appliesTo: ['little_used_outlet', 'hot_outlet', 'cold_outlet', 'mixed_outlet', 'shower'],
    requires: { littleUsed: true },
    measurement: 'flush',
    rules: [],
    reference: `${REF} – Infrequently used outlets`,
  },
  {
    code: 'TMV-SERVICE',
    title: 'Thermostatic mixing valve service',
    summary:
      'Confirm the valve is still required, then service it to the manufacturer’s instructions: clean strainers, inspect and descale, disinfect, test fail-safe, and check the blended temperature. Interval set by the risk assessment; annually by default.',
    frequency: 'annually',
    appliesTo: ['tmv'],
    measurement: 'service',
    rules: [{ channel: 'blended', label: 'Blended outlet', comparator: 'max', value: 44, severity: 'advisory' }],
    checklist: ['Need for TMV confirmed', 'Strainers cleaned', 'Valve descaled and disinfected', 'Fail-safe (cold supply isolation) test passed'],
    reference: `${REF} – TMVs`,
  },
  {
    code: 'EXP-VESSEL-FLUSH',
    title: 'Expansion vessel flush',
    summary: 'Where practical, flush the expansion vessel through and purge to drain. Interval set by the risk assessment, between monthly and six-monthly.',
    frequency: 'six_monthly',
    appliesTo: ['expansion_vessel'],
    measurement: 'flush',
    rules: [],
    reference: `${REF} – Expansion vessels`,
  },
];

const byCode = new Map(PPM_TEMPLATES.map((t) => [t.code, t]));

export function getTemplate(code: string): PpmTemplate | undefined {
  return byCode.get(code);
}

export function requireTemplate(code: string): PpmTemplate {
  const t = byCode.get(code);
  if (!t) throw new Error(`Unknown PPM template: ${code}`);
  return t;
}

/** Does a probe reading feed this template? */
export function isProbeFed(template: PpmTemplate): boolean {
  return template.rules.length > 0;
}

/** Templates that should be scheduled for an asset given its attributes. */
export function templatesForAsset(asset: Pick<Asset, 'type' | 'sentinel' | 'littleUsed' | 'loopRank'>): PpmTemplate[] {
  return PPM_TEMPLATES.filter((t) => templateApplies(t, asset));
}

export function templateApplies(
  template: PpmTemplate,
  asset: Pick<Asset, 'type' | 'sentinel' | 'littleUsed' | 'loopRank'>,
): boolean {
  if (!template.appliesTo.includes(asset.type)) return false;
  const req = template.requires;
  if (!req) return true;
  if (req.littleUsed !== undefined) {
    // A dedicated little-used outlet asset always qualifies; other outlets need the flag.
    if (asset.type !== 'little_used_outlet' && asset.littleUsed !== req.littleUsed) return false;
  }
  if (asset.type === 'return_loop') {
    if (req.loopRank && (!asset.loopRank || !req.loopRank.includes(asset.loopRank))) return false;
    return true;
  }
  if (req.sentinel !== undefined && asset.sentinel !== req.sentinel) return false;
  return true;
}
