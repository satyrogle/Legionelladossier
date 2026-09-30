import {
  BATTERY_LEVEL_UUID,
  BATTERY_SERVICE_UUID,
  DEVICE_INFORMATION_UUID,
  FIRMWARE_REVISION_UUID,
  MANUFACTURER_NAME_UUID,
  MODEL_NUMBER_UUID,
  allOptionalServices,
  candidateDrivers,
  decodeUtf8,
  parseBatteryLevel,
  requestDeviceOptions,
  toHex,
  type ProbeCommand,
  type ProbeDriver,
  type ProbeSubscription,
} from '@ld/core';
import { Emitter, FrameLog, type Probe, type ProbeInfo, type ProbeSample, type ProbeStatus, type TimedProbeEvent } from './probe.js';

export function webBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && typeof navigator.bluetooth?.requestDevice === 'function';
}

/** Why Web Bluetooth is unavailable on this browser, for the UI to explain. */
export function webBluetoothUnavailableReason(): string | null {
  if (typeof navigator === 'undefined') return 'Not running in a browser';
  if (webBluetoothSupported()) return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'Safari and Chrome on iOS have no Web Bluetooth. Open this page in the Bluefy browser, or use an Android phone with Chrome.';
  if (/Firefox/.test(ua)) return 'Firefox does not implement Web Bluetooth. Use Chrome or Edge.';
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'Web Bluetooth needs HTTPS (or localhost). Open the app from an https:// address.';
  return 'This browser does not expose Web Bluetooth. Use Chrome or Edge on Android, Windows, macOS or ChromeOS.';
}

const BLANK_INFO: ProbeInfo = { supportsButton: false, supportsCommands: false, canSetInterval: false };

/**
 * A GATT connection to a temperature probe. Picks the first driver whose reading characteristic
 * exists on the device, subscribes to it, then (best effort) to the instrument's button/command
 * channel, and reads battery, model, firmware and instrument settings.
 */
export class WebBluetoothProbe implements Probe {
  readonly kind = 'bluetooth' as const;
  private device: BluetoothDevice;
  private reading: BluetoothRemoteGATTCharacteristic | null = null;
  private commandChar: BluetoothRemoteGATTCharacteristic | null = null;
  private settingsChar: BluetoothRemoteGATTCharacteristic | null = null;
  private batteryChar: BluetoothRemoteGATTCharacteristic | null = null;
  private driver: ProbeDriver | null = null;
  private activeSubscription: ProbeSubscription | null = null;
  private samples = new Emitter<ProbeSample>();
  private statuses = new Emitter<ProbeStatus>();
  private events = new Emitter<TimedProbeEvent>();
  private infos = new Emitter<ProbeInfo>();
  private log = new FrameLog();
  private _status: ProbeStatus = 'disconnected';
  private _latest: ProbeSample | null = null;
  private _error: string | null = null;
  private _info: ProbeInfo = BLANK_INFO;
  /** Web Bluetooth rejects overlapping GATT operations, so every read/write goes through this chain. */
  private gattChain: Promise<unknown> = Promise.resolve();

