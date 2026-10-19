import './account.css';
import { Cloud, CloudState, Welcome } from '../cloud/cloud';
import { icon } from './art';

// The captain's chip in the harbour's top bar and the sign-in card behind it.
// Guests see what an account would keep safe and sign in with Google or email;
// signed-in captains see their save, its sync state, and sign out. The card
// closes through the shared overlay plumbing in UI (Esc, the X, the backdrop).

export interface AccountStats {
  gold: number;
  treasures: number;
  total: number;
  designs: number;
  voyages: number;
}

const HAT = '<path d="M2.8 14.2c2.2-.9 3.6-5.2 9.2-5.2s7 4.3 9.2 5.2c-2.1 1.7-5.6 2.6-9.2 2.6s-7.1-.9-9.2-2.6z"/><path d="M6.6 11.6C7.2 8 9.3 5.8 12 5.8s4.8 2.2 5.4 5.8"/><path d="M10.6 12.4h2.8"/>';
const CLOUD = '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 9.6 4.5 4.5 0 0 0 7 18.5z"/>';
const SYNCED = '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 9.6 4.5 4.5 0 0 0 7 18.5z"/><path d="m9.3 13.6 2 2 3.6-3.8"/>';
const OFFLINE = '<path d="M7 18.5h10.5a4 4 0 0 0 1.9-.5M20.5 15a4 4 0 0 0-2.4-4.45A6 6 0 0 0 9.4 6.3M6.5 9.6A4.5 4.5 0 0 0 7 18.5"/><path d="M3 3l18 18"/>';
const OUT = '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9.5 16.5 5 12l4.5-4.5M5 12h10.5"/>';
const MAIL = '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>';
const COIN = '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M14.6 9.3c-.5-.8-1.5-1.2-2.6-1.2-1.5 0-2.6.8-2.6 1.9 0 2.6 5.4 1.4 5.4 4 0 1.1-1.2 1.9-2.8 1.9-1.2 0-2.2-.5-2.7-1.3"/>';
const CHEST = '<path d="M4 10.5a8 4.5 0 0 1 16 0V19H4z"/><path d="M4 12.5h16M10.5 12.5v2.5h3v-2.5"/>';
const FLAG = '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>';
const COMPASS = '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>';
const GOOGLE =
  '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const $ = (id: string) => document.getElementById(id)!;

/** A warm, stable colour per captain for initials avatars. */
function hue(uid: string) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : 'a while ago';
}

type Mode = 'in' | 'create' | 'reset';

export class AccountPanel {
  private root = $('account');
  private body = $('account-body');
  private chip = $('btn-account');
  private mode: Mode = 'in';
  private busy = false;
  private msg: { text: string; tone: 'bad' | 'good' } | null = null;
  private outArmed = false;
  private outStuck = false;
  private tick = 0;
  private flashT = 0;
  private uid = '';
  /** What the form held, kept across re-renders. */
  private draft = { email: '', name: '', pw: '' };

  constructor(
    private cloud: Cloud,
    private stats: () => AccountStats,
    private open: () => void,
    private click: () => void,
  ) {
    this.chip.addEventListener('click', () => {
      this.click();
      this.mode = 'in';
      this.msg = null;
      this.disarm();
      this.render();
      this.open();
      this.focusFirst();
    });
    cloud.subscribe(() => {
      // a new face: last captain's notes and half-typed forms don't carry over
      const uid = this.cloud.user?.uid ?? '';
      if (uid !== this.uid) {
        this.uid = uid;
        this.msg = null;
        this.disarm();
      }
      this.renderChip();
      // a guest mid-typing keeps their form: only a sign-in changes that view
      if (this.isOpen() && (this.cloud.user || this.root.dataset.who !== 'guest')) this.render();
    });
    // typing in the form mustn't steer ships or open charts
    this.body.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    new MutationObserver(() => {
      clearInterval(this.tick);
      if (this.isOpen()) this.tick = window.setInterval(() => this.cloud.user && this.render(), 20_000);
    }).observe(this.root, { attributes: true, attributeFilter: ['class'] });
    this.renderChip();
  }

