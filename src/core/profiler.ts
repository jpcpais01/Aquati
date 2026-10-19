import * as THREE from 'three';

// Frame profiler behind the FPS counter. Tap the counter (or press F3) to open
// it: CPU milliseconds per game system, GPU milliseconds per render pass
// (EXT_disjoint_timer_query_webgl2 where the browser offers it), draw calls,
// triangles, programs, a frame-time graph, resolution and quality.
//
// Sections nest and time is exclusive: a child's time is taken out of its
// parent, so every millisecond is counted once. WebGL only allows one timer
// query at a time, so the GPU side ends the parent's query when a child starts
// and opens a fresh one for the parent when the child ends.
//
// Closed, every call returns on its first line: the counter costs one
// performance.now() a frame and a text update twice a second.

export type Group = 'sim' | 'ships' | 'fx' | 'ocean' | 'ui' | 'render';

const GROUPS: { id: Group; name: string; color: string }[] = [
  { id: 'sim', name: 'World', color: '#7cc4ff' },
  { id: 'ships', name: 'Ships', color: '#ffb35c' },
  { id: 'fx', name: 'Effects', color: '#5fe0c0' },
  { id: 'ocean', name: 'Ocean', color: '#5d8bff' },
  { id: 'ui', name: 'Interface', color: '#ff7ab6' },
  { id: 'render', name: 'Render', color: '#c39bff' },
];
const GROUP_IX: Record<Group, number> = { sim: 0, ships: 1, fx: 2, ocean: 3, ui: 4, render: 5 };

interface Stat {
  name: string;
  group: Group;
  cpu: number; // this frame, ms
  gpu: number; // the frame being resolved, ms
  cpuAvg: number;
  gpuAvg: number;
  cpuPeak: number;
  gpuSeen: boolean;
}

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface PendingFrame {
  slot: number;
  id: number;
  queries: { q: WebGLQuery; stat: Stat }[];
}

const HIST = 150;
const EMA = 0.08;

export interface ProfilerInfo {
  scale: number;
  width: number;
  height: number;
  preset: string;
  tier: number;
  msaa: number;
  shadow: number;
}

export class Profiler {
  /** True while the panel is open and sections are being measured. */
  on = false;
  fps = 60;

  private stats = new Map<string, Stat>();
  private list: Stat[] = [];
  private cpuStack: Stat[] = [];
  private cpuT = 0;
  private gpuStack: Stat[] = [];
  private gpuQ: WebGLQuery | null = null;
  private frameQueries: { q: WebGLQuery; stat: Stat }[] = [];
  private pending: PendingFrame[] = [];
  private pool: WebGLQuery[] = [];
  private gl: WebGL2RenderingContext;
  private ext: TimerExt | null | undefined;
  private frameId = 0;
  private frameStart = 0;
  private self: Stat;

  // history, one slot per frame
  private slot = 0;
  private histFrame = new Float32Array(HIST);
  private histCpu = new Float32Array(HIST * 6);
  private histGpu = new Float32Array(HIST).fill(NaN);
  private histId = new Int32Array(HIST).fill(-1);

  private fpsFrames = 0;
  private fpsT = performance.now();
  private frameAvg = 16.7;
  private gpuTotalAvg = 0;
  private cpuTotalAvg = 0;
  private refreshT = 0;
  private graphT = 0;
  private showAll = false;

  private el: HTMLDivElement;
  private panel: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private nodes!: Record<'fps' | 'ms' | 'verdict' | 'cpuTotal' | 'cpuBar' | 'cpuRows' | 'gpuTotal' | 'gpuBar' | 'gpuRows' | 'facts', HTMLElement>;
  private gpuName = '';
  private gpuWait = 0;