  private readonly onReading = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const sub = this.activeSubscription;
    if (!target.value || !sub) return;
    const c = sub.parse(target.value);
    const at = performance.now();
    this.log.push({ at, source: 'reading', hex: toHex(target.value), decoded: c === null ? 'no reading' : `${c.toFixed(2)} °C` });
    if (c === null) return;
    const sample = { celsius: c, at };
    this._latest = sample;
    this.samples.emit(sample);
  };

  private readonly onCommandNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const channel = this.driver?.commands;
    if (!target.value || !channel) return;
    const parsed = channel.parseNotification(target.value);
    const at = performance.now();
    this.log.push({ at, source: 'event', hex: toHex(target.value), decoded: parsed?.label ?? 'none' });
    if (!parsed) return;
    this.events.emit({ ...parsed, at });
    if (parsed.type === 'refresh') void this.refreshInfo().catch(() => undefined);
  };

  private readonly onBattery = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;
    this.setInfo({ batteryPct: parseBatteryLevel(target.value) });
  };

  private constructor(device: BluetoothDevice) {
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.reading = null;
      this.commandChar = null;
      this.settingsChar = null;
      this.batteryChar = null;
      this.setStatus('disconnected');
    });
  }

  /**
   * Opens the browser's device chooser. By default only supported probes are listed;
   * `acceptAll` lists every nearby device for probes that advertise an unexpected name.
   */
  static async request(opts: { acceptAll?: boolean } = {}): Promise<WebBluetoothProbe> {
    if (!webBluetoothSupported()) throw new Error(webBluetoothUnavailableReason() ?? 'Web Bluetooth unavailable');
    const device = opts.acceptAll
      ? await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: allOptionalServices() })
      : await navigator.bluetooth.requestDevice(requestDeviceOptions());
    return new WebBluetoothProbe(device);
  }

  /** Reconnect to a device the user already granted, without the chooser (Chrome with the new permissions backend). */
  static async fromGranted(deviceId: string): Promise<WebBluetoothProbe | null> {
    const bt = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
    if (!bt.getDevices) return null;
    const devices = await bt.getDevices();
    const device = devices.find((d) => d.id === deviceId);
    return device ? new WebBluetoothProbe(device) : null;
  }

  get id(): string {
    return this.device.id;
  }
  get name(): string {
    return this.device.name ?? 'Unnamed probe';
  }
  get driverId(): string {
    return this.driver?.id ?? 'unknown';
  }
  get status(): ProbeStatus {
    return this._status;
  }
  get latest(): ProbeSample | null {
    return this._latest;
  }
  get error(): string | null {
    return this._error;
  }
  get info(): ProbeInfo {
    return this._info;
  }
  get frames() {
    return this.log.frames;
  }

  async connect(): Promise<void> {
    if (!this.device.gatt) throw new Error('Device has no GATT server');
    this.setStatus('connecting');
    this._error = null;
    try {
      const server = await this.device.gatt.connect();
      const found = await this.subscribeReadings(server);
      if (!found) {
        server.disconnect();
        throw new Error(`"${this.name}" has no temperature service this app understands. Open the diagnostics panel and share the details.`);
      }
      this.setStatus('connected');
      // Everything below is optional: a probe without it still streams readings.
      await this.gatt(() => this.attachCommands(server));
      await this.gatt(() => this.readDeviceInformation(server));
      await this.gatt(() => this.attachBattery(server));
      await this.gatt(() => this.attachSettings(server));
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.reading) {
        this.reading.removeEventListener('characteristicvaluechanged', this.onReading);
        await this.reading.stopNotifications().catch(() => undefined);
      }
      if (this.commandChar) {
        this.commandChar.removeEventListener('characteristicvaluechanged', this.onCommandNotification);
        await this.commandChar.stopNotifications().catch(() => undefined);
      }
    } finally {
      this.reading = null;
      this.commandChar = null;
      this.device.gatt?.disconnect();
      this.setStatus('disconnected');
    }
  }

  subscribe(cb: (s: ProbeSample) => void): () => void {
    return this.samples.on(cb);
  }
  onStatus(cb: (status: ProbeStatus) => void): () => void {
    return this.statuses.on(cb);
  }
  onEvent(cb: (e: TimedProbeEvent) => void): () => void {
    return this.events.on(cb);
  }
  onInfo(cb: (info: ProbeInfo) => void): () => void {
    return this.infos.on(cb);
  }

  async sendCommand(command: ProbeCommand): Promise<void> {
    const channel = this.driver?.commands;
    const ch = this.commandChar;
    if (!channel || !ch) throw new Error('This probe does not accept commands');
    const bytes = channel.encodeCommand(command);
    await this.gatt(() => write(ch, bytes));
    this.log.push({ at: performance.now(), source: 'command', hex: toHex(new DataView(bytes.buffer)), decoded: command });
  }

  async setMeasurementInterval(seconds: number): Promise<void> {
    const channel = this.driver?.settings;
    const ch = this.settingsChar;
    if (!channel?.withMeasurementInterval || !ch) throw new Error('This probe does not expose its measurement interval');
    await this.gatt(async () => {
      const current = await ch.readValue();
      const next = channel.withMeasurementInterval!(current, seconds);
      await write(ch, next);
      this.log.push({ at: performance.now(), source: 'settings', hex: toHex(new DataView(next.buffer)), decoded: `measurement interval → ${seconds} s` });
    });
    await this.refreshInfo();
  }

  async refreshInfo(): Promise<void> {
    await this.gatt(async () => {
      if (this.batteryChar) this.setInfo({ batteryPct: parseBatteryLevel(await this.batteryChar.readValue()) });
      if (this.settingsChar && this.driver?.settings) {
        const v = await this.settingsChar.readValue();
        this.log.push({ at: performance.now(), source: 'settings', hex: toHex(v), decoded: 'instrument settings' });
        this.setInfo({ settings: this.driver.settings.parse(v) });
      }
    });
  }

  private gatt<T>(op: () => Promise<T>): Promise<T> {
    const next = this.gattChain.then(op, op);
    this.gattChain = next.catch(() => undefined);
    return next;
  }

  private async subscribeReadings(server: BluetoothRemoteGATTServer): Promise<boolean> {
    for (const driver of candidateDrivers(this.device.name)) {
      for (const sub of driver.subscriptions) {
        try {
          const service = await server.getPrimaryService(sub.serviceUuid);
          const characteristic = await service.getCharacteristic(sub.characteristicUuid);
          await characteristic.startNotifications();
          characteristic.addEventListener('characteristicvaluechanged', this.onReading);
          this.reading = characteristic;
          this.driver = driver;
          this.activeSubscription = sub;
          this.setInfo({ ...BLANK_INFO });
          return true;
        } catch {
          // this driver's service is not on the device; try the next candidate
        }
      }
    }
    return false;
  }

  private async attachCommands(server: BluetoothRemoteGATTServer): Promise<void> {
    const channel = this.driver?.commands;
    if (!channel) return;
    try {
      const ch = await (await server.getPrimaryService(channel.serviceUuid)).getCharacteristic(channel.characteristicUuid);
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', this.onCommandNotification);
      this.commandChar = ch;
      this.setInfo({ supportsButton: true, supportsCommands: ch.properties.write || ch.properties.writeWithoutResponse });
    } catch {
      // older firmware without the command channel: readings still work
    }
  }

  private async readDeviceInformation(server: BluetoothRemoteGATTServer): Promise<void> {
    try {
      const service = await server.getPrimaryService(DEVICE_INFORMATION_UUID);
      const readString = async (uuid: string) => {
        try {
          return decodeUtf8(await (await service.getCharacteristic(uuid)).readValue()) || undefined;
        } catch {
          return undefined;
        }
      };
      const model = await readString(MODEL_NUMBER_UUID);
      const manufacturer = await readString(MANUFACTURER_NAME_UUID);
      const firmware = await readString(FIRMWARE_REVISION_UUID);
      this.log.push({ at: performance.now(), source: 'info', hex: '', decoded: [manufacturer, model, firmware && `fw ${firmware}`].filter(Boolean).join(' · ') || 'no device information' });
      this.setInfo({ model, manufacturer, firmware });
    } catch {
      // no Device Information service
    }
  }

  private async attachBattery(server: BluetoothRemoteGATTServer): Promise<void> {
    try {
      const ch = await (await server.getPrimaryService(BATTERY_SERVICE_UUID)).getCharacteristic(BATTERY_LEVEL_UUID);
      this.batteryChar = ch;
      this.setInfo({ batteryPct: parseBatteryLevel(await ch.readValue()) });
      if (ch.properties.notify) {
        await ch.startNotifications().catch(() => undefined);
        ch.addEventListener('characteristicvaluechanged', this.onBattery);
      }
    } catch {
      // no Battery service
    }
  }

  private async attachSettings(server: BluetoothRemoteGATTServer): Promise<void> {
    const channel = this.driver?.settings;
    if (!channel) return;
    try {
      const ch = await (await server.getPrimaryService(channel.serviceUuid)).getCharacteristic(channel.characteristicUuid);
      this.settingsChar = ch;
      const v = await ch.readValue();
      this.log.push({ at: performance.now(), source: 'settings', hex: toHex(v), decoded: 'instrument settings' });
      this.setInfo({ settings: channel.parse(v), canSetInterval: Boolean(channel.withMeasurementInterval) && ch.properties.write });
    } catch {
      // settings not readable on this firmware
    }
  }

  private setInfo(patch: Partial<ProbeInfo>): void {
    this._info = { ...this._info, ...patch };
    this.infos.emit(this._info);
  }

  private setStatus(s: ProbeStatus): void {
    this._status = s;
    this.statuses.emit(s);
  }
}

async function write(ch: BluetoothRemoteGATTCharacteristic, bytes: Uint8Array): Promise<void> {
  const data = new Uint8Array(bytes);
  if (ch.properties.write && typeof ch.writeValueWithResponse === 'function') await ch.writeValueWithResponse(data);
  else if (typeof ch.writeValueWithoutResponse === 'function') await ch.writeValueWithoutResponse(data);
  else await ch.writeValue(data);
}
