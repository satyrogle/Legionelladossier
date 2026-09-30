import { ESS_SERVICE_UUID, ESS_TEMPERATURE_UUID, parseEssTemperature } from './ess.js';
import {
  ETI_COMMANDS_NOTIFICATIONS_UUID,
  ETI_INSTRUMENT_SETTINGS_UUID,
  ETI_NAME_PREFIXES,
  ETI_SENSOR_1_READING_UUID,
  ETI_SERVICE_UUID,
  encodeEtiCommand,
  isEtiDeviceName,
  parseEtiInstrumentSettings,
  parseEtiNotification,
  parseEtiTemperature,
  withEtiMeasurementInterval,
} from './eti.js';
import { HTS_INTERMEDIATE_TEMPERATURE_UUID, HTS_SERVICE_UUID, HTS_TEMPERATURE_MEASUREMENT_UUID, parseTemperatureMeasurement } from './hts.js';
import { BATTERY_SERVICE_UUID, DEVICE_INFORMATION_UUID } from './standard.js';

/** Subset of Web Bluetooth's BluetoothLEScanFilter, kept free of DOM types so core stays portable. */
export interface ScanFilter {
  namePrefix?: string;
  services?: string[];
}

export interface ProbeSubscription {
  serviceUuid: string;
  characteristicUuid: string;
  /** Returns °C, or null when the frame carries no usable reading (open circuit, NaN, error code). */
  parse: (view: DataView) => number | null;
}

export type ProbeCommand = 'measure' | 'identify';

export type ProbeEventType = 'button' | 'shutdown' | 'refresh' | 'error' | 'other';

export interface ProbeEvent {
  type: ProbeEventType;
  code: number;
  label: string;
}

/** A second characteristic carrying instrument events (button presses) and accepting commands. */
export interface ProbeCommandChannel {
  serviceUuid: string;
  characteristicUuid: string;
  parseNotification: (view: DataView) => ProbeEvent | null;
  encodeCommand: (command: ProbeCommand) => Uint8Array;
}

export interface ProbeSettings {
  unit?: 'C' | 'F';
  measurementIntervalS?: number;
  autoOffInterval?: number;
}

export interface ProbeSettingsChannel {
  serviceUuid: string;
  characteristicUuid: string;
  parse: (view: DataView) => ProbeSettings | null;
  withMeasurementInterval?: (view: DataView, seconds: number) => Uint8Array;
}

export interface ProbeDriver {
  id: string;
  name: string;
  vendor: string;
  models: readonly string[];
  notes: string;
  filters: readonly ScanFilter[];
  optionalServices: readonly string[];
  /** Candidate characteristics, tried in order; the first one that exists is subscribed. */
  subscriptions: readonly ProbeSubscription[];
  commands?: ProbeCommandChannel;
  settings?: ProbeSettingsChannel;
  matchesName: (deviceName: string | undefined | null) => boolean;
}

