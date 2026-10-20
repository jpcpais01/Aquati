// On phones and tablets, the first touch takes the game fullscreen and turns
// it sideways. Browsers only allow both inside a user gesture, and iOS Safari
// allows neither, so every step is best-effort and silent when refused.

const isTouchDevice = (): boolean =>
  matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;

const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

async function goImmersive(): Promise<void> {
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  try {
    if (!isStandalone() && !(doc.fullscreenElement ?? doc.webkitFullscreenElement)) {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else await root.webkitRequestFullscreen?.();
    }
  } catch {
    /* refused or unsupported */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation?.lock?.('landscape');
  } catch {
    /* lock needs fullscreen on most browsers; iOS has none */
  }
}

export function installImmersiveOnFirstTouch(): void {
  if (!isTouchDevice()) return;
  const onTouch = (): void => {
    window.removeEventListener('pointerup', onTouch, true);
    window.removeEventListener('touchend', onTouch, true);
    void goImmersive();
  };
  // pointerup/touchend count as activation gestures; pointerdown does not everywhere.
  window.addEventListener('pointerup', onTouch, true);
  window.addEventListener('touchend', onTouch, true);
}
