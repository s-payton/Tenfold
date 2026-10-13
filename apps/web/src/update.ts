import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 15 * 60 * 1000;

let ready = false;
const listeners = new Set<() => void>();

/** Reloads into the new version. */
export const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh: () => {
    ready = true;
    for (const listener of listeners) listener();
  },
  onRegisteredSW: (_url, registration) => {
    if (!registration) return;
    // Look for a new version when the app opens, comes back to the front, and every so often.
    const check = () => void registration.update().catch(() => undefined);
    setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

/** True once a new version has downloaded and is waiting for a reload. */
export const useUpdateReady = (): boolean =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ready,
  );
