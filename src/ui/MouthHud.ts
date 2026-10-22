import { I18n, t } from '../i18n/i18n';
import { asset } from '../assetUrl';
import { GameState, type Avatar } from '../state/GameState';

export type Who = Avatar | 'tooth';
export type Mood = 'happy' | 'surprised' | 'thinking' | 'cheering';

/** The three jobs of the mouth, in the order the rounds introduce them (Dounia's step cards). */
export const CARDS = [
  { img: 'mouth/ui_card_chew.webp', label: 'mouth.card.chew' },
  { img: 'mouth/ui_card_mix.webp', label: 'mouth.card.mix' },
  { img: 'mouth/ui_card_moisten.webp', label: 'mouth.card.moisten' },
] as const;

export interface Results {
  stars: number;
  score: number;
  chewed: number;
  bestCombo: number;
  bites: number;
  sweets: number;
}

const NAME_OF = (who: Who) => (who === 'tooth' ? t('name.tooth') : GameState.nameOf(who));

/**
 * The Mouth mini-game's interface, over the game canvas: timer, score, pause,
 * the three step cards, the saliva meter and spray, the friends' reactions,
 * round cards with a countdown, and the results. Art: Dounia's interface sheet.
 */
export class MouthHud {
  private readonly root: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private reactUntil = 0;
  private reactTimer = 0;
  private readonly offLang: () => void;

