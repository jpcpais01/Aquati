// Shores O' Fortune · landing page
(() => {
  // Where the buttons go. Change these two lines if the game or the repo moves.
  const PLAY_URL = 'https://aquati.vercel.app';
  const REPO = 'jpcpais01/Aquati';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const a of $$('.js-play')) a.href = PLAY_URL;

  // ---------- platform hints ----------
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows NT/i.test(ua) && !/Windows Phone/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    // no APK for iPhone: point them at the home-screen install instead
    for (const a of $$('.cta-row .js-apk')) a.hidden = true;
    for (const p of $$('.ios-tip')) p.hidden = false;
  }
  // on a Windows PC the big buttons offer the Windows game in the APK's place
  for (const a of $$('.cta-row .js-exe')) a.hidden = !isWindows;
  if (isWindows) for (const a of $$('.cta-row .js-apk')) a.hidden = true;

  // ---------- downloads: link straight to the newest release's .apk and .exe ----------
  const RELEASES = `https://github.com/${REPO}/releases`;
  const setApk = (info) => {
    for (const a of $$('.js-apk')) {
      a.href = info ? info.url : RELEASES;
      a.classList.toggle('soon', !info);
      a.closest('.platform')?.classList.toggle('soon', !info);
      if (info) a.setAttribute('download', '');
      // on an Android phone, put the app first once there is one to get
      if (info && isAndroid && a.closest('.cta-row')) a.classList.add('is-android');
    }
    for (const n of $$('.js-apk-note')) n.textContent = info ? `${info.tag} · ${info.mb} MB APK` : 'Coming soon · follow on GitHub';
  };
  const setExe = (info) => {
    for (const a of $$('.js-exe')) {
      a.href = info ? info.url : RELEASES;
      a.classList.toggle('soon', !info);
      a.closest('.platform')?.classList.toggle('soon', !info);
      if (info) a.setAttribute('download', '');
    }
    for (const n of $$('.js-exe-note')) n.textContent = info ? `${info.tag.replace(/^android-/, '')} · ${info.mb} MB · Windows 10 & 11` : 'Coming soon · follow on GitHub';
  };
  // the newest release that carries each kind of file (a release may have one and not yet the other)
  const findBuilds = async () => {
    try {
      const cached = sessionStorage.getItem('sof-builds');
      if (cached) return JSON.parse(cached);
    } catch {}
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=12`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(String(r.status));
    const list = await r.json();
    const found = { apk: null, exe: null };
    for (const rel of list) {
      if (rel.draft || rel.prerelease) continue;
      for (const [kind, re] of [['apk', /\.apk$/i], ['exe', /\.exe$/i]]) {
        const f = found[kind] ? null : (rel.assets || []).find((x) => re.test(x.name));
        if (f) found[kind] = { url: f.browser_download_url, tag: rel.tag_name || rel.name || 'Latest', mb: (f.size / 1048576).toFixed(f.size > 1e8 ? 0 : 1) };
      }
      if (found.apk && found.exe) break;
    }
    try { sessionStorage.setItem('sof-builds', JSON.stringify(found)); } catch {}
    return found;
  };
  findBuilds().then((b) => { setApk(b.apk); setExe(b.exe); }, () => { /* offline or rate limited: keep the releases links */ });

  // ---------- nav turns to glass once you leave the hero ----------
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- gentle hero parallax ----------
  const heroMedia = $('.hero-media');
  if (!reduced && heroMedia) {
    let ticking = false;
    addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.min(scrollY, innerHeight);
        heroMedia.style.transform = `translate3d(0, ${y * 0.28}px, 0)`;
        ticking = false;
      });
    }, { passive: true });
  }

  // ---------- reveal on scroll + count-up ----------
  const countUp = (el) => {
    const to = +el.dataset.count;
    if (reduced) return;
    const t0 = performance.now();
    const dur = 1400;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      const n = e.target.querySelector('[data-count]');
      if (n) countUp(n);
      io.unobserve(e.target);
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  for (const el of $$('.reveal')) io.observe(el);

  // ---------- shipyard ----------
  const SHIPS = {
    sloop: { class: 'Sloop', name: 'The Kestrel', blurb: 'A darting single-master. Outruns anything afloat and turns on a doubloon, but splinters easily.', guns: 6, hp: 260, reload: '2.4s', stats: { speed: 1, agility: 1, armour: 0.25, hull: 0.33, firepower: 0.3 } },
    brig: { class: 'Brigantine', name: 'The Corsair', blurb: 'The balanced raider. Two masts of canvas, a respectable broadside and a hull that can take a beating.', guns: 10, hp: 430, reload: '3.2s', stats: { speed: 0.72, agility: 0.62, armour: 0.55, hull: 0.6, firepower: 0.6 } },
    galleon: { class: 'Galleon', name: 'The Leviathan', blurb: 'A floating fortress with three masts and towering castles. Slow to turn, devastating when she does.', guns: 16, hp: 760, reload: '4.2s', stats: { speed: 0.42, agility: 0.3, armour: 0.95, hull: 1, firepower: 1 } },
  };
  const tabs = $$('.ship-tabs [role=tab]');
  const card = $('.ship-card');
  const panel = $('#ship-panel');
  let current = 'brig';
  const showShip = (id, first = false) => {
    const s = SHIPS[id];
    if (!s || (id === current && !first)) return;
    current = id;
    for (const t of tabs) {
      const on = t.dataset.ship === id;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      if (on) panel.setAttribute('aria-labelledby', t.id);
    }
    for (const img of $$('[data-ship-img]')) img.classList.toggle('on', img.dataset.shipImg === id);
    const fill = () => {
      for (const el of $$('[data-f]', card)) el.textContent = s[el.dataset.f];
      card.classList.remove('swap');
    };
    if (first) fill();
    else { card.classList.add('swap'); setTimeout(fill, 220); }
    for (const b of $$('[data-bar]', card)) b.style.setProperty('--v', s.stats[b.dataset.bar]);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => showShip(t.dataset.ship));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus();
      showShip(n.dataset.ship);
    });
  });
  // bars grow in when the shipyard scrolls into view
  for (const b of $$('[data-bar]', card)) b.style.setProperty('--v', 0);
  new IntersectionObserver((es, o) => {
    if (es.some((e) => e.isIntersecting)) { showShip(current, true); o.disconnect(); }
  }, { threshold: 0.3 }).observe(card);
  // start loading the other two hulls once the page has settled
  addEventListener('load', () => setTimeout(() => { for (const img of $$('[data-ship-img]')) img.loading = 'eager'; }, 1200));

  // ---------- the sky dial ----------
  const SKY = [
    { id: 'clear', label: 'Bright morning', time: '09:30' },
    { id: 'cloudy', label: 'Overcast', time: '12:10' },
    { id: 'golden', label: 'Golden hour', time: '17:40' },
    { id: 'night', label: 'Moonlit night', time: '23:15' },
    { id: 'storm', label: 'Storm rolling in', time: '15:05' },
  ];
  const sky = $('#sky');
  const range = $('#sky-range');
  const stops = $$('.sky-stops button');
  const setSky = (i) => {
    const s = SKY[i];
    sky.dataset.time = s.id;
    range.value = i;
    for (const img of $$('[data-sky]')) img.classList.toggle('on', img.dataset.sky === s.id);
    $('[data-sky-label]').textContent = s.label;
    $('[data-sky-time]').textContent = s.time;
    stops.forEach((b, j) => b.classList.toggle('on', j === i));
  };
  let skyAuto = !reduced;
  let skyTimer = 0;
  const stopAuto = () => { skyAuto = false; clearInterval(skyTimer); };
  range.addEventListener('input', () => { stopAuto(); setSky(+range.value); });
  for (const b of stops) b.addEventListener('click', () => { stopAuto(); setSky(+b.dataset.i); });
  // drift through the day by itself while it's on screen, until someone takes the dial
  new IntersectionObserver((es) => {
    clearInterval(skyTimer);
    if (!skyAuto || !es[0].isIntersecting) return;
    skyTimer = setInterval(() => setSky((+range.value + 1) % SKY.length), 3800);
  }, { threshold: 0.5 }).observe($('.sky-frames'));
  // warm the other frames
  addEventListener('load', () => setTimeout(() => { for (const img of $$('[data-sky]')) img.loading = 'eager'; }, 1500));

  // ---------- postcard marquee: loop seamlessly ----------
  const track = $('.marquee-track');
  if (track && !reduced) for (const pc of [...track.children]) {
    const c = pc.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    track.appendChild(c);
  }

  // ---------- lightbox ----------
  const lb = $('#lightbox');
  if (lb && typeof lb.showModal === 'function') {
    const lbImg = $('img', lb);
    const lbCap = $('.lb-cap', lb);
    document.addEventListener('click', (e) => {
      const fig = e.target.closest('[data-lb]');
      if (!fig) return;
      const img = $('img', fig);
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCap.textContent = $('h3', fig)?.textContent ? `${$('h3', fig).textContent}: ${img.alt}` : ($('figcaption', fig)?.textContent || img.alt);
      lb.showModal();
    });
    $('.lb-close', lb).addEventListener('click', () => lb.close());
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
  }
})();

// ================= second pass: the living bits =================
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''));

  // ---------- the wordmark rises letter by letter, then takes a glint now and then ----------
  const word = $('.hero .logo-main');
  if (word && !reduced) {
    const text = word.textContent.trim();
    word.setAttribute('aria-label', text);
    word.innerHTML = [...text].map((c, i) => `<span class="ch" style="--i:${i}" aria-hidden="true">${c}</span>`).join('');
    setTimeout(() => { word.textContent = text; word.classList.add('shine'); }, 250 + text.length * 70 + 1150);
  }

  // ---------- hero: a live loop from the game on wide screens ----------
  const video = $('.hero-video');
  const wide = matchMedia('(min-aspect-ratio: 4/5) and (min-width: 820px)');
  if (video && !reduced && !saveData && wide.matches) {
    video.src = innerWidth * (devicePixelRatio || 1) > 1700 ? 'media/hero-1920.mp4' : 'media/hero-1280.mp4';
    video.addEventListener('playing', () => video.classList.add('on'), { once: true });
    const start = () => video.play().catch(() => {});
    if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
    // pause it while it's off screen
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : video.pause()), { threshold: 0.05 }).observe(video);
  }

  // ---------- ship's clock: the day passes as you scroll down the page ----------
  const clock = $('.clock');
  if (clock) {
    const t = $('.clock-t', clock);
    const tick = () => {
      const k = Math.min(1, Math.max(0, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
      const mins = Math.round(15.5 * 60 + k * 7.2 * 60); // 15:30 → 22:42
      t.textContent = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      clock.classList.toggle('night', mins >= 19 * 60 + 40);
    };
    addEventListener('scroll', tick, { passive: true });
    tick();
  }

  // ---------- the game's music, off until asked for ----------
  const btn = $('.sound');
  const song = $('#sea-song');
  if (btn && song) {
    let fade = 0;
    const ramp = (to, done) => {
      cancelAnimationFrame(fade);
      const from = song.volume, t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 1200);
        song.volume = from + (to - from) * k;
        if (k < 1) fade = requestAnimationFrame(step); else done?.();
      };
      fade = requestAnimationFrame(step);
    };
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', on);
      btn.setAttribute('aria-label', on ? 'Stop the music' : "Play the game's music");
      if (on) { song.volume = 0; song.play().then(() => ramp(0.55)).catch(() => btn.setAttribute('aria-pressed', 'false')); }
      else ramp(0, () => song.pause());
    });
  }

  // ---------- trailer ----------
  const dlg = $('#trailer');
  if (dlg && typeof dlg.showModal === 'function') {
    const v = $('video', dlg);
    let musicWasOn = false;
    for (const b of $$('.js-trailer')) b.addEventListener('click', () => {
      musicWasOn = btn?.getAttribute('aria-pressed') === 'true';
      if (musicWasOn) btn.click();
      dlg.showModal();
      v.currentTime = 0;
      v.play().catch(() => {});
    });
    const close = () => dlg.close();
    $('.lb-close', dlg).addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('close', () => { v.pause(); if (musicWasOn) btn.click(); });
  } else for (const b of $$('.js-trailer')) b.addEventListener('click', () => open('media/trailer.mp4', '_blank'));

  // ---------- "fresh from the shipyard": the latest patch notes, straight from the repo ----------
  const ticker = $('.ticker');
  if (ticker) {
    const ago = (iso) => {
      const h = (Date.now() - Date.parse(iso)) / 36e5;
      if (!(h >= 0)) return 'Fresh from the shipyard';
      if (h < 1) return 'Updated within the hour';
      if (h < 24) return `Updated ${Math.round(h)} h ago`;
      const d = Math.round(h / 24);
      return `Updated ${d} day${d > 1 ? 's' : ''} ago`;
    };
    fetch('https://raw.githubusercontent.com/jpcpais01/Aquati/main/src/data/patchNotes.ts')
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((src) => {
        const hour = (src.match(/hour:\s*'([^']+)'/) || [])[1];
        const titles = [...src.matchAll(/title:\s*'((?:[^'\\]|\\.)*)'/g)].slice(0, 10).map((m) => m[1].replace(/\\'/g, '’').replace(/'/g, '’'));
        if (!titles.length) return;
        const track = $('.ticker-track', ticker);
        const row = titles.map((t) => `<span>${t.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</span>`).join('');
        track.innerHTML = row + row;
        if (hour) $('.ticker-when', ticker).textContent = ago(hour);
        ticker.hidden = false;
      })
      .catch(() => {});
  }

  // ---------- the chart scrolls sideways on phones; drop the hint once they've tried it ----------
  const cs = $('.chart-scroll');
  cs?.addEventListener('scroll', () => cs.closest('.chart').classList.add('swiped'), { once: true, passive: true });

  // ---------- pointer light on cards ----------
  if (matchMedia('(hover: hover)').matches) document.addEventListener('pointermove', (e) => {
    const c = e.target.closest?.('.tile, .platform, .ship-card');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`);
    c.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // ---------- a sky full of stars over the finale ----------
  const stars = $('.stars');
  if (stars) {
    let h = '';
    for (let i = 0; i < 46; i++) {
      const r = (n) => (Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1;
      const a = Math.abs(r(1)), b = Math.abs(r(2)), c = Math.abs(r(3));
      h += `<i style="left:${(a * 100).toFixed(1)}%;top:${(b * 100).toFixed(1)}%;--s:${(1 + c * 2).toFixed(1)}px;--t:${(2 + c * 4).toFixed(1)}s;--dl:${(-a * 5).toFixed(1)}s"></i>`;
    }
    stars.innerHTML = h;
  }

  // ---------- turntable: drag to sail round her (36 real renders a ship) ----------
  const stage = $('.ship-stage');
  const cv = $('.turn-canvas');
  const hint = $('.turn-hint');
  if (stage && cv) {
    const N = 36;
    const ctx = cv.getContext('2d');
    const sets = {};
    let ship = 'brig', frame = 0, vel = 0, dragging = false, lastX = 0, raf = 0, used = false;
    const current = () => $$('.ship-tabs [role=tab]').find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.ship || 'brig';
    const load = (id) => {
      if (sets[id]) return sets[id];
      const s = { imgs: [], ready: 0, done: null };
      s.done = new Promise((res) => {
        for (let i = 0; i < N; i++) {
          const im = new Image();
          im.decoding = 'async';
          im.onload = im.onerror = () => { if (++s.ready === N) res(); };
          im.src = `img/turn/${id}-${String(i).padStart(2, '0')}.webp`;
          s.imgs.push(im);
        }
      });
      return (sets[id] = s);
    };
    const draw = () => {
      const s = sets[ship];
      const im = s && s.imgs[((Math.round(frame) % N) + N) % N];
      if (im && im.complete && im.naturalWidth) {
        const cw = cv.width, ch = cv.height, r = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
        const w = im.naturalWidth * r, h = im.naturalHeight * r;
        ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
      }
    };
    const size = () => {
      const r = stage.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(r.width * d);
      cv.height = Math.round(r.height * d);
      draw();
    };
    addEventListener('resize', size);
    const loop = () => {
      if (!dragging) {
        frame += vel;
        vel *= 0.93;
        // settle back onto a whole frame
        if (Math.abs(vel) < 0.02) { vel = 0; frame = Math.round(frame); }
      }
      draw();
      if (dragging || vel) raf = requestAnimationFrame(loop); else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const activate = async () => {
      ship = current();
      const s = load(ship);
      if (s.ready < N) { hint.classList.add('loading'); await s.done; hint.classList.remove('loading'); }
      if (ship !== current()) return;
      size();
      cv.classList.add('on');
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!sets[ship] || sets[ship].ready < N) return;
      dragging = true; used = true; lastX = e.clientX; vel = 0;
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('grab');
      hint.classList.add('gone');
      kick();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const step = (dx / cv.getBoundingClientRect().width) * N * 1.1;
      frame -= step;
      vel = -step;
    });
    const up = () => { dragging = false; cv.classList.remove('grab'); kick(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    // the turntable starts where the still left off, so switching ships resets it
    for (const t of $$('.ship-tabs [role=tab]')) t.addEventListener('click', () => {
      cv.classList.remove('on');
      frame = 0; vel = 0;
      setTimeout(activate, 50);
    });
    // load the shown ship once the shipyard is near, then show off with one slow turn
    new IntersectionObserver((es, o) => {
      if (!es.some((e) => e.isIntersecting)) return;
      o.disconnect();
      activate().then(() => {
        if (reduced || used) return;
        setTimeout(() => {
          if (used) return;
          let k = 0;
          const spin = () => {
            if (used) return;
            k++;
            frame = (k / 140) * N;
            draw();
            if (k < 140) requestAnimationFrame(spin); else frame = 0, draw();
          };
          requestAnimationFrame(spin);
        }, 700);
      });
    }, { rootMargin: '300px 0px' }).observe(stage);
  }
})();