function finiteOrNull(fn: (view: DataView) => number): (view: DataView) => number | null {
  return (view) => {
    try {
      const c = fn(view);
      return Number.isFinite(c) ? c : null;
    } catch {
      return null;
    }
  };
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export const ETI_DRIVER: ProbeDriver = {
  id: 'eti-bluetherm',
  name: 'ETI / ThermoWorks Blue instruments',
  vendor: 'ETI Ltd / ThermoWorks',
  models: ['Thermapen ONE Blue', 'Thermapen Blue', 'ThermaQ Blue', 'BlueTherm One LE', 'TempTest Blue', 'RayTemp Blue'],
  notes: 'ETI BlueTherm LE service. Live readings as float32 °C; the MEASURE/TRANSFER button arrives as an event and starts or records a run.',
  filters: [
    { services: [ETI_SERVICE_UUID] },
    ...ETI_NAME_PREFIXES.map((p) => ({ namePrefix: titleCase(p) })),
    ...ETI_NAME_PREFIXES.map((p) => ({ namePrefix: p })),
  ],
  optionalServices: [ETI_SERVICE_UUID, BATTERY_SERVICE_UUID, DEVICE_INFORMATION_UUID],
  subscriptions: [{ serviceUuid: ETI_SERVICE_UUID, characteristicUuid: ETI_SENSOR_1_READING_UUID, parse: parseEtiTemperature }],
  commands: {
    serviceUuid: ETI_SERVICE_UUID,
    characteristicUuid: ETI_COMMANDS_NOTIFICATIONS_UUID,
    parseNotification: (view) => {
      const n = parseEtiNotification(view);
      switch (n.type) {
        case 'none':
          return null;
        case 'button_pressed':
          return { type: 'button', code: n.code, label: 'Button pressed' };
        case 'shutdown':
          return { type: 'shutdown', code: n.code, label: 'Instrument switched off' };
        case 'request_refresh':
          return { type: 'refresh', code: n.code, label: 'Instrument settings changed' };
        case 'invalid_setting':
          return { type: 'error', code: n.code, label: 'Instrument rejected a setting' };
        case 'invalid_command':
          return { type: 'error', code: n.code, label: 'Instrument rejected a command' };
        default:
          return { type: 'other', code: n.code, label: `Notification ${n.code}` };
      }
    },
    encodeCommand: encodeEtiCommand,
  },
  settings: {
    serviceUuid: ETI_SERVICE_UUID,
    characteristicUuid: ETI_INSTRUMENT_SETTINGS_UUID,
    parse: parseEtiInstrumentSettings,
    withMeasurementInterval: withEtiMeasurementInterval,
  },
  matchesName: isEtiDeviceName,
};

export const HTS_DRIVER: ProbeDriver = {
  id: 'ble-health-thermometer',
  name: 'Standard Health Thermometer',
  vendor: 'Bluetooth SIG profile',
  models: ['Any thermometer implementing the Health Thermometer Service (0x1809)'],
  notes: 'Temperature Measurement (0x2A1C, indicate) or Intermediate Temperature (0x2A1E, notify); IEEE 11073 FLOAT.',
  filters: [{ services: [HTS_SERVICE_UUID] }],
  optionalServices: [HTS_SERVICE_UUID, BATTERY_SERVICE_UUID, DEVICE_INFORMATION_UUID],
  subscriptions: [
    { serviceUuid: HTS_SERVICE_UUID, characteristicUuid: HTS_INTERMEDIATE_TEMPERATURE_UUID, parse: finiteOrNull((v) => parseTemperatureMeasurement(v).celsius) },
    { serviceUuid: HTS_SERVICE_UUID, characteristicUuid: HTS_TEMPERATURE_MEASUREMENT_UUID, parse: finiteOrNull((v) => parseTemperatureMeasurement(v).celsius) },
  ],
  matchesName: () => false,
};

export const ESS_DRIVER: ProbeDriver = {
  id: 'ble-environmental-sensing',
  name: 'Standard Environmental Sensing',
  vendor: 'Bluetooth SIG profile',
  models: ['Any sensor implementing the Environmental Sensing Service temperature characteristic (0x2A6E)'],
  notes: 'int16 in 0.01 °C.',
  filters: [{ services: [ESS_SERVICE_UUID] }],
  optionalServices: [ESS_SERVICE_UUID, BATTERY_SERVICE_UUID, DEVICE_INFORMATION_UUID],
  subscriptions: [{ serviceUuid: ESS_SERVICE_UUID, characteristicUuid: ESS_TEMPERATURE_UUID, parse: finiteOrNull(parseEssTemperature) }],
  matchesName: () => false,
};

export const PROBE_DRIVERS: readonly ProbeDriver[] = [ETI_DRIVER, HTS_DRIVER, ESS_DRIVER];

export function getDriver(id: string): ProbeDriver | undefined {
  return PROBE_DRIVERS.find((d) => d.id === id);
}

/** Every service any driver may touch; Web Bluetooth only exposes services listed up front. */
export function allOptionalServices(): string[] {
  return [...new Set(PROBE_DRIVERS.flatMap((d) => d.optionalServices))];
}

/** Options for navigator.bluetooth.requestDevice covering every supported driver. */
export function requestDeviceOptions(): { filters: ScanFilter[]; optionalServices: string[] } {
  const filters = PROBE_DRIVERS.flatMap((d) => d.filters.map((f) => ({ ...f })));
  return { filters, optionalServices: allOptionalServices() };
}

/** Drivers to try for a device, most likely first. Name matches win; the rest follow in registry order. */
export function candidateDrivers(deviceName: string | undefined | null): ProbeDriver[] {
  const named = PROBE_DRIVERS.filter((d) => d.matchesName(deviceName));
  const rest = PROBE_DRIVERS.filter((d) => !named.includes(d));
  return [...named, ...rest];
}
