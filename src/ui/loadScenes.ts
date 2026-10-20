// Loading-screen backdrops: real moments from the game. Add a scene by
// dropping `<name>-1280.webp`, `<name>-1920.webp` and `<name>-2560.webp` (16:9) in public/scenes/
// and listing its name here. The first one is preloaded in index.html.
const SCENES = ['brumas'];

const HOLD_MS = 7000;

export function startLoadScenes(): () => void {
  const host = document.getElementById('load-scenes');
  if (!host) return () => {};
  const make = (name: string) => {
    const img = document.createElement('img');
    img.className = 'scene';
    img.alt = '';
    img.decoding = 'async';
    // cover-cropped: held upright, the 16:9 scene is drawn a full screen-height tall
    img.sizes = '(orientation: portrait) 178vh, 100vw';
    img.srcset = `/scenes/${name}-1280.webp 1280w, /scenes/${name}-1920.webp 1920w, /scenes/${name}-2560.webp 2560w`;
    img.src = `/scenes/${name}-1280.webp`;
    return img;
  };
  const imgs: HTMLImageElement[] = [host.querySelector('img.scene') as HTMLImageElement];
  const ready = (img: HTMLImageElement) => {
    const on = () => img.classList.add('ready');
    if (img.complete && img.naturalWidth) on();
    else img.addEventListener('load', on, { once: true });
  };
  ready(imgs[0]);
  if (SCENES.length < 2) return () => {};
  let i = 0;
  const timer = window.setInterval(() => {
    const prev = imgs[i];
    i = (i + 1) % SCENES.length;
    if (!imgs[i]) {
      imgs[i] = make(SCENES[i]);
      host.appendChild(imgs[i]);
    }
    const next = imgs[i];
    next.classList.remove('ready');
    void next.offsetWidth; // restart the drift
    next.classList.add('on');
    ready(next);
    prev.classList.remove('on');
  }, HOLD_MS);
  return () => clearInterval(timer);
}
