// Keyboard, mouse and touch, normalised into a small control state.

export interface Controls {
  rudder: number; // -1 starboard .. +1 port
  sailDelta: number; // pulses: +1 more sail, -1 less
  firePort: boolean;
  fireStarboard: boolean;
  fireAuto: boolean;
  fireAim: boolean; // mouse click: the side the pointer is in
  ammoPick: number; // pulse: 0..4 load that kind of shot (keys 1-5), -1 none
  ammoNext: boolean; // pulse: the next kind of shot (R)
  zoom: number; // accumulated wheel / pinch delta
  steerHeading: number | null; // touch helm: the world heading to put the bow on
  sailSet: number; // pulse: touch sail lever set to 0 (stop) .. 3 (full), -1 none
  pointer: { x: number; y: number; active: boolean };
  pause: boolean;
  map: boolean;
  treasure: boolean; // pulse: the treasure map (T)
  photo: boolean; // pulse: photo mode (P)
  fleet: boolean; // pulse: the next fleet order (G)
  // captain's view
  walkX: number; // -1 left .. +1 right
  walkY: number; // -1 back .. +1 forward
  run: boolean;
  lookX: number; // accumulated radians: + turns right
  lookY: number; // + looks down
  view: boolean; // pulse: toggle the captain's view
  helm: boolean; // pulse: take or leave the wheel
  spy: boolean; // spyglass raised
}

