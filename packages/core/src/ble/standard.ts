/** Bluetooth SIG services every probe may expose: battery and device information. */
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
export const DEVICE_INFORMATION_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
export const MODEL_NUMBER_UUID = '00002a24-0000-1000-8000-00805f9b34fb';
export const FIRMWARE_REVISION_UUID = '00002a26-0000-1000-8000-00805f9b34fb';
export const HARDWARE_REVISION_UUID = '00002a27-0000-1000-8000-00805f9b34fb';
export const SOFTWARE_REVISION_UUID = '00002a28-0000-1000-8000-00805f9b34fb';
export const MANUFACTURER_NAME_UUID = '00002a29-0000-1000-8000-00805f9b34fb';
// Serial Number String (0x2A25) is on the Web Bluetooth blocklist, so browsers cannot read it.

export function parseBatteryLevel(view: DataView): number | null {
  if (view.byteLength < 1) return null;
  const pct = view.getUint8(0);
  return pct <= 100 ? pct : null;
}

export function decodeUtf8(view: DataView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1; // strip NUL padding
  return new TextDecoder().decode(bytes.subarray(0, end)).trim();
}

export function toHex(view: DataView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
