// Keyboard, mouse and touch, normalised into a small control state.

export interface Controls {
  rudder: number; // -1 starboard .. +1 port
  sailDelta: number; // pulses: +1 more sail, -1 less
  firePort: boolean;
  fireStarboard: boolean;
  fireAuto: boolean;
  fireAim: boolean; // mouse click: the side the pointer is in
  zoom: number; // accumulated wheel / pinch delta
  steerHeading: number | null; // touch joystick: desired world heading
  steerThrottle: number; // 0..1 from joystick magnitude
  pointer: { x: number; y: number; active: boolean };
  pause: boolean;
  map: boolean;
}

export class Input {
  readonly state: Controls = {
    rudder: 0,
    sailDelta: 0,
    firePort: false,
    fireStarboard: false,
    fireAuto: false,
    fireAim: false,
    zoom: 0,
    steerHeading: null,
    steerThrottle: 0,
    pointer: { x: 0, y: 0, active: false },
    pause: false,
    map: false,
  };
  private keys = new Set<string>();
  isTouch: boolean;
  /** Fired once if a touch arrives on a device that didn't report touch up front. */
  onTouchDetected: () => void = () => {};
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyEl: HTMLElement | null = null;
  private joyKnob: HTMLElement | null = null;
  private pinch: { id1: number; id2: number; d: number } | null = null;
  enabled = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'w' || k === 'arrowup') this.state.sailDelta += 1;
      if (k === 's' || k === 'arrowdown') this.state.sailDelta -= 1;
      if (k === 'q') this.state.firePort = true;
      if (k === 'e') this.state.fireStarboard = true;
      if (k === ' ') this.state.fireAuto = true;
      if (k === 'escape' || k === 'p') this.state.pause = true;
      if (k === 'm') this.state.map = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.state.pointer.active = false;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.state.zoom += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60);
      },
      { passive: false },
    );
    // only a real mouse aims: touch never leaves a stale pointer on the water
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.state.pointer.x = e.clientX;
      this.state.pointer.y = e.clientY;
      this.state.pointer.active = true;
    });
    // pointerType keeps mouse-click firing on touchscreen laptops, where isTouch is also true
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType !== 'mouse') return;
      this.state.pointer.x = e.clientX;
      this.state.pointer.y = e.clientY;
      this.state.pointer.active = true;
      if (e.button === 0) this.state.fireAim = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setupTouch();
  }

  private setupTouch() {
    const c = this.canvas;
    window.addEventListener(
      'touchstart',
      () => {
        if (this.isTouch) return;
        this.isTouch = true;
        this.onTouchDetected();
      },
      { passive: true, capture: true },
    );
    c.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (this.joyId === null && t.clientX < window.innerWidth * 0.55) {
            this.joyId = t.identifier;
            this.joyOrigin = { x: t.clientX, y: t.clientY };
            this.showJoy(t.clientX, t.clientY);
          }
        }
        if (e.touches.length === 2 && this.joyId === null) {
          const [a, b] = [e.touches[0], e.touches[1]];
          this.pinch = { id1: a.identifier, id2: b.identifier, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
        }
      },
      { passive: false },
    );
    c.addEventListener(
      'touchmove',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.joyId) {
            const dx = t.clientX - this.joyOrigin.x;
            const dy = t.clientY - this.joyOrigin.y;
            const len = Math.hypot(dx, dy);
            const max = 60;
            const k = Math.min(1, len / max);
            if (len > 8) {
              // screen up = world -z (north), screen right = world +x... camera looks north
              this.state.steerHeading = Math.atan2(dx, dy);
              this.state.steerThrottle = k;
            }
            if (this.joyKnob) {
              const cl = Math.min(len, max) / Math.max(len, 1e-3);
              this.joyKnob.style.transform = `translate(${dx * cl}px, ${dy * cl}px)`;
            }
          }
        }
        if (this.pinch && e.touches.length === 2) {
          const a = Array.from(e.touches).find((t) => t.identifier === this.pinch!.id1);
          const b = Array.from(e.touches).find((t) => t.identifier === this.pinch!.id2);
          if (a && b) {
            const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            this.state.zoom += (this.pinch.d - d) / 40;
            this.pinch.d = d;
          }
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.state.steerHeading = null;
          this.hideJoy();
        }
      }
      if (e.touches.length < 2) this.pinch = null;
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  bindJoystick(el: HTMLElement, knob: HTMLElement) {
    this.joyEl = el;
    this.joyKnob = knob;
  }

  /** Touch broadside buttons. pointerdown fires on contact, with no click delay or ghost taps. */
  bindFireButtons(port: HTMLElement, main: HTMLElement, star: HTMLElement) {
    const bind = (el: HTMLElement, key: 'firePort' | 'fireStarboard' | 'fireAuto') => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        this.state[key] = true;
        navigator.vibrate?.(12);
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bind(port, 'firePort');
    bind(main, 'fireAuto');
    bind(star, 'fireStarboard');
  }

  private showJoy(x: number, y: number) {
    if (!this.joyEl) return;
    this.joyEl.style.left = `${x}px`;
    this.joyEl.style.top = `${y}px`;
    this.joyEl.classList.add('on');
  }

  private hideJoy() {
    this.joyEl?.classList.remove('on');
    if (this.joyKnob) this.joyKnob.style.transform = '';
  }

  /** Call once per frame after reading pulses. */
  poll() {
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    this.state.rudder = (left ? 1 : 0) - (right ? 1 : 0);
  }

  consume() {
    this.state.sailDelta = 0;
    this.state.firePort = false;
    this.state.fireStarboard = false;
    this.state.fireAuto = false;
    this.state.fireAim = false;
    this.state.zoom = 0;
    this.state.pause = false;
    this.state.map = false;
  }
}
