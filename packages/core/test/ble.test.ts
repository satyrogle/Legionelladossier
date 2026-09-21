import { describe, expect, it } from 'vitest';
import {
  ETI_DRIVER,
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
    expect(parseEtiTemperature(encodeEtiTemperature(Number.NaN))).toBeNull();
    expect(parseEtiTemperature(encodeEtiTemperature(9999))).toBeNull();
    expect(parseEtiTemperature(view([0x01, 0x02]))).toBeNull();
  });

  it('recognises ETI device names', () => {
    expect(isEtiDeviceName('THERMAQ BLUE')).toBe(true);
    expect(isEtiDeviceName('ThermaQ Blue 1234')).toBe(true);
    expect(isEtiDeviceName('BlueTherm Probe')).toBe(true);
    expect(isEtiDeviceName('Thermapen Blue')).toBe(true);
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
