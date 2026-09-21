import { readFloat11073 } from './ieee11073.js';

/** Bluetooth SIG Health Thermometer Service and characteristics (128-bit form for Web Bluetooth). */
export const HTS_SERVICE_UUID = '00001809-0000-1000-8000-00805f9b34fb';
export const HTS_TEMPERATURE_MEASUREMENT_UUID = '00002a1c-0000-1000-8000-00805f9b34fb';
export const HTS_INTERMEDIATE_TEMPERATURE_UUID = '00002a1e-0000-1000-8000-00805f9b34fb';

export interface TemperatureMeasurement {
  celsius: number;
  unit: 'C' | 'F';
  timestamp?: Date;
  temperatureType?: number;
}

const FLAG_FAHRENHEIT = 0x01;
const FLAG_TIMESTAMP = 0x02;
const FLAG_TYPE = 0x04;

/** Parse a Temperature Measurement (0x2A1C) or Intermediate Temperature (0x2A1E) value. */
export function parseTemperatureMeasurement(view: DataView): TemperatureMeasurement {
  if (view.byteLength < 5) throw new Error(`Temperature Measurement too short: ${view.byteLength} bytes`);
  const flags = view.getUint8(0);
  const value = readFloat11073(view, 1);
  const unit: 'C' | 'F' = flags & FLAG_FAHRENHEIT ? 'F' : 'C';
  const celsius = unit === 'F' ? ((value - 32) * 5) / 9 : value;
  const out: TemperatureMeasurement = { celsius, unit };
  let offset = 5;
  if (flags & FLAG_TIMESTAMP && view.byteLength >= offset + 7) {
    const year = view.getUint16(offset, true);
    const month = view.getUint8(offset + 2);
    const day = view.getUint8(offset + 3);
    const hours = view.getUint8(offset + 4);
    const minutes = view.getUint8(offset + 5);
    const seconds = view.getUint8(offset + 6);
    if (year !== 0 && month !== 0 && day !== 0) out.timestamp = new Date(year, month - 1, day, hours, minutes, seconds);
    offset += 7;
  }
  if (flags & FLAG_TYPE && view.byteLength >= offset + 1) {
    out.temperatureType = view.getUint8(offset);
  }
  return out;
}
