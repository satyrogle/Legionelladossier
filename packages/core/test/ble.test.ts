import { describe, expect, it } from 'vitest';
import {
  ETI_DRIVER,
  encodeEtiCommand,
  encodeEtiNotification,
  parseBatteryLevel,
  parseEtiInstrumentSettings,
  parseEtiNotification,
  withEtiMeasurementInterval,
  decodeUtf8,
  toHex,
  HTS_DRIVER,
  candidateDrivers,
  encodeEtiTemperature,
  isEtiDeviceName,
  parseEssTemperature,
  parseEtiTemperature,
  parseTemperatureMeasurement,
  readFloat11073,
  requestDeviceOptions,
  writeFloat11073,
} from '../src/index.js';

function view(bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer);
}

describe('IEEE 11073 FLOAT', () => {
  it('decodes mantissa and exponent', () => {
    // 372 × 10^-1 = 37.2 : mantissa 0x000174, exponent 0xFF
    expect(readFloat11073(view([0x74, 0x01, 0x00, 0xff]), 0)).toBeCloseTo(37.2, 5);
    // negative mantissa: -25 × 10^-1
    expect(readFloat11073(view([0xe7, 0xff, 0xff, 0xff]), 0)).toBeCloseTo(-2.5, 5);
    expect(readFloat11073(view([0xff, 0xff, 0x7f, 0x00]), 0)).toBeNaN();
  });

  it('round-trips through the encoder', () => {
    const v = new DataView(new ArrayBuffer(4));
    writeFloat11073(v, 0, 51.3);
    expect(readFloat11073(v, 0)).toBeCloseTo(51.3, 5);
    writeFloat11073(v, 0, -4.7);
    expect(readFloat11073(v, 0)).toBeCloseTo(-4.7, 5);
  });
});

describe('Health Thermometer Service', () => {
  it('parses a Celsius measurement', () => {
    const m = parseTemperatureMeasurement(view([0x00, 0x74, 0x01, 0x00, 0xff]));
    expect(m.unit).toBe('C');
    expect(m.celsius).toBeCloseTo(37.2, 5);
    expect(m.timestamp).toBeUndefined();
  });

  it('converts Fahrenheit and reads timestamp and type', () => {
    // 1220 × 10^-1 = 122.0 °F = 50 °C; flags: F | timestamp | type
    const m = parseTemperatureMeasurement(view([0x07, 0xc4, 0x04, 0x00, 0xff, 0xea, 0x07, 0x09, 0x15, 0x0a, 0x1e, 0x05, 0x02]));
    expect(m.unit).toBe('F');
    expect(m.celsius).toBeCloseTo(50, 5);
    expect(m.timestamp?.getFullYear()).toBe(2026);
    expect(m.timestamp?.getMonth()).toBe(8);
    expect(m.temperatureType).toBe(2);
  });

  it('rejects short frames', () => {
    expect(() => parseTemperatureMeasurement(view([0x00, 0x01]))).toThrow();
  });
});

describe('Environmental Sensing', () => {
  it('reads 0.01 °C units', () => {
    expect(parseEssTemperature(view([0x0a, 0x14]))).toBeCloseTo(51.3, 5); // 0x140a = 5130
    expect(parseEssTemperature(view([0x00, 0x80]))).toBeNaN();
  });
});

describe('ETI BlueTherm', () => {
  it('decodes little-endian float32 °C', () => {
    expect(parseEtiTemperature(encodeEtiTemperature(52.7))).toBeCloseTo(52.7, 4);
    expect(parseEtiTemperature(encodeEtiTemperature(-3.2))).toBeCloseTo(-3.2, 4);
  });

  it('rejects open-circuit and garbage frames', () => {
    expect(parseEtiTemperature(view([0xff, 0xff, 0xff, 0xff]))).toBeNull(); // SDK "no reading" marker
    expect(parseEtiTemperature(encodeEtiTemperature(Number.NaN))).toBeNull();
    expect(parseEtiTemperature(encodeEtiTemperature(9999))).toBeNull();
    expect(parseEtiTemperature(view([0x01, 0x02]))).toBeNull();
  });

  it('recognises ETI device names', () => {
    expect(isEtiDeviceName('THERMAQ BLUE')).toBe(true);
    expect(isEtiDeviceName('ThermaQ Blue 1234')).toBe(true);
    expect(isEtiDeviceName('BlueTherm Probe')).toBe(true);
    expect(isEtiDeviceName('Thermapen Blue')).toBe(true);
    expect(isEtiDeviceName('Thermapen ONE Blue')).toBe(true);
    expect(isEtiDeviceName('RayTemp Blue')).toBe(true);
    expect(isEtiDeviceName('BlueDOT 1234')).toBe(false); // BlueDOT uses a different ThermoWorks service
    expect(isEtiDeviceName('Testo 105')).toBe(false);
    expect(isEtiDeviceName(undefined)).toBe(false);
  });
});

