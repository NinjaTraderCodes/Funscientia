import { t } from '../i18n/i18n';
import { asset } from '../assetUrl';
import { MiniGameHud, type HudCard } from './MiniGameHud';

export type { Mood, Who } from './MiniGameHud';

/** The three jobs of the mouth, in the order the rounds introduce them (Dounia's step cards). */
export const CARDS: readonly HudCard[] = [
  { img: 'mouth/ui_card_chew.webp', label: 'mouth.card.chew' },
  { img: 'mouth/ui_card_mix.webp', label: 'mouth.card.mix' },
  { img: 'mouth/ui_card_moisten.webp', label: 'mouth.card.moisten' },
  { img: 'mouth/ui_card_digest.webp', label: 'mouth.card.digest' },
];

export interface Results {
  stars: number;
  score: number;
  chewed: number;
  bestCombo: number;
  bites: number;
  maltose: number;
}

/** The Mouth mini-game's interface: the shared one, plus the saliva meter and spray, and (round 4) amylase's scissors. */
export class MouthHud extends MiniGameHud {
  constructor(onPause: () => void, onSpray: () => void, onAmylase: () => void) {
    super(
      CARDS,
      onPause,
      `<div class="mh-saliva hidden">
        <img src="${asset('mouth/ui_saliva_empty.webp')}" alt="" />
        <div class="mh-water"></div>
      </div>
      <button type="button" class="mh-spray hidden"><img src="${asset('mouth/ui_spray.webp')}" alt="" /></button>
      <button type="button" class="mh-amylase hidden"><img src="${asset('mouth/amylase_scissors.webp')}" alt="" /></button>`,
    );
    for (const k of ['saliva', 'water', 'spray', 'amylase'] as const) this.el[k] = this.root.querySelector(`.mh-${k}`)!;
    this.labels();
    this.el.spray.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onSpray();
    });
    this.el.amylase.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onAmylase();
    });
  }

  protected labels(): void {
    super.labels();
    if (!this.el.saliva) return;
    this.el.saliva.setAttribute('aria-label', t('mouth.aria.saliva'));
    this.el.spray.setAttribute('aria-label', t('mouth.aria.spray'));
    this.el.amylase.setAttribute('aria-label', t('mouth.aria.amylase'));
  }

  /** Round 4: salivary amylase's scissors - shown, in hand (taken), and glowing when there is starch to cut. */
  showAmylase(on: boolean, taken: boolean, wanted = false): void {
    this.el.amylase.classList.toggle('hidden', !on);
    this.el.amylase.classList.toggle('taken', taken);
    this.el.amylase.classList.toggle('glow', on && !taken && wanted);
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

  /** The end: stars and what you did. Resolves on Continue. */
  results(r: Results): Promise<void> {
    return this.showResults(r.stars, r.score, [
      t('mouth.res.chewed', { n: `<b>${r.chewed}</b>` }),
      t('mouth.res.streak', { n: `<b>×${r.bestCombo}</b>` }),
      t('mouth.res.maltose', { n: `<b>${r.maltose}</b>` }),
      t(r.bites === 1 ? 'mouth.res.bite' : 'mouth.res.bites', { n: `<b>${r.bites}</b>` }),
    ]);
  }
}
