import { I18n, t, type Key } from '../i18n/i18n';
import { asset } from '../assetUrl';
import { GameState, type Avatar } from '../state/GameState';
import { Settings } from '../state/Settings';
import { Sound } from '../audio/Sound';

/** Who can speak in a mini-game's quick reactions: the trio, the guardians, the enzymes. */
export type Who = Avatar | 'tooth' | 'stomach' | 'intestine' | 'pepsin' | 'amylase' | 'lipase' | 'bile';
export type Mood = 'happy' | 'surprised' | 'thinking' | 'cheering';

/** A step card: its picture and its name (a phrasebook key). */
export interface HudCard {
  img: string;
  label: Key;
}

/** The enzymes have one portrait each (no moods). */
const ONE_FACE = new Set<Who>(['pepsin', 'amylase', 'lipase', 'bile']);
const NAME_OF = (who: Who) => (who === 'walid' || who === 'nesma' || who === 'fox' ? GameState.nameOf(who) : t(`name.${who}` as Key));

/**
 * The interface every mini-game shares, over the game canvas (art: Dounia's
 * interface sheets): timer, score, pause, the step cards, the friends' quick
 * reactions, round cards with a countdown, short messages, and the results.
 * A mini-game adds its own pieces (MouthHud: the saliva meter; StomachHud: the
 * acidity gauge) through `extra` and `className`.
 */
export class MiniGameHud {
  protected readonly root: HTMLElement;
  protected readonly el: Record<string, HTMLElement> = {};
  private reactUntil = 0;
  private reactTimer = 0;
  /** the round being played (its banner): shown again on the pause card */
  private round?: { card: number; title: string; text: string };
  private readonly offLang: () => void;

  constructor(
    private readonly cards: readonly HudCard[],
    onPause: () => void,
    extra = '',
    className = '',
  ) {
    this.root = document.createElement('div');
    this.root.className = `mouth-hud ${className}`.trim();
    this.root.innerHTML = `
      <div class="mh-bar mh-timer"><img src="${asset('mouth/ui_timer.webp')}" alt="" /><span>0:00</span></div>
      <div class="mh-bar mh-score"><img src="${asset('mouth/ui_score.webp')}" alt="" /><span>0</span></div>
      <button type="button" class="mh-pause"><img src="${asset('mouth/ui_pause.webp')}" alt="" /></button>
      <ol class="mh-cards">
        ${cards.map((c, i) => `<li class="mh-card locked" data-i="${i}"><img src="${asset(c.img)}" alt="" /><span></span></li>`).join('')}
      </ol>
      ${extra}
      <div class="mh-react" aria-live="polite"><img alt="" /><div><b></b><p dir="auto"></p></div></div>
      <div class="mh-banner hidden"><div class="mh-banner-card"><img alt="" /><h2></h2><p dir="auto"></p><div class="mh-count"></div></div></div>`;
    document.getElementById('app')!.appendChild(this.root);
    for (const k of ['timer', 'score', 'pause', 'cards', 'react', 'banner'] as const) {
      this.el[k] = this.root.querySelector(`.mh-${k}`)!;
    }
    // taps on the interface must not reach the game (no strike through a button)
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button, .mh-banner, .mh-results')) e.stopPropagation();
    });
    this.el.pause.addEventListener('click', onPause);
    this.offLang = I18n.onChange(() => this.labels());
  }

  /** The interface's words, in the player's language (call once the subclass has its pieces). */
  protected labels(): void {
    this.el.cards.querySelectorAll<HTMLElement>('.mh-card span').forEach((s, i) => (s.textContent = t(this.cards[i].label)));
    this.el.cards.setAttribute('aria-label', t('mouth.aria.jobs'));
    this.el.pause.setAttribute('aria-label', t('mouth.aria.pause'));
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

  /** Keep the current reaction in sync when its scene changes language. */
  retextReaction(text: string): void {
    const who = this.el.react.dataset.who as Who | undefined;
    if (who) this.el.react.querySelector('b')!.textContent = NAME_OF(who);
    this.el.react.querySelector('p')!.textContent = text;
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

  /** A friend (or a guardian, or an enzyme) says something short, without stopping the game. */
  react(who: Who, mood: Mood, text: string, ms = 2200): boolean {
    const now = performance.now();
    if (now < this.reactUntil - ms * 0.35) return false; // let the last one be read first
    const r = this.el.react;
    r.querySelector('img')!.src = asset(`portraits/${who}_${ONE_FACE.has(who) ? 'happy' : mood}.webp`);
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
    this.round = { card, title, text }; // the pause card shows it again
    const b = this.el.banner;
    b.querySelector('img')!.src = asset(this.cards[card].img);
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

  /** The end: stars, the score and what you did (lines may hold <b> numbers). Resolves on Continue. */
  protected showResults(stars: number, score: number, lines: string[]): Promise<void> {
    return new Promise((resolve) => {
      const card = document.createElement('div');
      card.className = 'mh-results';
      const star = asset('mouth/ui_star.webp');
      card.innerHTML = `
        <div class="mh-results-card" role="dialog" aria-label="${t('mouth.res.title')}">
          <h2>${t('mouth.res.title')}</h2>
          <div class="mh-stars">${[0, 1, 2].map((i) => `<img src="${star}" alt="" class="${i < stars ? 'won' : ''}" style="--i:${i}" />`).join('')}</div>
          <p class="mh-total">${t('mouth.res.points', { n: `<b>${score}</b>` })}</p>
          <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
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
    const pct = (v: number) => Math.round(v * 100);
    card.innerHTML = `<div class="mh-results-card mh-pause-card"><h2>${t('mouth.paused')}</h2><p>${t('mouth.pausedText')}</p>
      ${this.round ? `<section class="mh-help"><h3>${t('help.title')}</h3><img src="${asset(this.cards[this.round.card].img)}" alt="" /><div><b>${this.round.title}</b><p>${this.round.text}</p></div></section>` : ''}
      <section class="mh-settings"><h3>${t('set.title')}</h3>
        <label><span>${t('set.music')}</span><input type="range" min="0" max="100" step="5" data-set="music" value="${pct(Settings.music)}" /></label>
        <label><span>${t('set.sfx')}</span><input type="range" min="0" max="100" step="5" data-set="sfx" value="${pct(Settings.sfx)}" /></label>
        <label class="mh-check"><input type="checkbox" data-set="reduceMotion"${Settings.reduceMotion ? ' checked' : ''} /><span>${t('set.motion')}</span></label>
      </section>
      <button type="button" class="avatar-continue mh-resume">${t('mouth.resume')}</button></div>`;
    this.root.appendChild(card);
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    card.addEventListener('keydown', (e) => e.stopPropagation()); // arrows move the sliders, not the game
    card.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) => r.addEventListener('input', () => {
      Settings.set({ [r.dataset.set!]: Number(r.value) / 100 });
      if (r.dataset.set === 'sfx') Sound.tone(600, 760, 0.07, 0.04);
    }));
    card.querySelector<HTMLInputElement>('[data-set=reduceMotion]')!.addEventListener('change', (e) => Settings.set({ reduceMotion: (e.target as HTMLInputElement).checked }));
    card.querySelector('.mh-resume')!.addEventListener('click', () => {
      card.remove();
      onResume();
    });
  }

  get paused(): boolean {
    return !!this.root.querySelector('.mh-paused');
  }

  dismissPause(): void { this.root.querySelector('.mh-paused')?.remove(); }

  destroy(): void {
    window.clearTimeout(this.reactTimer);
    this.offLang();
    this.root.remove();
  }
}

export const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