describe('driver registry', () => {
  it('orders candidates by name match', () => {
    expect(candidateDrivers('ThermaQ Blue')[0]).toBe(ETI_DRIVER);
    expect(candidateDrivers('Generic')[0]).toBe(ETI_DRIVER);
    expect(candidateDrivers('Generic')).toContain(HTS_DRIVER);
  });

  it('builds requestDevice options covering every driver', () => {
    const opts = requestDeviceOptions();
    expect(opts.filters.some((f) => f.services?.includes('45544942-4c55-4554-4845-524db87ad700'))).toBe(true);
    expect(opts.filters.some((f) => f.namePrefix === 'Thermaq')).toBe(true);
    expect(opts.optionalServices).toContain('00001809-0000-1000-8000-00805f9b34fb');
    expect(new Set(opts.optionalServices).size).toBe(opts.optionalServices.length);
  });
});

describe('ETI commands and notifications (…d705)', () => {
  it('decodes notification codes as uint16 little-endian', () => {
    expect(parseEtiNotification(view([0x01, 0x00]))).toEqual({ code: 1, type: 'button_pressed' });
    expect(parseEtiNotification(view([0x02, 0x00])).type).toBe('shutdown');
    expect(parseEtiNotification(view([0x05, 0x00])).type).toBe('request_refresh');
    expect(parseEtiNotification(view([0x09, 0x00])).type).toBe('unknown');
    expect(parseEtiNotification(view([])).type).toBe('none');
  });

  it('maps notifications to probe events through the driver', () => {
    const cmd = ETI_DRIVER.commands!;
    expect(cmd.parseNotification(encodeEtiNotification(1))).toEqual({ type: 'button', code: 1, label: 'Button pressed' });
    expect(cmd.parseNotification(encodeEtiNotification(2))?.type).toBe('shutdown');
    expect(cmd.parseNotification(encodeEtiNotification(0))).toBeNull();
  });

  it('encodes only the safe commands', () => {
    expect(Array.from(encodeEtiCommand('measure'))).toEqual([0x10, 0x00]);
    expect(Array.from(encodeEtiCommand('identify'))).toEqual([0x20, 0x00]);
    // @ts-expect-error factory reset is intentionally not exposed
    expect(() => encodeEtiCommand('factoryReset')).toThrow();
  });
});

describe('ETI instrument settings (…d709)', () => {
  const block = view([0x00, 0x05, 0x00, 0x0a, 0x00, 0x03, 0x00, 0x5f]);

  it('parses unit, measurement interval and auto-off', () => {
    expect(parseEtiInstrumentSettings(block)).toEqual({ unit: 'C', measurementIntervalS: 5, autoOffInterval: 10 });
    expect(parseEtiInstrumentSettings(view([0x01, 0x01, 0x00, 0x00, 0x00]))?.unit).toBe('F');
    expect(parseEtiInstrumentSettings(view([0x00, 0x01]))).toBeNull();
  });

  it('rewrites only the measurement interval', () => {
    const next = withEtiMeasurementInterval(block, 1);
    expect(Array.from(next)).toEqual([0x00, 0x01, 0x00, 0x0a, 0x00, 0x03, 0x00, 0x5f]);
    expect(() => withEtiMeasurementInterval(block, 0)).toThrow();
    expect(() => withEtiMeasurementInterval(view([0x00]), 1)).toThrow();
  });
});

describe('standard characteristics', () => {
  it('reads battery, strings and hex', () => {
    expect(parseBatteryLevel(view([87]))).toBe(87);
    expect(parseBatteryLevel(view([200]))).toBeNull();
    expect(decodeUtf8(view([0x54, 0x50, 0x31, 0x00, 0x00]))).toBe('TP1');
    expect(toHex(view([0x01, 0xab]))).toBe('01 ab');
  });
});
