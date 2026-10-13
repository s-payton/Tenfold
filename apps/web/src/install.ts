import { useEffect, useState } from 'react';

/** Chrome and Android's install prompt event (not in the DOM types yet). */
interface InstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export type InstallOption =
  | { readonly kind: 'none' }
  | { readonly kind: 'prompt'; readonly install: () => void }
  | { readonly kind: 'ios-hint' };

/** How this browser can install the app, if it is not installed already. */
export const useInstall = (): InstallOption => {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (installed) return { kind: 'none' };
  if (event) {
    return {
      kind: 'prompt',
      install: () => {
        void event.prompt().finally(() => setEvent(null));
      },
    };
  }
  return isIos() ? { kind: 'ios-hint' } : { kind: 'none' };
};
