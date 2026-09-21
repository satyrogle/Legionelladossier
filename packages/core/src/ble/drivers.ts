import { ESS_SERVICE_UUID, ESS_TEMPERATURE_UUID, parseEssTemperature } from './ess.js';
import { ETI_CHANNEL_1_TEMPERATURE_UUID, ETI_NAME_PREFIXES, ETI_SERVICE_UUID, isEtiDeviceName, parseEtiTemperature } from './eti.js';
import { HTS_INTERMEDIATE_TEMPERATURE_UUID, HTS_SERVICE_UUID, HTS_TEMPERATURE_MEASUREMENT_UUID, parseTemperatureMeasurement } from './hts.js';

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
  matchesName: (deviceName: string | undefined | null) => boolean;
}

const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
const DEVICE_INFORMATION_UUID = '0000180a-0000-1000-8000-00805f9b34fb';

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

export const ETI_DRIVER: ProbeDriver = {
  id: 'eti-bluetherm',
  name: 'ETI BlueTherm family',
  vendor: 'ETI Ltd / ThermoWorks',
  models: ['ThermaQ Blue', 'BlueTherm One LE', 'BlueTherm Probe', 'Thermapen Blue', 'TempTest Blue', 'BlueDOT'],
  notes: 'Custom ETIBLUETHERM service; channel 1 notifies a little-endian float32 in °C.',
  filters: [{ services: [ETI_SERVICE_UUID] }, ...ETI_NAME_PREFIXES.map((p) => ({ namePrefix: titleCase(p) })), ...ETI_NAME_PREFIXES.map((p) => ({ namePrefix: p }))],
  optionalServices: [ETI_SERVICE_UUID, BATTERY_SERVICE_UUID, DEVICE_INFORMATION_UUID],
  subscriptions: [{ serviceUuid: ETI_SERVICE_UUID, characteristicUuid: ETI_CHANNEL_1_TEMPERATURE_UUID, parse: parseEtiTemperature }],
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

/** Options for navigator.bluetooth.requestDevice covering every supported driver. */
export function requestDeviceOptions(): { filters: ScanFilter[]; optionalServices: string[] } {
  const filters = PROBE_DRIVERS.flatMap((d) => d.filters.map((f) => ({ ...f })));
  const optionalServices = [...new Set(PROBE_DRIVERS.flatMap((d) => d.optionalServices))];
  return { filters, optionalServices };
}

/** Drivers to try for a device, most likely first. Name matches win; the rest follow in registry order. */
export function candidateDrivers(deviceName: string | undefined | null): ProbeDriver[] {
  const named = PROBE_DRIVERS.filter((d) => d.matchesName(deviceName));
  const rest = PROBE_DRIVERS.filter((d) => !named.includes(d));
  return [...named, ...rest];
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