  constructor(onPause: () => void, onSpray: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'mouth-hud';
    this.root.innerHTML = `
      <div class="mh-bar mh-timer"><img src="${asset('mouth/ui_timer.webp')}" alt="" /><span>0:00</span></div>
      <div class="mh-bar mh-score"><img src="${asset('mouth/ui_score.webp')}" alt="" /><span>0</span></div>
      <button type="button" class="mh-pause"><img src="${asset('mouth/ui_pause.webp')}" alt="" /></button>
      <ol class="mh-cards">
        ${CARDS.map((c, i) => `<li class="mh-card locked" data-i="${i}"><img src="${asset(c.img)}" alt="" /><span></span></li>`).join('')}
      </ol>
      <div class="mh-saliva hidden">
        <img src="${asset('mouth/ui_saliva_empty.webp')}" alt="" />
        <div class="mh-water"></div>
      </div>
      <button type="button" class="mh-spray hidden"><img src="${asset('mouth/ui_spray.webp')}" alt="" /></button>
      <div class="mh-react" aria-live="polite"><img alt="" /><div><b></b><p dir="auto"></p></div></div>
      <div class="mh-banner hidden"><div class="mh-banner-card"><img alt="" /><h2></h2><p dir="auto"></p><div class="mh-count"></div></div></div>`;
    document.getElementById('app')!.appendChild(this.root);
    for (const k of ['timer', 'score', 'pause', 'cards', 'saliva', 'water', 'spray', 'react', 'banner'] as const) {
      this.el[k] = this.root.querySelector(`.mh-${k}`)!;
    }
    // taps on the interface must not reach the game (no hammer strike through a button)
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button, .mh-banner, .mh-results')) e.stopPropagation();
    });
    this.labels();
    this.offLang = I18n.onChange(() => this.labels());
    this.el.pause.addEventListener('click', onPause);
    this.el.spray.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onSpray();
    });
  }

  /** The interface's words, in the player's language. */
  private labels(): void {
    this.el.cards.querySelectorAll<HTMLElement>('.mh-card span').forEach((s, i) => (s.textContent = t(CARDS[i].label)));
    this.el.cards.setAttribute('aria-label', t('mouth.aria.jobs'));
    this.el.pause.setAttribute('aria-label', t('mouth.aria.pause'));
    this.el.saliva.setAttribute('aria-label', t('mouth.aria.saliva'));
    this.el.spray.setAttribute('aria-label', t('mouth.aria.spray'));
  }

  setTime(seconds: number): void {
    const s = Math.max(0, Math.ceil(seconds));
    this.el.timer.querySelector('span')!.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.timer.classList.toggle('hurry', s <= 5 && s > 0);
  }

  setScore(n: number): void {
    const span = this.el.score.querySelector('span')!;
    span.textContent = String(n);
    span.classList.remove('bump');
    void span.offsetWidth; // restart the little bump
    span.classList.add('bump');
  }

  /** Which job is being done: earlier cards are done, later ones still locked. */
  setRound(i: number): void {
    this.el.cards.querySelectorAll<HTMLElement>('.mh-card').forEach((c) => {
      const k = Number(c.dataset.i);
      c.classList.toggle('done', k < i);
      c.classList.toggle('active', k === i);
      c.classList.toggle('locked', k > i);
    });
  }

  showSaliva(on: boolean): void {
    this.el.saliva.classList.toggle('hidden', !on);
    this.el.spray.classList.toggle('hidden', !on);
  }

  setSaliva(level: number, glow: boolean): void {
    // the channel runs from 22.1% to 97.2% of the bar's width (pack_mouth.py: saliva from/to)
    this.el.water.style.width = `${(Math.max(0, Math.min(100, level)) * 0.751).toFixed(2)}%`;
    this.el.saliva.classList.toggle('low', level < 30);
    this.el.spray.classList.toggle('glow', glow);
  }

  /** A friend (or the Guardian) says something short, without stopping the game. */
  react(who: Who, mood: Mood, text: string, ms = 2200): boolean {
    const now = performance.now();
    if (now < this.reactUntil - ms * 0.35) return false; // let the last one be read first
    const r = this.el.react;
    r.querySelector('img')!.src = asset(`portraits/${who}_${mood}.webp`);
    r.querySelector('b')!.textContent = NAME_OF(who);
    r.querySelector('p')!.textContent = text;
    r.dataset.who = who;
    r.classList.add('show');
    this.reactUntil = now + ms;
    window.clearTimeout(this.reactTimer);
    this.reactTimer = window.setTimeout(() => r.classList.remove('show'), ms);
    return true;
  }

  /** A round's card: big, with what to do, then a 3-2-1 countdown. Resolves on "go". */
  async banner(card: number, title: string, text: string, countdown = true): Promise<void> {
    const b = this.el.banner;
    b.querySelector('img')!.src = asset(CARDS[card].img);
    b.querySelector('h2')!.textContent = title;
    b.querySelector('p')!.textContent = text;
    const count = b.querySelector<HTMLElement>('.mh-count')!;
    count.textContent = '';
    b.classList.remove('hidden');
    await wait(2600 + text.length * 35); // time to read
    if (countdown) {
      for (const n of ['3', '2', '1', '']) {
        count.textContent = n || t('mouth.go');
        count.classList.remove('pop');
        void count.offsetWidth;
        count.classList.add('pop');
        await wait(n ? 700 : 500);
      }
    }
    b.classList.add('hidden');
  }

  /** A short centre message (e.g. "Swallow!"), no countdown. */
  async say(title: string, text: string, ms = 2200): Promise<void> {
    const b = this.el.banner;
    b.querySelector('img')!.removeAttribute('src');
    b.querySelector('h2')!.textContent = title;
    b.querySelector('p')!.textContent = text;
    b.querySelector('.mh-count')!.textContent = '';
    b.classList.add('plain');
    b.classList.remove('hidden');
    await wait(ms);
    b.classList.add('hidden');
    b.classList.remove('plain');
  }

  /** The end: stars and what you did. Resolves on Continue. */
  results(r: Results): Promise<void> {
    return new Promise((resolve) => {
      const card = document.createElement('div');
      card.className = 'mh-results';
      const star = asset('mouth/ui_star.webp');
      card.innerHTML = `
        <div class="mh-results-card" role="dialog" aria-label="${t('mouth.res.title')}">
          <h2>${t('mouth.res.title')}</h2>
          <div class="mh-stars">${[0, 1, 2].map((i) => `<img src="${star}" alt="" class="${i < r.stars ? 'won' : ''}" style="--i:${i}" />`).join('')}</div>
          <p class="mh-total">${t('mouth.res.points', { n: `<b>${r.score}</b>` })}</p>
          <ul>
            <li>${t('mouth.res.chewed', { n: `<b>${r.chewed}</b>` })}</li>
            <li>${t('mouth.res.streak', { n: `<b>×${r.bestCombo}</b>` })}</li>
            <li>${t('mouth.res.sweets', { n: `<b>${r.sweets}</b>` })}</li>
            <li>${t(r.bites === 1 ? 'mouth.res.bite' : 'mouth.res.bites', { n: `<b>${r.bites}</b>` })}</li>
          </ul>
          <button type="button" class="avatar-continue">${t('avatar.continue')}</button>
        </div>`;
      this.root.appendChild(card);
      card.addEventListener('pointerdown', (e) => e.stopPropagation());
      card.querySelector('button')!.addEventListener('click', () => {
        card.classList.add('closing');
        window.setTimeout(() => card.remove(), 300);
        resolve();
      });
    });
  }

  /** Paused: a card with Resume. */
  pauseCard(onResume: () => void): void {
    const card = document.createElement('div');
    card.className = 'mh-results mh-paused';
    card.innerHTML = `<div class="mh-results-card"><h2>${t('mouth.paused')}</h2><p>${t('mouth.pausedText')}</p><button type="button" class="avatar-continue">${t('mouth.resume')}</button></div>`;
    this.root.appendChild(card);
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    card.querySelector('button')!.addEventListener('click', () => {
      card.remove();
      onResume();
    });
  }

  get paused(): boolean {
    return !!this.root.querySelector('.mh-paused');
  }

  destroy(): void {
    window.clearTimeout(this.reactTimer);
    this.offLang();
    this.root.remove();
  }
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