  constructor(private renderer: THREE.WebGLRenderer, private info: () => ProfilerInfo) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.self = this.stat('Profiler', 'ui');
    this.el = Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fps', title: 'Tap for the frame profiler (F3)' });
    this.el.setAttribute('role', 'button');
    this.panel = Object.assign(document.body.appendChild(document.createElement('div')), { id: 'prof' });
    this.panel.hidden = true;
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });

    // shadow maps are drawn inside the world pass: time them as their own pass
    const sm = renderer.shadowMap;
    const draw = sm.render;
    sm.render = (lights, scene, camera) => {
      if (!this.on || lights.length === 0) return draw.call(sm, lights, scene, camera);
      this.begin('Shadow maps', 'render', true);
      draw.call(sm, lights, scene, camera);
      this.end(true);
    };
  }

  /** A stat for a section; created once, then found by name. */
  private stat(name: string, group: Group): Stat {
    let s = this.stats.get(name);
    if (!s) {
      s = { name, group, cpu: 0, gpu: 0, cpuAvg: 0, gpuAvg: 0, cpuPeak: 0, gpuSeen: false };
      this.stats.set(name, s);
      this.list.push(s);
    }
    return s;
  }

  toggle(open = !this.on) {
    if (open && document.body.classList.contains('no-fps')) open = false;
    if (open === this.on) return;
    this.on = open;
    this.panel.hidden = !open;
    this.el.classList.toggle('open', open);
    // count every draw of the frame, not just the last render() call
    this.renderer.info.autoReset = !open;
    if (open) {
      if (!this.nodes) this.build();
      if (this.ext === undefined) {
        this.ext = (this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null) ?? null;
      }
      this.histGpu.fill(NaN);
      this.histId.fill(-1);
      this.refreshT = 0;
      this.frameStart = 0;
    } else {
      this.dropPending();
    }
  }

  // ------------------------------------------------------------------ frame

  /** Start of a frame: updates the counter, and when open, starts measuring. */
  tick(now: number) {
    this.fpsFrames++;
    if (now - this.fpsT >= 500) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsT);
      this.el.textContent = `${Math.round(this.fps)} FPS`;
      this.fpsFrames = 0;
      this.fpsT = now;
    }
    if (!this.on) return;
    const frameMs = this.frameStart ? now - this.frameStart : 16.7;
    this.frameStart = now;
    this.frameAvg += (Math.min(frameMs, 250) - this.frameAvg) * EMA;
    this.frameId++;
    this.slot = (this.slot + 1) % HIST;
    this.histFrame[this.slot] = frameMs;
    this.histGpu[this.slot] = NaN;
    this.histId[this.slot] = this.frameId;
    this.renderer.info.reset();
    this.collectGpu();
    this.cpuT = now;
  }

  /** Opens a section. With gpu, its GL work is timed on the GPU too. */
  begin(name: string, group: Group, gpu = false) {
    if (!this.on) return;
    const t = performance.now();
    const st = this.stat(name, group);
    const parent = this.cpuStack[this.cpuStack.length - 1];
    if (parent) parent.cpu += t - this.cpuT;
    this.cpuStack.push(st);
    this.cpuT = t;
    if (gpu && this.ext) {
      this.gpuEnd();
      this.gpuStack.push(st);
      this.gpuBegin(st);
    }
  }

  end(gpu = false) {
    if (!this.on) return;
    const t = performance.now();
    const st = this.cpuStack.pop();
    if (st) st.cpu += t - this.cpuT;
    this.cpuT = t;
    if (gpu && this.ext) {
      this.gpuEnd();
      this.gpuStack.pop();
      const parent = this.gpuStack[this.gpuStack.length - 1];
      if (parent) this.gpuBegin(parent);
    }
  }

  /** End of a frame: folds this frame's numbers into the averages and redraws. */
  frameEnd() {
    if (!this.on) return;
    const t0 = performance.now();
    while (this.cpuStack.length) this.end();
    while (this.gpuStack.length) this.end(true);
    if (this.ext && this.frameQueries.length) {
      this.pending.push({ slot: this.slot, id: this.frameId, queries: this.frameQueries });
      // some drivers expose the timers but never answer: stop asking after a few seconds
      if (!this.gpuTotalAvg && ++this.gpuWait > 240) {
        this.dropPending();
        this.ext = null;
      }
      this.frameQueries = [];
      // a stalled GPU must not pile up queries forever
      while (this.pending.length > 8) this.release(this.pending.shift()!);
    }
    let total = 0;
    const base = this.slot * 6;
    for (let g = 0; g < 6; g++) this.histCpu[base + g] = 0;
    for (const s of this.list) {
      total += s.cpu;
      this.histCpu[base + GROUP_IX[s.group]] += s.cpu;
      s.cpuAvg += (s.cpu - s.cpuAvg) * EMA;
      s.cpuPeak = Math.max(s.cpuPeak * 0.995, s.cpu);
      s.cpu = 0;
    }
    this.cpuTotalAvg += (total - this.cpuTotalAvg) * EMA;

    // the graph keeps up at ~30 Hz whatever the display's refresh rate
    if (t0 - this.graphT > 30) {
      this.graphT = t0;
      this.drawGraph();
    }
    if (t0 - this.refreshT > 250) {
      this.refreshT = t0;
      if (document.body.classList.contains('no-fps')) this.toggle(false);
      else this.refresh();
    }
    // the profiler's own drawing shows up in its own row (next frame)
    this.self.cpu += performance.now() - t0;
  }

  // ------------------------------------------------------------------ GPU timers

  private gpuBegin(st: Stat) {
    const gl = this.gl;
    const q = this.pool.pop() ?? gl.createQuery();
    if (!q) return;
    gl.beginQuery(this.ext!.TIME_ELAPSED_EXT, q);
    this.gpuQ = q;
    this.frameQueries.push({ q, stat: st });
  }

  private gpuEnd() {
    if (!this.gpuQ) return;
    this.gl.endQuery(this.ext!.TIME_ELAPSED_EXT);
    this.gpuQ = null;
  }

  private release(f: PendingFrame) {
    for (const { q } of f.queries) this.pool.push(q);
  }

  private dropPending() {
    this.gpuEnd();
    this.gpuStack.length = 0;
    this.cpuStack.length = 0;
    for (const f of this.pending) this.release(f);
    this.pending.length = 0;
    for (const { q } of this.frameQueries) this.pool.push(q);
    this.frameQueries = [];
  }

  /** Reads back every finished frame's queries (they land a few frames late). */
  private collectGpu() {
    if (!this.ext || !this.pending.length) return;
    const gl = this.gl;
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      // the GPU clock jumped (power state, context switch): those numbers are junk
      for (const f of this.pending) this.release(f);
      this.pending.length = 0;
      return;
    }
    while (this.pending.length) {
      const f = this.pending[0];
      const last = f.queries[f.queries.length - 1].q;
      if (!gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      let total = 0;
      for (const { q, stat } of f.queries) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        stat.gpu += ms;
        stat.gpuSeen = true;
        total += ms;
      }
      for (const s of this.list) {
        if (!s.gpuSeen) continue;
        s.gpuAvg += (s.gpu - s.gpuAvg) * EMA;
        s.gpu = 0;
      }
      this.gpuTotalAvg += (total - this.gpuTotalAvg) * EMA;
      if (this.histId[f.slot] === f.id) this.histGpu[f.slot] = total;
      this.release(f);
    }
  }

  // ------------------------------------------------------------------ panel

  private build() {
    const p = this.panel;
    p.innerHTML = `
      <div class="pf-head">
        <div class="pf-fps"><b data-n="fps">--</b><span>FPS</span></div>
        <div class="pf-ms" data-n="ms"></div>
        <div class="pf-verdict" data-n="verdict"></div>
        <button class="pf-close" aria-label="Close profiler">×</button>
      </div>
      <canvas class="pf-graph" width="300" height="64"></canvas>
      <div class="pf-legend">${GROUPS.map((g) => `<span><i style="background:${g.color}"></i>${g.name}</span>`).join('')}<span><i class="pf-gpu-key"></i>GPU</span></div>
      <section>
        <h4><span>CPU</span><b data-n="cpuTotal"></b></h4>
        <div class="pf-stack" data-n="cpuBar"></div>
        <div class="pf-rows" data-n="cpuRows"></div>
      </section>
      <section>
        <h4><span>GPU</span><b data-n="gpuTotal"></b></h4>
        <div class="pf-stack" data-n="gpuBar"></div>
        <div class="pf-rows" data-n="gpuRows"></div>
      </section>
      <div class="pf-facts" data-n="facts"></div>
      <button class="pf-more">Show every system</button>`;
    const nodes = {} as Record<string, HTMLElement>;
    p.querySelectorAll<HTMLElement>('[data-n]').forEach((n) => (nodes[n.dataset.n!] = n));
    this.nodes = nodes as typeof this.nodes;
    this.canvas = p.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    p.querySelector('.pf-close')!.addEventListener('click', () => this.toggle(false));
    const more = p.querySelector<HTMLButtonElement>('.pf-more')!;
    more.addEventListener('click', () => {
      this.showAll = !this.showAll;
      more.textContent = this.showAll ? 'Show the busiest only' : 'Show every system';
      this.refresh();
    });
    // taps and drags on the panel stay off the sea
    for (const ev of ['pointerdown', 'touchstart', 'wheel'] as const) p.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

    const gl = this.gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    // "ANGLE (Vendor, Device (0x1234) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "Device"
    const angle = /^ANGLE \((.*)\)$/.exec(name);
    const dev = angle ? (angle[1].split(', ')[1] ?? angle[1]) : name;
    this.gpuName = dev
      .replace(/^ANGLE \w+ Renderer: /, '')
      .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
      .replace(/\s+(Direct3D|OpenGL|Vulkan|vs_|ps_).*$/i, '')
      .trim();
  }

  /**
   * Rows are built once and then only their text and bar widths change, so a
   * refresh never re-parses HTML or rebuilds the panel's layout from scratch.
   */
  private rows(el: HTMLElement, key: 'cpuAvg' | 'gpuAvg', total: number) {
    const sorted = this.list.filter((s) => (key === 'gpuAvg' ? s.gpuSeen : true) && s[key] > 0.005).sort((a, b) => b[key] - a[key]);
    const shown = this.showAll ? sorted : sorted.slice(0, 7);
    const top = sorted[0]?.[key] || 1;
    const rest = sorted.length - shown.length;
    const want = shown.length + (rest > 0 ? 1 : 0);
    const kids = el.children;
    if (el.firstElementChild?.classList.contains('pf-none')) el.textContent = '';
    while (kids.length < want) {
      const row = el.appendChild(document.createElement('div'));
      row.className = 'pf-row';
      row.innerHTML = '<i></i><span class="pf-name"></span><em title="Recent spike"></em><span class="pf-bar"><u></u></span><span class="pf-pct"></span><b></b>';
    }
    while (kids.length > want) el.lastElementChild!.remove();
    for (let i = 0; i < shown.length; i++) {
      const s = shown[i];
      const v = s[key];
      const row = kids[i] as HTMLElement;
      row.classList.remove('pf-rest');
      const [dot, name, peak, bar, pct, val] = row.children as unknown as HTMLElement[];
      const color = GROUPS[GROUP_IX[s.group]].color;
      set(dot, 'background', color);
      setText(name, s.name);
      setText(peak, key === 'cpuAvg' && s.cpuPeak > v * 2.5 && s.cpuPeak > 0.5 ? `▲${s.cpuPeak.toFixed(1)}` : '');
      const u = bar.firstElementChild as HTMLElement;
      set(u, 'width', `${((v / top) * 100).toFixed(1)}%`);
      set(u, 'background', color);
      setText(pct, `${total > 0 ? Math.round((v / total) * 100) : 0}%`);
      setText(val, fmt(v));
    }
    if (rest > 0) {
      const row = kids[shown.length] as HTMLElement;
      row.classList.add('pf-rest');
      const [dot, name, peak, bar, pct, val] = row.children as unknown as HTMLElement[];
      set(dot, 'background', 'transparent');
      setText(name, `+${rest} more · ${fmt(sorted.slice(shown.length).reduce((a, s) => a + s[key], 0))}`);
      setText(peak, '');
      set(bar.firstElementChild as HTMLElement, 'width', '0%');
      setText(pct, '');
      setText(val, '');
    }
  }

  private stackBar(el: HTMLElement, key: 'cpuAvg' | 'gpuAvg', total: number) {
    const sums = [0, 0, 0, 0, 0, 0];
    for (const s of this.list) if (key === 'cpuAvg' || s.gpuSeen) sums[GROUP_IX[s.group]] += s[key];
    // scaled against the frame budget, so a full bar means "this alone sets the frame rate"
    const budget = Math.max(this.frameAvg, total, 1);
    if (el.children.length !== 6) {
      el.textContent = '';
      for (const g of GROUPS) {
        const u = el.appendChild(document.createElement('u'));
        u.style.background = g.color;
      }
    }
    for (let g = 0; g < 6; g++) {
      const u = el.children[g] as HTMLElement;
      const v = sums[g];
      set(u, 'width', v > 0.01 ? `${((v / budget) * 100).toFixed(2)}%` : '0%');
      if (u.title !== `${GROUPS[g].name} ${fmt(v)}`) u.title = `${GROUPS[g].name} ${fmt(v)}`;
    }
  }

  private refresh() {
    const n = this.nodes;
    const fa = this.frameAvg;
    n.fps.textContent = String(Math.round(this.fps));
    // 1% low from the history
    const sorted = Array.from(this.histFrame).filter((v) => v > 0).sort((a, b) => b - a);
    const worst = sorted[Math.floor(sorted.length * 0.01)] ?? fa;
    n.ms.innerHTML = `<b>${fa.toFixed(1)}</b> ms avg<br><b>${worst.toFixed(1)}</b> ms worst 1%`;

    const cpu = this.cpuTotalAvg;
    const gpu = this.gpuTotalAvg;
    const hasGpu = !!this.ext && this.list.some((s) => s.gpuSeen);
    let verdict: string;
    let cls: string;
    const tight = fa > 17.5; // missing a 60 Hz vsync
    if (!tight) {
      verdict = `Smooth · ${Math.max(0, 16.7 - Math.max(cpu, gpu)).toFixed(1)} ms spare`;
      cls = 'ok';
    } else if (hasGpu && gpu > cpu * 1.15 && gpu > fa * 0.6) {
      verdict = 'GPU-bound';
      cls = 'gpu';
    } else if (cpu > fa * 0.6) {
      verdict = 'CPU-bound';
      cls = 'cpu';
    } else {
      verdict = hasGpu ? 'Browser / sync-bound' : 'Likely GPU-bound';
      cls = 'gpu';
    }
    n.verdict.textContent = verdict;
    n.verdict.className = `pf-verdict ${cls}`;

    n.cpuTotal.innerHTML = `${fmt(cpu)} <small>of ${fa.toFixed(1)} ms frame</small>`;
    this.stackBar(n.cpuBar, 'cpuAvg', cpu);
    this.rows(n.cpuRows, 'cpuAvg', cpu);
    if (hasGpu) {
      n.gpuTotal.innerHTML = `${fmt(gpu)} <small>timed passes</small>`;
      this.stackBar(n.gpuBar, 'gpuAvg', gpu);
      this.rows(n.gpuRows, 'gpuAvg', gpu);
    } else {
      n.gpuTotal.innerHTML = '';
      n.gpuBar.innerHTML = '';
      n.gpuRows.innerHTML = `<div class="pf-none">${this.ext ? 'Waiting for the first GPU timings…' : 'GPU timers aren’t available on this browser or device, so render passes can’t be timed here. When CPU time sits well under the frame time, the GPU is the bottleneck.'}</div>`;
    }

    const r = this.renderer.info;
    const inf = this.info();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const facts: [string, string][] = [
      ['Draw calls', r.render.calls.toLocaleString()],
      ['Triangles', compact(r.render.triangles)],
      ['Points · lines', `${compact(r.render.points)} · ${compact(r.render.lines)}`],
      ['Shader programs', String(r.programs?.length ?? 0)],
      ['Textures · meshes', `${r.memory.textures} · ${r.memory.geometries}`],
      ['Resolution', `${inf.width}×${inf.height} · ${Math.round(inf.scale * 100)}%`],
      ['Quality', `${cap(inf.preset)} · tier ${inf.tier}`],
      ['MSAA · shadows', `${inf.msaa ? `${inf.msaa}×` : 'off'} · ${inf.shadow}px`],
    ];
    if (mem) facts.push(['JS heap', `${Math.round(mem.usedJSHeapSize / 1048576)} MB`]);
    if (this.gpuName) facts.push(['GPU', this.gpuName]);
    n.facts.innerHTML = facts.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  private drawGraph() {
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const maxMs = Math.max(40, Math.min(120, this.frameAvg * 1.6));
    const y = (ms: number) => h - (Math.min(ms, maxMs) / maxMs) * h;
    const bw = w / HIST;
    for (let i = 0; i < HIST; i++) {
      const s = (this.slot + 1 + i) % HIST;
      if (this.histId[s] < 0) continue;
      const x = i * bw;
      // frame time as a faint column, CPU stacked by group inside it
      const f = this.histFrame[s];
      g.fillStyle = f > 34 ? 'rgba(255,90,90,0.35)' : f > 17.5 ? 'rgba(255,200,90,0.22)' : 'rgba(255,255,255,0.1)';
      g.fillRect(x, y(f), bw - 0.4, h - y(f));
      let acc = 0;
      for (let k = 0; k < 6; k++) {
        const v = this.histCpu[s * 6 + k];
        if (v <= 0) continue;
        g.fillStyle = GROUPS[k].color;
        g.fillRect(x, y(acc + v), bw - 0.4, y(acc) - y(acc + v));
        acc += v;
      }
    }
    // GPU time as a line over the top
    g.strokeStyle = '#fff';
    g.lineWidth = 1.25;
    g.beginPath();
    let pen = false;
    for (let i = 0; i < HIST; i++) {
      const v = this.histGpu[(this.slot + 1 + i) % HIST];
      if (Number.isNaN(v)) {
        pen = false;
        continue;
      }
      const px = i * bw + bw * 0.5;
      if (pen) g.lineTo(px, y(v));
      else g.moveTo(px, y(v));
      pen = true;
    }
    g.stroke();
    // 60 and 30 fps lines
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '9px ui-monospace, monospace';
    for (const [ms, label] of [
      [16.7, '60'],
      [33.3, '30'],
    ] as const) {
      g.fillRect(0, Math.round(y(ms)), w, 1);
      g.fillText(label, 2, y(ms) - 2);
    }
  }
}

/** Writes a style property only when it changes (an unchanged write still costs a style pass). */
function set(el: HTMLElement, prop: 'width' | 'background', v: string) {
  if (el.dataset[prop] === v) return;
  el.dataset[prop] = v;
  el.style[prop] = v;
}

function setText(el: HTMLElement, v: string) {
  if (el.textContent !== v) el.textContent = v;
}

function fmt(ms: number) {
  return ms >= 10 ? `${ms.toFixed(1)} ms` : `${ms.toFixed(2)} ms`;
}

function compact(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString();
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
