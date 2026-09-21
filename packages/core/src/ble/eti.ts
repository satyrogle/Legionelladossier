/**
 * ETI Ltd (Electronic Temperature Instruments) Bluetooth LE thermometers:
 * ThermaQ Blue, BlueTherm One LE, BlueTherm Probe, Thermapen Blue, TempTest Blue and ThermoWorks
 * BlueDOT share the "ETIBLUETHERM" GATT service. Each channel notifies a little-endian IEEE 754
 * float32 in °C. Channel 1 is the probe socket used by single-channel instruments.
 */
export const ETI_SERVICE_UUID = '45544942-4c55-4554-4845-524db87ad700';
export const ETI_CHANNEL_1_TEMPERATURE_UUID = '45544942-4c55-4554-4845-524db87ad701';
export const ETI_CHANNEL_2_TEMPERATURE_UUID = '45544942-4c55-4554-4845-524db87ad703';
export const ETI_CHANNEL_1_CONFIG_UUID = '45544942-4c55-4554-4845-524db87ad707';
export const ETI_CHANNEL_2_CONFIG_UUID = '45544942-4c55-4554-4845-524db87ad708';
export const ETI_DEVICE_CONFIG_UUID = '45544942-4c55-4554-4845-524db87ad709';
export const ETI_TRIM_UUID = '45544942-4c55-4554-4845-524db87ad70a';

/** Advertised name prefixes seen on ETI / ThermoWorks BLE instruments. */
export const ETI_NAME_PREFIXES = ['THERMAQ', 'BLUETHERM', 'THERMAPEN', 'TEMPTEST', 'BLUEDOT', 'THERMA'] as const;

export function isEtiDeviceName(name: string | undefined | null): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().replace(/[\s_-]+/g, '');
  return ETI_NAME_PREFIXES.some((p) => upper.startsWith(p));
}

/** Plausible range for a probe in a water system; anything else is an open-circuit or error code. */
const MIN_PLAUSIBLE_C = -50;
const MAX_PLAUSIBLE_C = 300;

/** Parse an ETI channel notification. Returns null for open-circuit / invalid frames. */
export function parseEtiTemperature(view: DataView): number | null {
  if (view.byteLength < 4) return null;
  const c = view.getFloat32(0, true);
  if (!Number.isFinite(c) || c < MIN_PLAUSIBLE_C || c > MAX_PLAUSIBLE_C) return null;
  return c;
}

export function encodeEtiTemperature(celsius: number): DataView {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, celsius, true);
  return view;
}