export class Input {
  readonly state: Controls = {
    rudder: 0,
    sailDelta: 0,
    firePort: false,
    fireStarboard: false,
    fireAuto: false,
    fireAim: false,
    ammoPick: -1,
    ammoNext: false,
    zoom: 0,
    steerHeading: null,
    sailSet: -1,
    pointer: { x: 0, y: 0, active: false },
    pause: false,
    map: false,
    treasure: false,
    photo: false,
    fleet: false,
    walkX: 0,
    walkY: 0,
    run: false,
    lookX: 0,
    lookY: 0,
    view: false,
    helm: false,
    spy: false,
  };
  /** Captain's view: WASD and the stick walk the deck, mouse and right-hand drags look. */
  fpv = false;
  /** In the captain's view with hands on the wheel: WASD and the stick sail the ship again. */
  helmMode = false;
  /**
   * Ashore: WASD, the arrows and the stick walk the captain (relative to the
   * screen), Space or a click swings the cutlass, Q / E fire the pistol, F acts.
   */
  foot = false;
  private locked = false;
  private rmb = false;
  private spyToggle = false;
  private joyVec = { x: 0, y: 0, on: false };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
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
      const walking = this.fpv && !this.helmMode;
      if (!this.foot) {
        if ((k === 'w' && !walking) || k === 'arrowup') this.state.sailDelta += 1;
        if ((k === 's' && !walking) || k === 'arrowdown') this.state.sailDelta -= 1;
      }
      if (k === 'v') this.state.view = true;
      if (k === 'f') this.state.helm = true;
      if (k === 'q') this.state.firePort = true;
      if (k === 'e') this.state.fireStarboard = true;
      if (k === ' ') this.state.fireAuto = true;
      if (k >= '1' && k <= '5') this.state.ammoPick = +k - 1;
      if (k === 'r') this.state.ammoNext = true;
      if (k === 'escape') this.state.pause = true;
      if (k === 'p') this.state.photo = true;
      if (k === 'm') this.state.map = true;
      if (k === 't') this.state.treasure = true;
      if (k === 'g') this.state.fleet = true;
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
    canvas.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.state.lookX += e.movementX * 0.0022;
        this.state.lookY += e.movementY * 0.0022;
      }
    });
    // only a real mouse aims: touch never leaves a stale pointer on the water
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.locked) return;
      this.state.pointer.x = e.clientX;
      this.state.pointer.y = e.clientY;
      this.state.pointer.active = true;
    });
    // pointerType keeps mouse-click firing on touchscreen laptops, where isTouch is also true
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType !== 'mouse') return;
      if (this.fpv && !this.locked) {
        // the first click in the captain's view grabs the mouse for looking around
        void Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
        return;
      }
      this.state.pointer.x = e.clientX;
      this.state.pointer.y = e.clientY;
      this.state.pointer.active = true;
      // from the deck a click fires the beam you face; above, the side you point into
      if (e.button === 0) {
        if (this.fpv) this.state.fireAuto = true;
        else this.state.fireAim = true;
      }
      if (e.button === 2) this.rmb = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.rmb = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.rmb = false;
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
          } else if (this.fpv && this.lookId === null && t.identifier !== this.joyId) {
            this.lookId = t.identifier;
            this.lookLast = { x: t.clientX, y: t.clientY };
          }
        }
        if (e.touches.length === 2 && this.joyId === null && !this.fpv) {
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
            if (this.fpv || this.foot) {
              // walk (or, at the wheel, steer and trim) relative to where you look
              const live = len > 8 ? k / Math.max(len, 1e-3) : 0;
              this.joyVec = { x: dx * live, y: -dy * live, on: true };
            } else if (len > 8) {
              // the helm only steers: point where the bow should go, the sail lever sets the speed.
              // screen up = world -z (north), screen right = world +x... camera looks north
              this.state.steerHeading = Math.atan2(dx, dy);
              this.joyEl?.style.setProperty('--want', `${Math.PI - this.state.steerHeading}rad`);
              this.joyEl?.classList.add('steer');
            }
            if (this.joyKnob) {
              // at sea the knob rides the rim like a compass needle; afoot it's a plain stick
              const sea = !this.fpv && !this.foot;
              const cl = sea ? (len > 8 ? Math.min(1, Math.max(0.55, k)) * max / len : 0) : Math.min(len, max) / Math.max(len, 1e-3);
              this.joyKnob.style.transform = `translate(${dx * cl}px, ${dy * cl}px)`;
            }
          }
        }
        if (this.lookId !== null) {
          const t = Array.from(e.changedTouches).find((tt) => tt.identifier === this.lookId);
          if (t) {
            const sens = 0.0062 * (430 / Math.max(320, Math.min(window.innerWidth, window.innerHeight)));
            this.state.lookX += (t.clientX - this.lookLast.x) * sens;
            this.state.lookY += (t.clientY - this.lookLast.y) * sens;
            this.lookLast = { x: t.clientX, y: t.clientY };
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
          this.joyVec = { x: 0, y: 0, on: false };
          this.hideJoy();
        }
        if (t.identifier === this.lookId) this.lookId = null;
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

  /**
   * The touch sail lever: four notches from Stop to Full that stay where you
   * leave them, like W / S. Drag the knob or tap a notch; it clicks into each
   * detent as you pass it, and the game owns the real setting (data-lvl).
   */
  bindSailLever(el: HTMLElement, track: HTMLElement) {
    let id: number | null = null;
    let lvl = 0;
    const at = (y: number) => {
      const r = track.getBoundingClientRect();
      // the knob's travel is the track less a knob's height
      const pad = Math.min(r.width, r.height) * 0.5;
      return Math.min(1, Math.max(0, (r.bottom - pad - y) / Math.max(1, r.height - pad * 2)));
    };
    const move = (y: number) => {
      const f = at(y);
      const n = Math.round(f * 3);
      // magnetic notches: the knob leans toward the nearest detent rather than floating free
      el.style.setProperty('--drag', `${n / 3 + (f - n / 3) * 0.4}`);
      if (n === lvl) return;
      lvl = n;
      this.state.sailSet = n;
      navigator.vibrate?.(n === 0 ? [16, 50, 16] : 9);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('drag');
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled || id !== null) return;
      id = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
      lvl = +(el.dataset.lvl ?? 0);
      el.classList.add('drag');
      move(e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) move(e.clientY);
    });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
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

  /** Captain's view controls: the view toggle, the wheel, and (on touch) the spyglass. */
  bindViewButtons(view: HTMLElement, helm: HTMLElement, spy: HTMLElement) {
    const tap = (el: HTMLElement, fn: () => void) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.enabled) return;
        fn();
        navigator.vibrate?.(8);
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    tap(view, () => (this.state.view = true));
    tap(helm, () => (this.state.helm = true));
    tap(spy, () => (this.spyToggle = !this.spyToggle));
  }

  /** Ashore on touch: the cutlass (a tap swings, the next tap chains the combo) and the pistol. */
  bindShoreButtons(strike: HTMLElement, pistol: HTMLElement) {
    const bind = (el: HTMLElement, key: 'fireAuto' | 'firePort') => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.enabled) return;
        this.state[key] = true;
        navigator.vibrate?.(10);
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bind(strike, 'fireAuto');
    bind(pistol, 'firePort');
  }

  /** Lets go of the mouse and lowers the glass when leaving the captain's view or pausing. */
  releaseLook() {
    if (this.locked) document.exitPointerLock?.();
    this.rmb = false;
    this.spyToggle = false;
  }

  get mouseLocked() {
    return this.locked;
  }

  /** Each frame the touch helm steers: the ring shows where the bow points now and the turn still to come. */
  helmShow(heading: number, want: number) {
    const el = this.joyEl;
    if (!el) return;
    // screen angles run clockwise from up; world heading 0 points down the screen
    const hd = Math.PI - heading;
    let turn = (heading - want) % (Math.PI * 2);
    if (turn > Math.PI) turn -= Math.PI * 2;
    else if (turn < -Math.PI) turn += Math.PI * 2;
    el.style.setProperty('--hd', `${hd.toFixed(3)}rad`);
    el.style.setProperty('--a0', `${(turn >= 0 ? hd : hd + turn).toFixed(3)}rad`);
    el.style.setProperty('--span', `${Math.abs(turn).toFixed(3)}rad`);
  }

  private showJoy(x: number, y: number) {
    if (!this.joyEl) return;
    this.joyEl.style.left = `${x}px`;
    this.joyEl.style.top = `${y}px`;
    this.joyEl.classList.add('on');
  }

  private hideJoy() {
    this.joyEl?.classList.remove('on', 'steer');
    if (this.joyKnob) this.joyKnob.style.transform = '';
  }

  /** Call once per frame after reading pulses. */
  poll() {
    const k = this.keys;
    const st = this.state;
    const j = this.joyVec;
    if (this.foot) {
      // ashore every key walks: up the screen is up the screen
      st.rudder = 0;
      st.walkX = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      st.walkY = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      st.run = k.has('shift');
      if (j.on) {
        st.walkX = j.x;
        st.walkY = j.y;
        st.run = st.run || Math.hypot(j.x, j.y) > 0.94;
      }
      st.spy = false;
      return;
    }
    const walking = this.fpv && !this.helmMode;
    const left = (k.has('a') && !walking) || k.has('arrowleft');
    const right = (k.has('d') && !walking) || k.has('arrowright');
    st.rudder = (left ? 1 : 0) - (right ? 1 : 0);
    st.walkX = walking ? (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) : 0;
    st.walkY = walking ? (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0) : 0;
    st.run = k.has('shift');
    if (this.fpv && j.on) {
      if (walking) {
        st.walkX = j.x;
        st.walkY = j.y;
        st.run = st.run || Math.hypot(j.x, j.y) > 0.94;
      } else {
        // at the wheel the stick is the tiller, the sail lever trims
        st.rudder = Math.abs(j.x) > 0.15 ? -j.x : 0;
      }
    }
    st.spy = this.fpv && (k.has('z') || this.rmb || this.spyToggle);
  }

  consume() {
    this.state.sailDelta = 0;
    this.state.sailSet = -1;
    this.state.firePort = false;
    this.state.fireStarboard = false;
    this.state.fireAuto = false;
    this.state.fireAim = false;
    this.state.ammoPick = -1;
    this.state.ammoNext = false;
    this.state.zoom = 0;
    this.state.pause = false;
    this.state.map = false;
    this.state.treasure = false;
    this.state.photo = false;
    this.state.fleet = false;
    this.state.view = false;
    this.state.helm = false;
    this.state.lookX = 0;
    this.state.lookY = 0;
  }
}
