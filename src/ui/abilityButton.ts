import type { Haunt } from '../ships/haunt';

// The HUD's button for an event ship's power (the Hollow Jack's Phantom Run):
// a disc with a ghost on it and a ring that fills as the power comes back,
// breathing orange when it's ready and burning green while she's over. On a
// keyboard it wears its key, X; on a touch screen it sits above Port.

const GHOST =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="ab-body" d="M12 2.6c-4.3 0-7.2 3.2-7.2 7.6v10.6l2.4-1.8 2.4 1.8 2.4-1.8 2.4 1.8 2.4-1.8 2.4 1.8V10.2c0-4.4-2.9-7.6-7.2-7.6z"/>' +
  '<path class="ab-eye" d="M9.1 8.6c.9 0 1.6.9 1.6 2s-.7 2-1.6 2-1.6-.9-1.6-2 .7-2 1.6-2zm5.8 0c.9 0 1.6.9 1.6 2s-.7 2-1.6 2-1.6-.9-1.6-2 .7-2 1.6-2z"/>' +
  '<path class="ab-eye" d="M10.3 15.2c.5-.6 1.1-.9 1.7-.9s1.2.3 1.7.9c-.5.4-1.1.6-1.7.6s-1.2-.2-1.7-.6z"/></svg>';

export class AbilityButton {
  readonly el: HTMLButtonElement;
  private ring: HTMLElement;
  private shown = false;
  private last = '';
  onPress: () => void = () => {};

  constructor(parent: HTMLElement) {
    const b = document.createElement('button');
    b.className = 'ability hidden';
    b.id = 'btn-ability';
    b.title = 'Phantom Run (X)';
    b.setAttribute('aria-label', 'Phantom Run');
    b.innerHTML = `<i class="ab-ring"></i><span class="ab-ico">${GHOST}</span><small>Phantom</small><kbd class="kd">X</kbd>`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPress();
    });
    parent.appendChild(b);
    this.el = b;
    this.ring = b.querySelector('.ab-ring')!;
  }

  /** Shown while `h` is her power and she's at sea (null hides it). */
  update(h: Haunt | null) {
    const on = !!h;
    if (on !== this.shown) {
      this.shown = on;
      this.el.classList.toggle('hidden', !on);
    }
    if (!h) return;
    const st = h.state === 'phantom' ? 'over' : h.canCall() ? 'ready' : 'rest';
    // over: the ring drains with the run; resting: it fills back up
    const k = st === 'over' ? h.left01() : h.ready01();
    this.ring.style.setProperty('--rl', k.toFixed(3));
    if (st !== this.last) {
      this.last = st;
      this.el.classList.toggle('ready', st === 'ready');
      this.el.classList.toggle('over', st === 'over');
      if (st === 'ready') {
        // a flash as the spirits stir again
        this.el.classList.remove('woke');
        void this.el.offsetWidth;
        this.el.classList.add('woke');
      }
    }
  }
}
