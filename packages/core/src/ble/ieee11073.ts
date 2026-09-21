/** IEEE 11073-20601 32-bit FLOAT: 24-bit signed mantissa, 8-bit signed exponent (base 10). */
export function readFloat11073(view: DataView, offset: number): number {
  const raw = view.getUint32(offset, true);
  const mantissaRaw = raw & 0x00ffffff;
  const exponentRaw = (raw >> 24) & 0xff;
  switch (mantissaRaw) {
    case 0x007fffff: // NaN
    case 0x00800000: // NRes
    case 0x007ffffe: // +INFINITY
    case 0x00800002: // -INFINITY
    case 0x00800001: // reserved
      return Number.NaN;
  }
  const mantissa = mantissaRaw >= 0x00800000 ? mantissaRaw - 0x01000000 : mantissaRaw;
  const exponent = exponentRaw >= 0x80 ? exponentRaw - 0x100 : exponentRaw;
  return mantissa * 10 ** exponent;
}

/** Encode a number as IEEE 11073 FLOAT with one decimal place (used by the simulator and tests). */
export function writeFloat11073(view: DataView, offset: number, value: number, exponent = -1): void {
  const mantissa = Math.round(value / 10 ** exponent);
  const raw = ((exponent & 0xff) << 24) | (mantissa & 0x00ffffff);
  view.setUint32(offset, raw >>> 0, true);
}
