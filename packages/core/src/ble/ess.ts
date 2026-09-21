/** Bluetooth SIG Environmental Sensing Service temperature characteristic: int16, 0.01 °C. */
export const ESS_SERVICE_UUID = '0000181a-0000-1000-8000-00805f9b34fb';
export const ESS_TEMPERATURE_UUID = '00002a6e-0000-1000-8000-00805f9b34fb';

export function parseEssTemperature(view: DataView): number {
  if (view.byteLength < 2) throw new Error(`ESS temperature too short: ${view.byteLength} bytes`);
  const raw = view.getInt16(0, true);
  if (raw === -32768) return Number.NaN; // "value is not known"
  return raw / 100;
}