  private isOpen() {
    return !this.root.classList.contains('hidden');
  }

  private focusFirst() {
    requestAnimationFrame(() => this.body.querySelector<HTMLElement>('[data-first]')?.focus({ preventScroll: true }));
  }

  /** A line from the chip: the welcome after signing in. */
  welcome(w: Welcome) {
    const first = w.name.split(/\s+/)[0];
    const text = w.kind === 'new' ? 'Your save is in the cloud now' : w.kind === 'joined' ? 'Guest progress added to your account' : `Welcome back, ${first}`;
    this.flash(text);
    if (this.isOpen() && w.kind !== 'back') {
      this.msg = { text: w.kind === 'new' ? 'Your gold, treasures and ships are now saved to your account.' : "Everything you'd earned as a guest is now part of your account.", tone: 'good' };
      this.render();
    }
  }

  private flash(text: string) {
    const label = this.chip.querySelector<HTMLElement>('.acct-flash');
    if (!label) return;
    label.textContent = text;
    this.chip.classList.add('flash');
    clearTimeout(this.flashT);
    this.flashT = window.setTimeout(() => this.chip.classList.remove('flash'), 3600);
  }

  // ------------------------------------------------------------------ chip

  private avatar(big = false) {
    const u = this.cloud.user;
    if (!u) return `<span class="acct-av guest${big ? ' big' : ''}">${icon(HAT)}</span>`;
    if (u.photo) return `<span class="acct-av${big ? ' big' : ''}"><img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer" /></span>`;
    return `<span class="acct-av${big ? ' big' : ''}" style="--h:${hue(u.uid)}">${esc(initials(u.name))}</span>`;
  }

  private renderChip() {
    const c = this.cloud;
    this.chip.classList.toggle('hidden', c.state === 'off');
    if (c.state === 'off') return;
    const u = c.user;
    this.chip.dataset.state = u ? c.state : 'guest';
    const label = u ? u.name.split(/\s+/)[0] : c.state === 'starting' ? 'Captain' : 'Sign in';
    this.chip.dataset.label = u ? `${u.name} · ${this.stateLine(c.state, true)}` : 'Sign in to save your progress';
    this.chip.setAttribute('aria-label', u ? `Account: ${u.name}` : 'Sign in');
    const flash = this.chip.querySelector('.acct-flash')?.textContent ?? '';
    this.chip.innerHTML = `${this.avatar()}<span class="acct-name">${esc(label)}</span><span class="acct-flash">${esc(flash)}</span><i class="acct-dot"></i>`;
  }

  private stateLine(s: CloudState, short = false) {
    switch (s) {
      case 'syncing':
        return 'Saving…';
      case 'synced':
        return short ? 'Saved' : `Saved to the cloud ${ago(this.cloud.lastSync)}`;
      case 'offline':
        return short ? 'Offline' : "Offline. Progress is kept here and saves when you're back.";
      case 'error':
        return short ? 'Not saved' : this.cloud.error;
      default:
        return 'Connecting…';
    }
  }

  // ------------------------------------------------------------------ card

  private statGrid(kicker: string) {
    const s = this.stats();
    const tile = (ico: string, v: string, l: string) => `<div class="acct-stat"><span class="ti">${icon(ico)}</span><b>${v}</b><small>${l}</small></div>`;
    return `
      <div class="acct-kicker">${kicker}</div>
      <div class="acct-stats">
        ${tile(COIN, s.gold.toLocaleString('en-US'), 'Gold')}
        ${tile(CHEST, `${s.treasures}<em>/${s.total}</em>`, 'Treasures')}
        ${tile(FLAG, String(s.designs), s.designs === 1 ? 'Design' : 'Designs')}
        ${tile(COMPASS, String(s.voyages), s.voyages === 1 ? 'Voyage' : 'Voyages')}
      </div>`;
  }

