// The sea chart: both archipelagos drawn as an old parchment chart, from the
// game's own island list (world/terrain.ts, seeds 20251019 and 777031).
(() => {
  const svg = document.getElementById('sea-chart');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';

  // name, kind, x, z, radius (world metres)
  const HOME = [
    ['Morro Huracão', 'volcanic', -30, -170, 125], ['Cayo Solenne', 'atoll', 190, 150, 78], ['Brisagüey', 'lush', -92, 661, 75],
    ['Esmeraldijk', 'lush', -8, -686, 91], ['Punta Belleau', 'rocky', -477, 163, 79], ['Perlabana', 'lush', -536, -340, 65],
    ['Cayo Vliemar', 'atoll', -382, 540, 77], ['Ilhéu Corazinha', 'rocky', -631, -46, 47], ['Isla Marézia', 'lush', 474, -327, 84],
    ['Roca Corvão', 'atoll', 754, -134, 54], ['Azulhoek', 'lush', 363, -33, 58], ['Ilha Nacaréu', 'rocky', 225, 704, 69],
  ];
  const BRUMAS = [
    ['Peña Nebulosa', 'karst', 6660, -2760, 130], ['Cayo Garoa', 'karst', 6954, -2477, 87], ['Isla Ceibana', 'karst', 7123, -2854, 73],
    ['Boca de Yaruma', 'lush', 5853, -2986, 53], ['Ilhéu Orvalho', 'karst', 6755, -3245, 70], ['Nevelhoek', 'atoll', 5975, -2456, 70],
    ['Mornebrume', 'karst', 6672, -2140, 60], ['Agulhas do Vento', 'lush', 6030, -3173, 58], ['Pináculo Azahar', 'karst', 7184, -3201, 69],
    ['Torre de Jade', 'karst', 6541, -2370, 57],
  ];
  const K = 0.33;
  const home = (x, z) => [330 + (x - 60) * K, 384 + (z - 10) * K];
  const brumas = (x, z) => [1082 + (x - 6520) * K, 236 + (z + 2700) * K];
  const KIND = {
    volcanic: { fill: '#b3a774', label: 'Volcanic isle' },
    lush: { fill: '#a9c178', label: 'Jungle isle' },
    rocky: { fill: '#c2b083', label: 'Rocky isle' },
    atoll: { fill: '#d6cb8c', label: 'Coral atoll' },
    karst: { fill: '#9db886', label: 'Karst towers' },
  };

  const el = (tag, attrs = {}, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  // a smooth, irregular coastline through n points
  const blob = (cx, cy, r, rand, scale = 1, n = 26) => {
    const p1 = rand() * 6.28, p2 = rand() * 6.28, p3 = rand() * 6.28, a1 = 0.1 + rand() * 0.14, a2 = 0.06 + rand() * 0.1, st = 0.8 + rand() * 0.4;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const k = r * scale * (1 + a1 * Math.sin(2 * t + p1) + a2 * Math.sin(3 * t + p2) + 0.05 * Math.sin(5 * t + p3));
      pts.push([cx + Math.cos(t) * k * st, cy + Math.sin(t) * k / st]);
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], a = pts[i], b = pts[(i + 1) % n], q = pts[(i + 2) % n];
      d += `C${(a[0] + (b[0] - p0[0]) / 6).toFixed(1)} ${(a[1] + (b[1] - p0[1]) / 6).toFixed(1)} ${(b[0] - (q[0] - a[0]) / 6).toFixed(1)} ${(b[1] - (q[1] - a[1]) / 6).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    }
    return d + 'Z';
  };

  // ----- defs -----
  const defs = el('defs');
  defs.innerHTML = `
    <filter id="ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>
    <radialGradient id="shoal"><stop offset="0" stop-color="#6fc9c2" stop-opacity=".55"/><stop offset="1" stop-color="#6fc9c2" stop-opacity="0"/></radialGradient>
    <radialGradient id="sea-home" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7ec8c4" stop-opacity=".28"/><stop offset="1" stop-color="#7ec8c4" stop-opacity="0"/></radialGradient>
    <radialGradient id="sea-mist" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9fb7b8" stop-opacity=".34"/><stop offset="1" stop-color="#9fb7b8" stop-opacity="0"/></radialGradient>
    <path id="voyage" d="M ${home(474, -327).map((v) => v.toFixed(0)).join(' ')} C 600 330 700 450 790 390 S 880 230 ${brumas(5853, -2986).map((v) => (v - 18).toFixed(0)).join(' ')}"/>`;

  // ----- sea washes -----
  el('ellipse', { cx: 330, cy: 384, rx: 300, ry: 270, fill: 'url(#sea-home)' });
  el('ellipse', { cx: 1082, cy: 236, rx: 290, ry: 230, fill: 'url(#sea-mist)' });

  // ----- rhumb lines from the compass rose -----
  const rose = [1306, 570];
  const rl = el('g', { class: 'rhumb' });
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    el('line', { x1: rose[0], y1: rose[1], x2: rose[0] + Math.cos(t) * 1500, y2: rose[1] + Math.sin(t) * 1500 }, rl);
  }

  // ----- the voyage between them -----
  const route = el('g', { class: 'voyage' });
  el('use', { href: '#voyage', class: 'voyage-line' }, route);
  const label = el('text', { class: 'voyage-label', dy: -10 }, route);
  const tp = el('textPath', { href: '#voyage', startOffset: '50%', 'text-anchor': 'middle' }, label);
  tp.textContent = 'the high seas · a long voyage';
  const ship = el('g', { class: 'voyage-ship' }, route);
  ship.innerHTML = '<g transform="translate(-14 -22) scale(.78)"><path d="M17 4v22M17 6c6 4 8 10 7 16H17M17 9c-5 3-7 8-7 13h7" fill="#fbf4e2" stroke="#4b3214" stroke-width="2.2" stroke-linejoin="round"/><path d="M4 26h28l-4 6H8Z" fill="#8a5a1c" stroke="#4b3214" stroke-width="2.2" stroke-linejoin="round"/></g>';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    const am = el('animateMotion', { dur: '16s', repeatCount: 'indefinite', rotate: '0', keyPoints: '0;1;1;0;0', keyTimes: '0;.45;.5;.95;1', calcMode: 'linear' }, ship);
    el('mpath', { href: '#voyage' }, am);
  } else ship.setAttribute('transform', `translate(${home(474, -327).join(' ')})`);

  // ----- a sea monster in the empty middle -----
  const beast = el('g', { class: 'beast', transform: 'translate(700 560)' });
  beast.innerHTML = `
    <path d="M-60 6 q12 -26 24 0 q12 26 24 0 q12 -30 26 -4 q10 18 22 -2" />
    <path d="M30 0 q10 -26 30 -18 q8 4 2 12" />
    <circle cx="52" cy="-14" r="1.8" class="eye"/>
    <path d="M-80 18 q20 -6 40 0 t40 0 t40 0 t40 0" class="swell"/>
    <text x="0" y="40" text-anchor="middle">here be Kraken</text>`;

  // ----- islands -----
  const tip = document.querySelector('.chart-tip');
  const tipB = tip?.querySelector('b');
  const tipS = tip?.querySelector('span');
  const wrap = svg.closest('.chart');
  const isles = el('g', { class: 'isles-g' });
  const draw = (list, map, region) => {
    for (const [name, kind, x, z, r0] of list) {
      const [cx, cy] = map(x, z);
      const r = Math.max(9, r0 * K * 0.86);
      const rand = rng(hash(name));
      const g = el('g', { class: `isle-g k-${kind}`, tabindex: 0, role: 'img', 'aria-label': `${name}, ${KIND[kind].label.toLowerCase()}, ${region}` }, isles);
      el('circle', { cx, cy, r: r * 1.9, fill: 'url(#shoal)' }, g);
      const s = rand();
      const coast = blob(cx, cy, r, rng(hash(name)), 1);
      el('path', { d: blob(cx, cy, r, rng(hash(name)), 1.34), class: 'ripple r2' }, g);
      el('path', { d: blob(cx, cy, r, rng(hash(name)), 1.17), class: 'ripple r1' }, g);
      el('path', { d: coast, class: 'land', fill: KIND[kind].fill, filter: 'url(#ink)' }, g);
      if (kind === 'atoll') el('path', { d: blob(cx, cy, r * 0.62, rng(hash(name) + 9), 1), class: 'lagoon' }, g);
      // glyphs
      const gl = el('g', { class: 'glyph' }, g);
      if (kind === 'volcanic' || kind === 'rocky') {
        const n = kind === 'volcanic' ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const px = cx + (i - (n - 1) / 2) * r * 0.42, h = r * (kind === 'volcanic' ? (i === 1 ? 0.62 : 0.42) : 0.36), w = r * 0.26;
          el('path', { d: `M${px - w} ${cy + h * 0.4}L${px} ${cy - h * 0.6}L${px + w} ${cy + h * 0.4}`, class: 'peak' }, gl);
        }
        if (kind === 'volcanic') el('path', { d: `M${cx} ${cy - r * 0.32}c-4 -8 6 -12 2 -20 c-3 -6 5 -9 3 -15`, class: 'smoke' }, gl);
      } else if (kind === 'karst') {
        const n = r > 30 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const px = cx + (i - (n - 1) / 2) * r * 0.32 + (rand() - 0.5) * 3, h = r * (0.5 + rand() * 0.35), w = r * 0.09;
          el('path', { d: `M${px - w} ${cy + r * 0.3}L${px - w * 0.8} ${cy + r * 0.3 - h}Q${px} ${cy + r * 0.3 - h - w * 1.6} ${px + w * 0.8} ${cy + r * 0.3 - h}L${px + w} ${cy + r * 0.3}`, class: 'tower' }, gl);
        }
      } else {
        const n = Math.round(3 + r / 9);
        for (let i = 0; i < n; i++) {
          const a = rand() * 6.28, d = rand() * r * (kind === 'atoll' ? 0.15 : 0.55) + (kind === 'atoll' ? r * 0.78 : 0);
          el('circle', { cx: cx + Math.cos(a) * d, cy: cy + Math.sin(a) * d * 0.9, r: 1.6 + rand() * 1.6, class: 'tree' }, gl);
        }
      }
      void s;
      const t = el('text', { x: cx, y: cy + r * 1.2 + 13, class: 'isle-name', 'text-anchor': 'middle' }, g);
      t.textContent = name;
      const show = () => {
        if (!tip) return;
        tipB.textContent = name;
        tipS.textContent = `${KIND[kind].label} · ${region}`;
        const box = g.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
        tip.style.left = `${box.left - wb.left + box.width / 2}px`;
        tip.style.top = `${box.top - wb.top}px`;
        tip.hidden = false;
      };
      const hide = () => { if (tip) tip.hidden = true; };
      g.addEventListener('pointerenter', show);
      g.addEventListener('pointerleave', hide);
      g.addEventListener('focus', show);
      g.addEventListener('blur', hide);
    }
  };
  draw(HOME, home, 'Las Afortunadas');
  draw(BRUMAS, brumas, 'Las Brumas');

  // home port
  const [hx, hy] = home(474, -327);
  const port = el('g', { class: 'port', transform: `translate(${hx + 30} ${hy - 30})` });
  port.innerHTML = '<circle r="13"/><path d="M0 -6v13M-5 -2h10M-7 3c2 5 12 5 14 0" /><text x="18" y="4">Home port</text>';

  // titles
  const title = (x, y, big, small, cls) => {
    const g = el('g', { class: `region ${cls}` });
    el('text', { x, y, class: 'region-name', 'text-anchor': 'middle' }, g).textContent = big;
    el('text', { x, y: y + 22, class: 'region-motto', 'text-anchor': 'middle' }, g).textContent = small;
  };
  title(205, 88, 'Las Afortunadas', 'The Fortunate Isles', 'r-home');
  title(1090, 520, 'Las Brumas', 'The Isles of Mist', 'r-mist');

  // compass rose and scale
  el('use', { href: '#i-crest', x: rose[0] - 58, y: rose[1] - 58, width: 116, height: 116, class: 'rose' });
  el('text', { x: rose[0], y: rose[1] - 66, 'text-anchor': 'middle', class: 'north' }).textContent = 'N';
  const sc = el('g', { class: 'scale', transform: 'translate(560 650)' });
  sc.innerHTML = '<path d="M0 0h132M0 -5v10M33 -3v6M66 -5v10M99 -3v6M132 -5v10"/><text x="66" y="-10" text-anchor="middle">two cables</text>';
})();
