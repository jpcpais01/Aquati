import './crew.css';
import type { Coop } from '../net/coop';
import { getSignal, signalReady } from '../net/signal';
import { cleanCode, MAX_CREW } from '../net/transport';
import { icon } from './art';

// "Sail together": the crew card. Host a voyage (a code and a link to share)
// or join one by code, see who's aboard and how far their ships are on the
// wire, and leave. Opens from the harbour's top bar, the pause menu, and the
// HUD's crew button (the voyage carries on behind it).

const NAME_KEY = 'aquati.captain';

const CREW = '<circle cx="8.5" cy="8" r="3"/><path d="M3 19c.6-3.6 2.8-5.6 5.5-5.6s4.9 2 5.5 5.6"/><circle cx="16.5" cy="9" r="2.4"/><path d="M15.4 13.5c.4-.1.8-.1 1.1-.1 2.3 0 4.1 1.7 4.6 4.8"/>';
const SAILS = '<path d="M12 3v15M12 4c3.5 2 5.5 5.6 5.5 10H12M11 6c-2.6 1.6-4.4 4.6-4.5 8H11"/><path d="M3.5 18h17l-2 3h-13z"/>';
const KEY = '<circle cx="8" cy="12" r="4.2"/><path d="M12.2 12H21M17.5 12v3M20 12v2.4"/>';
const LINK = '<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/>';
const SHARE = '<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>';
const OUT = '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9.5 16.5 5 12l4.5-4.5M5 12h10.5"/>';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = (id: string) => document.getElementById(id)!;

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

const pretty = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

export interface CrewHost {
  /** Opens the crew card (the shared overlay plumbing). */
  open(): void;
  click(): void;
  /** At sea (a guest can only join from the harbour). */
  atSea(): boolean;
  /** A name to start from: the signed-in captain's. */
  suggest(): string;
}

export class CrewPanel {
  private body = $('crew-body');
  private hudBtn = $('btn-crew3');
  name: string;
  private code = '';
  /** A code being looked up, and what the lookup found. */
  private found: { code: string; host: string } | null = null;
  private looking = false;
  private msg = '';
  private copied = 0;
  private endArmed = 0;
  private known = new Set<number>();