  private message() {
    return this.msg ? `<p class="acct-msg ${this.msg.tone}" role="status">${esc(this.msg.text)}</p>` : '';
  }

  private render() {
    this.keepDraft();
    const u = this.cloud.user;
    $('account-title').textContent = u ? 'Your captain' : this.mode === 'create' ? 'New captain' : this.mode === 'reset' ? 'Reset password' : 'Sign in';
    $('account-kicker').textContent = u ? 'Signed in' : 'Save your progress';
    this.root.dataset.who = u ? 'captain' : 'guest';
    this.body.innerHTML = u ? this.captainView() : this.guestView();
    const pw = this.body.querySelector<HTMLInputElement>('input[name=password]');
    if (pw) pw.value = this.draft.pw;
  }

  private captainView() {
    const c = this.cloud;
    const u = c.user!;
    const ico = c.state === 'synced' ? SYNCED : c.state === 'offline' || c.state === 'error' ? OFFLINE : CLOUD;
    const out = this.outStuck
      ? `<div class="acct-warn" role="alert"><b>Some progress hasn't reached the cloud yet.</b> Signing out now leaves it behind on this device. Sign in again later and it will sync.</div>
         <div class="acct-row"><button class="btn small ghost" data-act="stay">Stay signed in</button><button class="btn small warn" data-act="out-force">Sign out anyway</button></div>`
      : `<button class="btn acct-out${this.outArmed ? ' armed' : ''}" data-act="out"${this.busy ? ' disabled' : ''}><span class="ti">${icon(OUT)}</span><span>${this.outArmed ? 'Press again to sign out' : 'Sign out'}</span></button>
         ${this.outArmed ? '<p class="acct-fine">This device goes back to a fresh guest save. Everything stays safe in your account.</p>' : ''}`;
    return `
      <div class="acct-id">
        ${this.avatar(true)}
        <div class="acct-who">
          <b>${esc(u.name)}</b>
          <span>${esc(u.email)}</span>
          <em class="acct-via">${u.provider === 'google' ? `${GOOGLE} Google` : `<span class="ti">${icon(MAIL)}</span> Email`}</em>
        </div>
      </div>
      <div class="acct-sync" data-state="${c.state}">
        <span class="ti">${icon(ico)}</span>
        <span class="acct-sync-l">${esc(this.stateLine(c.state))}</span>
        <button class="btn small ghost" data-act="sync"${c.state === 'syncing' ? ' disabled' : ''}>Save now</button>
      </div>
      ${this.message()}
      ${this.statGrid('In your account')}
      <p class="acct-fine">Your gold, Treasure Vault finds, livery, saved designs, records and favourite ship follow you to every device you sign in on.</p>
      <div class="acct-foot">${out}</div>`;
  }

