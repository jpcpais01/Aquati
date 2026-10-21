// shared header/footer markup, injected so all ads stay identical
const CREST = `<svg class="crest" viewBox="0 0 64 64"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".55" stop-color="#efc463"/><stop offset="1" stop-color="#b98227"/></linearGradient></defs>
<circle cx="32" cy="32" r="29" fill="rgba(6,30,44,.55)"/>
<circle cx="32" cy="32" r="27" fill="none" stroke="url(#cg)" stroke-width="1.6" opacity=".9"/>
<circle cx="32" cy="32" r="22.5" fill="none" stroke="url(#cg)" stroke-width=".8" stroke-dasharray="1.2 3.2" opacity=".8"/>
<path d="M32 6 36 28 32 32 28 28Z M32 58 28 36 32 32 36 36Z M6 32 28 28 32 32 28 36Z M58 32 36 36 32 32 36 28Z" fill="url(#cg)"/>
<path d="M32 16 34 30 32 32 30 30Z M32 48 30 34 32 32 34 34Z M16 32 30 30 32 32 30 34Z M48 32 34 34 32 32 34 30Z" fill="url(#cg)" opacity=".7" transform="rotate(45 32 32)"/>
<circle cx="32" cy="32" r="2.4" fill="#0b3546" stroke="url(#cg)" stroke-width="1.2"/></svg>`;
const LOGO = (cls = '') => `<div class="logo ${cls}"><span class="logo-pre">Shores <em>O’</em></span><span class="logo-main">Fortune</span></div>`;
const PLAY = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#2a1a03"/><path d="M16 12.5 28 20 16 27.5Z" fill="#ffe08a"/></svg>`;
const CTA = (label = 'Play free now') => `<div class="cta-wrap"><div class="cta">${PLAY}${label}</div><div class="fine">No download <i></i> Phone, tablet &amp; PC <i></i> In your browser</div></div>`;
for (const el of document.querySelectorAll('[data-part]')) {
  const k = el.dataset.part;
  el.innerHTML = k === 'crest' ? CREST : k === 'logo' ? LOGO(el.dataset.cls) : k === 'cta' ? CTA(el.dataset.label) : '';
}
