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
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    // no APK for iPhone: point them at the home-screen install instead
    for (const a of $$('.cta-row .js-apk')) a.hidden = true;
    for (const p of $$('.ios-tip')) p.hidden = false;
  }

  // ---------- Android APK: link straight to the newest release's .apk ----------
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
  const findApk = async () => {
    try {
      const cached = sessionStorage.getItem('sof-apk');
      if (cached) return JSON.parse(cached);
    } catch {}
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=12`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(String(r.status));
    const list = await r.json();
    let info = null;
    for (const rel of list) {
      if (rel.draft) continue;
      const apk = (rel.assets || []).find((x) => /\.apk$/i.test(x.name));
      if (apk) {
        info = { url: apk.browser_download_url, tag: rel.tag_name || rel.name || 'Latest', mb: (apk.size / 1048576).toFixed(apk.size > 1e8 ? 0 : 1) };
        break;
      }
    }
    try { sessionStorage.setItem('sof-apk', JSON.stringify(info)); } catch {}
    return info;
  };
  findApk().then(setApk, () => { /* offline or rate limited: keep the releases link */ });

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
