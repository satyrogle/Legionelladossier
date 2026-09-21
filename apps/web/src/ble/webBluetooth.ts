import { candidateDrivers, requestDeviceOptions, type ProbeDriver, type ProbeSubscription } from '@ld/core';
import { Emitter, type Probe, type ProbeSample, type ProbeStatus } from './probe.js';

export function webBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && typeof navigator.bluetooth?.requestDevice === 'function';
}

/** Why Web Bluetooth is unavailable on this browser, for the UI to explain. */
export function webBluetoothUnavailableReason(): string | null {
  if (typeof navigator === 'undefined') return 'Not running in a browser';
  if (webBluetoothSupported()) return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'Safari on iOS has no Web Bluetooth. Use the Bluefy browser on iOS, or an Android / desktop Chrome or Edge device.';
  if (/Firefox/.test(ua)) return 'Firefox does not implement Web Bluetooth. Use Chrome or Edge.';
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'Web Bluetooth needs HTTPS (or localhost).';
  return 'This browser does not expose Web Bluetooth. Use Chrome or Edge on Android, Windows, macOS or ChromeOS.';
}

/**
 * A GATT connection to a temperature probe. Picks the first driver whose service and characteristic
 * exist on the device, subscribes to notifications, and republishes parsed °C samples.
 */
export class WebBluetoothProbe implements Probe {
  readonly kind = 'bluetooth' as const;
  private device: BluetoothDevice;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private driver: ProbeDriver | null = null;
  private samples = new Emitter<ProbeSample>();
  private statuses = new Emitter<ProbeStatus>();
  private _status: ProbeStatus = 'disconnected';
  private _latest: ProbeSample | null = null;
  private _error: string | null = null;
  private readonly onValue = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const sub = this.activeSubscription;
    if (!target.value || !sub) return;
    const c = sub.parse(target.value);
    if (c === null) return;
    const sample = { celsius: c, at: performance.now() };
    this._latest = sample;
    this.samples.emit(sample);
  };
  private activeSubscription: ProbeSubscription | null = null;

  private constructor(device: BluetoothDevice) {
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.characteristic = null;
      this.setStatus('disconnected');
    });
  }

  /** Opens the browser's device chooser filtered to supported probes. */
  static async request(): Promise<WebBluetoothProbe> {
    if (!webBluetoothSupported()) throw new Error(webBluetoothUnavailableReason() ?? 'Web Bluetooth unavailable');
    const opts = requestDeviceOptions();
    const device = await navigator.bluetooth.requestDevice({ filters: opts.filters, optionalServices: opts.optionalServices });
    return new WebBluetoothProbe(device);
  }

  /** Reconnect to a device the user already granted, without the chooser (Chrome with "Web Bluetooth new permissions backend"). */
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

  async connect(): Promise<void> {
    if (!this.device.gatt) throw new Error('Device has no GATT server');
    this.setStatus('connecting');
    this._error = null;
    try {
      const server = await this.device.gatt.connect();
      for (const driver of candidateDrivers(this.device.name)) {
        for (const sub of driver.subscriptions) {
          try {
            const service = await server.getPrimaryService(sub.serviceUuid);
            const characteristic = await service.getCharacteristic(sub.characteristicUuid);
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', this.onValue);
            this.characteristic = characteristic;
            this.driver = driver;
            this.activeSubscription = sub;
            this.setStatus('connected');
            return;
          } catch {
            // this driver's service is not on the device; try the next candidate
          }
        }
      }
      server.disconnect();
      throw new Error(`No supported temperature service found on "${this.name}"`);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.characteristic) {
        this.characteristic.removeEventListener('characteristicvaluechanged', this.onValue);
        await this.characteristic.stopNotifications().catch(() => undefined);
      }
    } finally {
      this.characteristic = null;
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

  private setStatus(s: ProbeStatus): void {
    this._status = s;
    this.statuses.emit(s);
  }
}
