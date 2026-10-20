import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './style.css';
import { Game } from './game/game';
import { installImmersiveOnFirstTouch } from './core/immersive';

installImmersiveOnFirstTouch();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // updateViaCache 'none': always fetch sw.js itself fresh, so new builds are found on the next visit.
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
    /* no offline support this visit; the game still runs */
  });
}

const canvas = document.getElementById('game') as HTMLCanvasElement;

function fail(msg: string) {
  const tag = document.querySelector('#loading .tag');
  if (tag) tag.textContent = msg;
}

try {
  const game = new Game(canvas);
  if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as { aquati: Game }).aquati = game;
  game.init().catch((e) => {
    console.error(e);
    fail('The sea is rough: something went wrong while loading.');
  });
} catch (e) {
  console.error(e);
  fail('Shores of Fortune needs WebGL 2 to sail. Try a recent Chrome, Safari, Edge or Firefox.');
}
