import { useEffect } from 'react';

/** Keep the screen on while `active` (a probe run), so the phone does not sleep and drop Bluetooth mid-run. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    nav.wakeLock
      .request('screen')
      .then((l) => {
        if (cancelled) void l.release().catch(() => undefined);
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [active]);
}