  constructor(private coop: Coop, private h: CrewHost) {
    let saved = '';
    try {
      saved = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      /* private mode */
    }
    this.name = saved;
    const open = () => {
      this.h.click();
      this.msg = '';
      this.render();
      this.h.open();
    };
    for (const id of ['btn-crew', 'btn-crew2', 'btn-crew3']) $(id).addEventListener('click', open);
    // typing a name or a code mustn't steer ships or open charts
    this.body.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinTyped();
    });
    this.body.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'crew-name') this.setName(t.value);
      if (t.id === 'crew-code') {
        const c = cleanCode(t.value);
        if (c !== this.code) {
          this.code = c;
          this.found = null;
          this.msg = '';
        }
        const go = this.body.querySelector<HTMLButtonElement>('[data-act="join"]');
        if (go) go.disabled = c.length !== 6;
      }
    });
    this.render();
  }

  private setName(v: string) {
    this.name = v.replace(/\s+/g, ' ').slice(0, 20);
    try {
      localStorage.setItem(NAME_KEY, this.name.trim());
    } catch {
      /* private mode */
    }
  }

  private get shownName() {
    return this.name.trim() || this.h.suggest();
  }

  /** Arrived by an invite link: the card opens with the voyage looked up, one tap from aboard. */
  invite(code: string) {
    this.code = cleanCode(code);
    if (this.code.length !== 6 || this.coop.live) return;
    this.msg = '';
    void this.lookup(this.code);
    this.render();
    this.h.open();
  }

  private async lookup(code: string) {
    if (!signalReady()) return;
    this.looking = true;
    this.render();
    const r = await getSignal().find(code);
    this.looking = false;
    if (code !== this.code) return;
    if ('host' in r) this.found = { code, host: r.host };
    else this.msg = r.error;
    this.render();
  }

  private joinTyped() {
    if (this.code.length !== 6 || this.coop.live) return;
    if (this.h.atSea()) {
      this.msg = 'Return to harbour first: you join another captain\'s sea from there.';
      this.render();
      return;
    }
    void this.coop.join(this.code, this.shownName);
  }

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    this.h.click();
    if (act === 'host') void this.coop.host(this.shownName);
    else if (act === 'join') this.joinTyped();
    else if (act === 'copy') this.copy();
    else if (act === 'share') this.share();
    else if (act === 'leave') void this.coop.leave();
    else if (act === 'kick') this.coop.kick(Number(b.dataset.idx));
    else if (act === 'end') {
      if (!this.endArmed) {
        this.endArmed = window.setTimeout(() => {
          this.endArmed = 0;
          this.render();
        }, 3200);
        this.render();
        return;
      }
      clearTimeout(this.endArmed);
      this.endArmed = 0;
      void this.coop.leave();
    }
  }

  private link() {
    return `${location.origin}${location.pathname}?join=${this.coop.session?.code ?? ''}`;
  }

  private copy() {
    const done = () => {
      clearTimeout(this.copied);
      this.copied = window.setTimeout(() => {
        this.copied = 0;
        this.render();
      }, 1800);
      this.render();
    };
    navigator.clipboard?.writeText(this.link()).then(done, () => {
      // no clipboard (an insecure page, an old browser): select the link to copy by hand
      const inp = this.body.querySelector<HTMLInputElement>('.crew-link input');
      inp?.select();
    });
  }

  private share() {
    const code = this.coop.session?.code ?? '';
    void navigator.share?.({ title: 'Shores of Fortune', text: `Sail with me in Shores of Fortune! Code ${pretty(code)}`, url: this.link() }).catch(() => {});
  }

  /** The card and the HUD's crew button, redrawn whenever the crew changes. */
  render() {
    const c = this.coop;
    const live = c.live;
    const roster = c.roster();
    // a new face aboard (or one gone) pulses the HUD button
    const ids = new Set(roster.map((r) => r.idx));
    if (live && [...ids].some((i) => !this.known.has(i))) {
      this.hudBtn.classList.remove('pulse');
      void this.hudBtn.offsetWidth;
      this.hudBtn.classList.add('pulse');
    }
    this.known = ids;
    this.hudBtn.classList.toggle('live', live);
    this.hudBtn.dataset.n = live ? String(roster.length) : '';
    $('btn-crew').classList.toggle('live', live);
    const kicker = $('crew-kicker');
    const title = $('crew-title');
    let html = '';
    if (!signalReady()) {
      kicker.textContent = 'Multiplayer';
      title.textContent = 'Sail together';
      html = `<p class="crew-lede">Sailing with friends needs the online harbour, and this build of the game isn't connected to it.</p>`;
    } else if (c.phase === 'opening' || c.phase === 'joining') {
      kicker.textContent = c.phase === 'opening' ? 'Opening your sea' : 'Rowing across';
      title.textContent = c.phase === 'opening' ? 'Hosting…' : 'Joining…';
      html = `<div class="crew-wait"><span class="crew-spin"></span><p>${c.phase === 'opening' ? 'Setting out an invitation…' : `Hailing ${esc(this.found?.host ?? 'the host')}'s ship…`}</p></div>`;
    } else if (live && c.hosting) {
      kicker.textContent = 'Your sea is open';
      title.textContent = 'Sail together';
      const code = c.session!.code;
      const shareBtn = typeof navigator.share === 'function' ? `<button class="btn small" data-act="share"><span class="ti">${icon(SHARE)}</span>Share</button>` : '';
      html = `
        <div class="crew-invite">
          <div class="crew-code-l"><span class="ti">${icon(KEY)}</span>Invite code</div>
          <div class="crew-code-big" aria-label="Invite code ${code.split('').join(' ')}">${pretty(code)}</div>
          <div class="crew-link"><span class="ti">${icon(LINK)}</span><input readonly value="${esc(this.link())}" aria-label="Invite link" />
            <button class="btn small${this.copied ? ' done' : ''}" data-act="copy">${this.copied ? 'Copied' : 'Copy link'}</button>${shareBtn}</div>
        </div>
        ${this.list(roster, true)}
        <p class="acct-fine">Friends join from the harbour and set sail right beside you. Your game runs this sea, so keep it open while you sail together.</p>
        <div class="crew-foot"><button class="btn small ${this.endArmed ? 'warn' : 'ghost'}" data-act="end"><span class="ti">${icon(OUT)}</span>${this.endArmed ? 'Press again to end it for everyone' : 'End the voyage'}</button></div>`;
    } else if (live) {
      const host = c.session!.roster.get(0) ?? 'the host';
      kicker.textContent = 'Aboard';
      title.textContent = `${host}'s voyage`;
      html = `
        <p class="crew-lede">${this.h.atSea() ? 'You\'re sailing in their sea: their pirates, their weather, every broadside shared.' : 'Pick your ship and set sail: you\'ll fall in right beside them.'}</p>
        ${this.list(roster, false)}
        <div class="crew-foot"><button class="btn small ghost" data-act="leave"><span class="ti">${icon(OUT)}</span>Leave the crew</button></div>`;
    } else {
      kicker.textContent = 'Up to four captains';
      title.textContent = 'Sail together';
      const atSea = this.h.atSea();
      const f = this.found && this.found.code === this.code ? this.found : null;
      html = `
        <p class="crew-lede">One sea, the same pirates and storms, every broadside shared. Each captain keeps their own gold and plunder.</p>
        <label class="acct-field crew-name"><span>Your name at sea</span><input id="crew-name" maxlength="20" autocomplete="nickname" placeholder="${esc(this.h.suggest())}" value="${esc(this.name)}" /></label>
        <div class="crew-ways">
          <section class="crew-way host">
            <span class="crew-way-ico">${icon(SAILS)}</span>
            <h3>Host a voyage</h3>
            <p>Open your sea and invite up to ${MAX_CREW - 1} friends with a link or a code.</p>
            <button class="btn primary" data-act="host"><span class="ti">${icon(CREW)}</span>Host</button>
          </section>
          <section class="crew-way">
            <span class="crew-way-ico">${icon(KEY)}</span>
            <h3>${f ? `Join ${esc(f.host)}` : 'Join a voyage'}</h3>
            <p>${atSea ? 'Return to harbour to join another captain\'s sea.' : f ? 'Their sea is open. Come aboard!' : 'Type the code your host shared.'}</p>
            <form class="crew-join" novalidate>
              <input id="crew-code" class="crew-code" maxlength="7" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC DEF" value="${esc(pretty(this.code))}" aria-label="Invite code" />
              <button class="btn${f ? ' primary' : ''}" data-act="join" type="submit"${this.code.length !== 6 || atSea ? ' disabled' : ''}>${this.looking ? 'Looking…' : 'Join'}</button>
            </form>
          </section>
        </div>`;
    }
    const err = c.error || this.msg;
    if (err && !live) html += `<p class="acct-msg bad" role="status">${esc(err)}</p>`;
    // keep the caret where it was if the code field is being typed in
    const active = document.activeElement as HTMLInputElement | null;
    const focusId = active && this.body.contains(active) ? active.id : '';
    const caret = focusId ? active!.selectionStart : null;
    this.body.innerHTML = html;
    if (focusId) {
      const el = document.getElementById(focusId) as HTMLInputElement | null;
      if (el) {
        el.focus({ preventScroll: true });
        if (caret !== null) el.setSelectionRange(caret, caret);
      }
    }
  }

  private list(roster: ReturnType<Coop['roster']>, host: boolean) {
    const rows = roster.map((r) => {
      const tag = r.idx === 0 ? '<em>Host</em>' : r.me ? '<em>You</em>' : '';
      const ping = r.me ? '' : `<span class="crew-ping ${r.ping < 120 ? 'good' : r.ping < 250 ? 'ok' : 'slow'}" title="${r.ping} ms"><i></i><i></i><i></i></span>`;
      const kick = host && !r.me ? `<button class="round-btn crew-kick" data-act="kick" data-idx="${r.idx}" title="Send ${esc(r.name)} back to harbour" aria-label="Send ${esc(r.name)} back to harbour">${icon('<path d="M6 6l12 12M18 6 6 18"/>')}</button>` : '';
      return `<li><span class="acct-av" style="--h:${hue(r.name)}">${esc(r.name.slice(0, 1).toUpperCase() || '?')}</span><span class="crew-who"><b>${esc(r.name)}</b>${tag}</span>${ping}${kick}</li>`;
    });
    for (let i = roster.length; i < MAX_CREW; i++) rows.push(`<li class="empty"><span class="acct-av guest"></span><span class="crew-who">A free berth</span></li>`);
    return `<ul class="crew-list">${rows.join('')}</ul>`;
  }
}