  private guestView() {
    const m = this.mode;
    const d = this.draft;
    const dis = this.busy ? ' disabled' : '';
    if (m === 'reset') {
      return `
        <p class="acct-lede">Enter your email and we'll send you a link to choose a new password.</p>
        <form class="acct-form" novalidate>
          <label class="acct-field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" value="${esc(d.email)}" data-first required /></label>
          ${this.message()}
          <button class="btn primary acct-go" type="submit"${dis}>${this.busy ? '<i class="acct-spin"></i>' : ''}Send reset link</button>
        </form>
        <button class="acct-link" data-act="mode-in">Back to sign in</button>`;
    }
    const create = m === 'create';
    return `
      <p class="acct-lede">Sign in and your gold, treasures and ships are kept safe in the cloud, ready on any device. Play as a guest and they stay on this one.</p>
      ${this.statGrid('Ready to save')}
      <button class="btn acct-google" data-act="google"${dis}>${GOOGLE}<span>Continue with Google</span></button>
      <div class="acct-or"><span>or with email</span></div>
      <form class="acct-form" novalidate>
        ${create ? `<label class="acct-field"><span>Captain's name</span><input name="name" type="text" autocomplete="nickname" maxlength="24" placeholder="Anne Bonny" value="${esc(d.name)}" /></label>` : ''}
        <label class="acct-field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" value="${esc(d.email)}" required /></label>
        <label class="acct-field"><span>Password</span><input name="password" type="password" autocomplete="${create ? 'new-password' : 'current-password'}" minlength="6" required />${create ? '' : '<button type="button" class="acct-link inline" data-act="mode-reset">Forgot?</button>'}</label>
        ${this.message()}
        <button class="btn primary acct-go" type="submit"${dis}>${this.busy ? '<i class="acct-spin"></i>' : ''}${create ? 'Create account' : 'Sign in'}</button>
      </form>
      <button class="acct-link" data-act="${create ? 'mode-in' : 'mode-create'}">${create ? 'Already sailing with us? <b>Sign in</b>' : 'New captain? <b>Create an account</b>'}</button>`;
  }

  private keepDraft() {
    const f = this.body.querySelector('form');
    if (!f) return;
    const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value;
    this.draft.email = v('email') ?? this.draft.email;
    this.draft.name = v('name') ?? this.draft.name;
    this.draft.pw = v('password') ?? this.draft.pw;
  }

  private disarm() {
    this.outArmed = false;
    this.outStuck = false;
  }

  private async onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act!;
    this.click();
    if (act.startsWith('mode-')) {
      this.keepDraft();
      this.draft.pw = '';
      this.mode = act.slice(5) as Mode;
      this.msg = null;
      this.render();
      this.focusFirst();
    } else if (act === 'google') {
      await this.attempt(() => this.cloud.google());
    } else if (act === 'sync') {
      void this.cloud.sync();
    } else if (act === 'stay') {
      this.disarm();
      this.render();
    } else if (act === 'out' || act === 'out-force') {
      if (act === 'out' && !this.outArmed) {
        this.outArmed = true;
        this.render();
        return;
      }
      this.busy = true;
      this.render();
      const ok = await this.cloud.signOut(act === 'out-force');
      this.busy = false;
      this.outArmed = false;
      this.outStuck = !ok;
      this.mode = 'in';
      this.msg = ok ? { text: "Signed out. You're sailing as a guest on this device.", tone: 'good' } : null;
      this.render();
    }
  }

  private async submit() {
    if (this.busy) return;
    const f = this.body.querySelector('form')!;
    const v = (n: string) => ((f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '').trim();
    this.keepDraft();
    const email = v('email');
    const pw = (f.elements.namedItem('password') as HTMLInputElement | null)?.value ?? '';
    if (!email) return this.say("Enter your email first.");
    if (this.mode === 'reset') {
      const ok = await this.attempt(() => this.cloud.reset(email), false);
      if (ok) this.say(`A reset link is on its way to ${email}. Check your inbox (and the spam folder).`, 'good');
      return;
    }
    if (!pw) return this.say('Enter your password.');
    const name = v('name').replace(/[<>]/g, '').slice(0, 24);
    await this.attempt(() => (this.mode === 'create' ? this.cloud.create(email, pw, name) : this.cloud.signIn(email, pw)));
  }

  private say(text: string, tone: 'bad' | 'good' = 'bad') {
    this.msg = { text, tone };
    this.render();
  }

  /** Runs a sign-in step with the busy state and a friendly error. */
  private async attempt(fn: () => Promise<unknown>, clear = true) {
    this.busy = true;
    this.msg = null;
    this.render();
    try {
      await fn();
      this.busy = false;
      this.render();
      if (clear) this.draft = { email: '', name: '', pw: '' };
      return true;
    } catch (e) {
      this.busy = false;
      const text = await this.cloud.explain(e);
      this.msg = text ? { text, tone: 'bad' } : null;
      this.render();
      return false;
    }
  }
}
