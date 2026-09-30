/**
 * ETI Ltd (Electronic Temperature Instruments) "BlueTherm LE" protocol, R1.0 / R1.1.
 *
 * Shared by ETI's Bluetooth LE instruments: Thermapen Blue, Thermapen ONE Blue (ThermoWorks states it
 * is backwards compatible with the existing protocol), ThermaQ Blue, BlueTherm One LE, TempTest Blue
 * and RayTemp Blue. Constants and layouts below match ETI's own ThermaLib Android SDK (3.0.2).
 *
 * Characteristics of the ETI service:
 *   …d701  Sensor 1 Reading        notify  float32 LE, °C (instrument display unit does not apply). FF FF FF FF = no reading.
 *   …d703  Sensor 2 Reading        notify  as above (two-channel instruments only)
 *   …d705  Commands+Notifications  notify / write  uint16 LE code (see below)
 *   …d707  Sensor 1 User Settings  read / write  high alarm float32 @0, low alarm float32 @4, name…
 *   …d708  Sensor 2 User Settings
 *   …d709  Instrument Settings     read / write  unit u8 @0 (1 = °F), measurement interval u16 @1 (s), auto-off u16 @3
 *   …d70a  Trim settings
 *
 * The Thermapen ONE Blue's new "enhanced display" features (checklist text, limits on the probe screen)
 * need ThermoWorks' newer protocol document, available to integrators on request. Readings, the
 * MEASURE/TRANSFER button and the commands below work with the existing protocol.
 */
export const ETI_SERVICE_UUID = '45544942-4c55-4554-4845-524db87ad700';
export const ETI_SENSOR_1_READING_UUID = '45544942-4c55-4554-4845-524db87ad701';
export const ETI_SENSOR_2_READING_UUID = '45544942-4c55-4554-4845-524db87ad703';
export const ETI_COMMANDS_NOTIFICATIONS_UUID = '45544942-4c55-4554-4845-524db87ad705';
export const ETI_SENSOR_1_SETTINGS_UUID = '45544942-4c55-4554-4845-524db87ad707';
export const ETI_SENSOR_2_SETTINGS_UUID = '45544942-4c55-4554-4845-524db87ad708';
export const ETI_INSTRUMENT_SETTINGS_UUID = '45544942-4c55-4554-4845-524db87ad709';
export const ETI_TRIM_SETTINGS_UUID = '45544942-4c55-4554-4845-524db87ad70a';

/** Advertised name prefixes of ETI BLE instruments (matched case-insensitively). */
export const ETI_NAME_PREFIXES = ['THERMAPEN', 'THERMAQ', 'BLUETHERM', 'TEMPTEST', 'RAYTEMP', 'THERMA'] as const;

export function isEtiDeviceName(name: string | undefined | null): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().replace(/[\s_-]+/g, '');
  return ETI_NAME_PREFIXES.some((p) => upper.startsWith(p));
}

/** Plausible range for a probe in a water system; anything else is an open-circuit or error code. */
const MIN_PLAUSIBLE_C = -50;
const MAX_PLAUSIBLE_C = 300;

/** Parse a sensor reading notification. Returns null for "no reading" (FF FF FF FF) and invalid frames. */
export function parseEtiTemperature(view: DataView): number | null {
  if (view.byteLength < 4) return null;
  if (view.getUint32(0, true) === 0xffffffff) return null;
  const c = view.getFloat32(0, true);
  if (!Number.isFinite(c) || c < MIN_PLAUSIBLE_C || c > MAX_PLAUSIBLE_C) return null;
  return c;
}

export function encodeEtiTemperature(celsius: number): DataView {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, celsius, true);
  return view;
}

// ---------- Commands + Notifications (…d705) ----------

export type EtiNotificationType = 'none' | 'button_pressed' | 'shutdown' | 'invalid_setting' | 'invalid_command' | 'request_refresh' | 'unknown';

const NOTIFICATION_TYPES: Record<number, EtiNotificationType> = {
  0: 'none',
  1: 'button_pressed',
  2: 'shutdown',
  3: 'invalid_setting',
  4: 'invalid_command',
  5: 'request_refresh',
};

export interface EtiNotification {
  code: number;
  type: EtiNotificationType;
}

export function parseEtiNotification(view: DataView): EtiNotification {
  const code = view.byteLength >= 2 ? view.getUint16(0, true) : view.byteLength === 1 ? view.getUint8(0) : 0;
  return { code, type: NOTIFICATION_TYPES[code] ?? 'unknown' };
}

/**
 * Commands the app may send. Set-defaults (0x0030) and factory-reset (0x0040) exist in the protocol
 * but are deliberately not exposed: they would wipe an engineer's instrument settings.
 */
export const ETI_COMMAND_CODES = { measure: 0x0010, identify: 0x0020 } as const;
export type EtiCommand = keyof typeof ETI_COMMAND_CODES;

export function encodeEtiCommand(command: EtiCommand): Uint8Array {
  const code: number | undefined = Object.prototype.hasOwnProperty.call(ETI_COMMAND_CODES, command) ? ETI_COMMAND_CODES[command] : undefined;
  if (code === undefined) throw new Error(`Unsupported probe command: ${String(command)}`);
  return Uint8Array.of(code & 0xff, (code >> 8) & 0xff);
}

export function encodeEtiNotification(code: number): DataView {
  const view = new DataView(new ArrayBuffer(2));
  view.setUint16(0, code, true);
  return view;
}

// ---------- Instrument Settings (…d709) ----------

export interface EtiInstrumentSettings {
  unit: 'C' | 'F';
  /** Seconds between transmitted readings. */
  measurementIntervalS: number;
  /** Auto-off interval as the instrument reports it. */
  autoOffInterval: number;
}

export function parseEtiInstrumentSettings(view: DataView): EtiInstrumentSettings | null {
  if (view.byteLength < 5) return null;
  return {
    unit: view.getUint8(0) === 1 ? 'F' : 'C',
    measurementIntervalS: view.getUint16(1, true),
    autoOffInterval: view.getUint16(3, true),
  };
}

/** Copy of the settings block with a new measurement interval, for a read-modify-write. */
export function withEtiMeasurementInterval(view: DataView, seconds: number): Uint8Array {
  if (view.byteLength < 5) throw new Error('Instrument settings block too short');
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error(`Invalid measurement interval: ${seconds}`);
  const out = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  new DataView(out.buffer).setUint16(1, seconds, true);
  return out;
}
