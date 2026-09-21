/** Shared domain model for the Legionella dossier. Dates are ISO strings; times are ISO 8601 with offset. */

export type Id = string;
/** Calendar date, YYYY-MM-DD. */
export type IsoDate = string;
/** Full timestamp, ISO 8601. */
export type IsoDateTime = string;

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'six_monthly', 'annually'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  six_monthly: 'Six-monthly',
  annually: 'Annually',
};

export interface Site {
  id: Id;
  name: string;
  /** Client or estate reference, e.g. a DEFRA site code. */
  code?: string;
  client?: string;
  address?: string;
  /** Healthcare premises follow HTM 04-01: hot targets rise from 50 °C to 55 °C. */
  healthcare: boolean;
  responsiblePerson?: string;
  createdAt: IsoDateTime;
}

export const ASSET_TYPES = [
  'calorifier',
  'cold_water_tank',
  'hot_outlet',
  'cold_outlet',
  'mixed_outlet',
  'shower',
  'tmv',
  'pou_heater',
  'combi_heater',
  'expansion_vessel',
  'return_loop',
  'little_used_outlet',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  calorifier: 'Calorifier / hot water generator',
  cold_water_tank: 'Cold water storage tank',
  hot_outlet: 'Hot outlet',
  cold_outlet: 'Cold outlet',
  mixed_outlet: 'TMV blended outlet',
  shower: 'Shower / spray tap',
  tmv: 'Thermostatic mixing valve',
  pou_heater: 'Point-of-use water heater',
  combi_heater: 'Combination water heater',
  expansion_vessel: 'Expansion vessel',
  return_loop: 'HWS return loop',
  little_used_outlet: 'Little-used outlet',
};

export type LoopRank = 'principal' | 'subordinate' | 'tertiary';

export interface Asset {
  id: Id;
  siteId: Id;
  type: AssetType;
  name: string;
  location?: string;
  /** Physical asset tag, e.g. DEF-A2-HT-014. */
  tag?: string;
  /** Sentinel outlets: nearest and furthest from the calorifier / incoming main. */
  sentinel: boolean;
  /** Flagged by the risk assessment as infrequently used (weekly flushing). */
  littleUsed: boolean;
  loopRank?: LoopRank;
  notes?: string;
  active: boolean;
  createdAt: IsoDateTime;
}

export type MeasurementKind =
  | 'outlet_temperature'
  | 'surface_temperature'
  | 'flow_return_temperature'
  | 'tank_temperature'
  | 'inspection'
  | 'flush'
  | 'service';

export const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  outlet_temperature: 'Outlet temperature (timed run)',
  surface_temperature: 'Pipe surface temperature',
  flow_return_temperature: 'Flow and return temperatures',
  tank_temperature: 'Tank and incoming mains temperatures',
  inspection: 'Inspection checklist',
  flush: 'Flush to drain',
  service: 'Service / clean',
};

export type Channel = 'hot' | 'cold' | 'flow' | 'return' | 'tank' | 'mains' | 'blended' | 'pou' | 'flush';

export const CHANNEL_LABELS: Record<Channel, string> = {
  hot: 'Hot outlet',
  cold: 'Cold outlet',
  flow: 'Calorifier flow',
  return: 'Return',
  tank: 'Tank water',
  mains: 'Incoming mains',
  blended: 'Blended outlet',
  pou: 'Heater outlet',
  flush: 'Flushed outlet',
};

export interface TemperatureRule {
  channel: Channel;
  label: string;
  comparator: 'min' | 'max' | 'range';
  /** Threshold in °C (lower bound for range). */
  value: number;
  /** Healthcare (HTM 04-01) variant of `value`, where it differs. */
  valueHealthcare?: number;
  /** Upper bound for range rules. */
  max?: number;
  /** Time limit for a timed outlet run, in seconds. */
  withinSeconds?: number;
  /** Advisory rules never fail a task on their own (e.g. incoming mains above 20 °C in summer). */
  severity?: 'fail' | 'advisory';
}

export interface PpmTemplate {
  code: string;
  title: string;
  summary: string;
  frequency: Frequency;
  appliesTo: readonly AssetType[];
  requires?: {
    sentinel?: boolean;
    littleUsed?: boolean;
    loopRank?: readonly LoopRank[];
  };
  measurement: MeasurementKind;
  rules: readonly TemperatureRule[];
  checklist?: readonly string[];
  reference: string;
}

/** An asset paired with a template. The frequency may be overridden by the risk assessment. */
export interface PpmSchedule {
  id: Id;
  siteId: Id;
  assetId: Id;
  templateCode: string;
  frequency: Frequency;
  active: boolean;
  createdAt: IsoDateTime;
}

export type TaskStatus = 'due' | 'overdue' | 'completed' | 'failed' | 'skipped';
export type Outcome = 'pass' | 'fail' | 'advisory' | 'incomplete';

export interface Task {
  id: Id;
  siteId: Id;
  assetId: Id;
  scheduleId: Id;
  templateCode: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  dueDate: IsoDate;
  status: TaskStatus;
  outcome?: Outcome;
  completedAt?: IsoDateTime;
  completedBy?: string;
  notes?: string;
}

export interface TemperatureSample {
  /** Milliseconds since the capture started. */
  t: number;
  /** Temperature in °C. */
  c: number;
}

export type ReadingSource = 'bluetooth' | 'manual' | 'simulator';

export interface Reading {
  id: Id;
  taskId: Id;
  assetId: Id;
  channel: Channel;
  /** The value judged against the rule: temperature at the time limit, or the stabilised value. */
  valueC: number;
  minC?: number;
  maxC?: number;
  /** Seconds until the rule was first satisfied; null when it never was; undefined for untimed or manual readings. */
  reachedTargetAtS?: number | null;
  durationS?: number;
  stable?: boolean;
  source: ReadingSource;
  deviceName?: string;
  deviceModel?: string;
  driverId?: string;
  samples?: TemperatureSample[];
  takenAt: IsoDateTime;
  takenBy?: string;
}

export interface Finding {
  channel?: Channel;
  severity: 'fail' | 'advisory' | 'info';
  message: string;
}

export interface Evaluation {
  outcome: Outcome;
  findings: Finding[];
}
