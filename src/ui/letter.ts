import './letter.css';
import { replay } from './replay';

// A note that has come aboard: a message fished out of a bottle, or the scroll
// a carrier gull brought to the rail. It unrolls at the side of the view as a
// sheet of salt-stained paper (ink, a wax seal, a signature, what it brings
// you) and rolls itself up again after a while; a tap or click puts it away
// sooner. The voyage sails on beneath it.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface LetterView {
  /** How it came: 'bottle' or 'gull' (the badge on the card). */
  via: 'bottle' | 'gull';
  /** Small caps over the sheet: "Message in a bottle". */
  kicker: string;
  /** The opening line, in a bigger hand. */
  title: string;
  /** The letter itself: paragraphs. */
  body: string[];
  sign?: string;
  /** What it brings: "+250 gold", "Treasure map piece 2 of 3". */
  reward?: string;
  /** A picture inked beside the text (an SVG portrait, say). */
  art?: string;
  /** Wax colour: red for a letter, black for a pirate's. */
  seal?: 'red' | 'black' | 'gold';
}

const BOTTLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2.5h4M10.4 2.5v3.8c0 .8-.5 1.4-1.2 2-1.2 1-2.2 2.3-2.2 4.6v6.6A2 2 0 0 0 9 21.5h6a2 2 0 0 0 2-2v-6.6c0-2.3-1-3.6-2.2-4.6-.7-.6-1.2-1.2-1.2-2V2.5"/><path d="M9.5 12.5h5v5h-5z"/></svg>';
const GULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 10.5c3.2-1.6 6.6-1.2 10 2.2 3.4-3.4 6.8-3.8 10-2.2"/><path d="M12 12.7c-.3 2-1.5 3.6-3.2 4.6M12 12.7c.3 2 1.5 3.6 3.2 4.6"/></svg>';

export class LetterCard {
  private el: HTMLElement;
  private timer = 0;
  private queue: [LetterView, number][] = [];
  /** A letter has been put away (timed out or tapped). */
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'letter';
    this.el.setAttribute('role', 'status');
    parent.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.hide();
    });
  }

  get isOpen() {
    return this.el.classList.contains('on');
  }

  /** Unrolls a letter; one arriving while another is open waits its turn. */
  show(v: LetterView, life = 11) {
    if (this.isOpen) {
      this.queue.push([v, life]);
      return;
    }
    const e = this.el;
    e.className = `lt-${v.via} seal-${v.seal ?? 'red'}`;
    e.innerHTML = `
      <div class="lt-badge">${v.via === 'gull' ? GULL : BOTTLE}<span>${esc(v.kicker)}</span></div>
      <div class="lt-sheet">
        ${v.art ? `<div class="lt-art">${v.art}</div>` : ''}
        <b class="lt-title">${esc(v.title)}</b>
        ${v.body.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${v.sign ? `<i class="lt-sign">${esc(v.sign)}</i>` : ''}
        <span class="lt-wax" aria-hidden="true"></span>
      </div>
      ${v.reward ? `<div class="lt-reward">${esc(v.reward)}</div>` : ''}`;
    replay(e, 'on');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), life * 1000);
  }

  hide() {
    if (!this.isOpen) return;
    clearTimeout(this.timer);
    this.el.classList.remove('on');
    this.onClose();
    const next = this.queue.shift();
    if (next) this.timer = window.setTimeout(() => this.show(next[0], next[1]), 450);
  }

  clear() {
    this.queue.length = 0;
    clearTimeout(this.timer);
    this.el.classList.remove('on');
  }
}
