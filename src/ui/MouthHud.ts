import { t, type Key } from '../i18n/i18n';
import { asset } from '../assetUrl';
import { MiniGameHud, type HudCard } from './MiniGameHud';

export type { Mood, Who } from './MiniGameHud';

/** The three jobs of the mouth, in the order the rounds introduce them (Dounia's step cards). */
export const CARDS: readonly HudCard[] = [
  { img: 'mouth/ui_card_chew.webp', label: 'mouth.card.chew' },
  { img: 'mouth/ui_card_mix.webp', label: 'mouth.card.mix' },
  { img: 'mouth/ui_card_moisten.webp', label: 'mouth.card.moisten' },
];

export interface Results {
  stars: number;
  score: number;
  chewed: number;
  bestCombo: number;
  bites: number;
  maltose: number;
}

/** The Mouth mini-game's interface: the shared one, plus the saliva meter and spray. */
export class MouthHud extends MiniGameHud {
  private digestStep: 'bread' | 'select' | 'cut' | 'done' | null = null;
  private digestProgress = 0;
  private digestTotal = 0;
  private digestHint: Key | null = null;

  constructor(onPause: () => void, onSpray: () => void, onAmylase: () => void) {
    super(
      CARDS,
      onPause,
      `<div class="mh-saliva hidden">
        <img src="${asset('mouth/ui_saliva_empty.webp')}" alt="" />
        <div class="mh-water"></div>
      </div>
      <button type="button" class="mh-spray hidden"><img src="${asset('mouth/ui_spray.webp')}" alt="" /></button>
      <section class="mh-digest" hidden aria-live="polite">
        <h3></h3><p dir="auto"></p><strong dir="auto"></strong>
      </section>
      <button type="button" class="mh-amylase" hidden aria-pressed="false">
        <img src="${asset('mouth/amylase-scissors.webp')}" alt="" /><span dir="auto"></span>
      </button>`,
    );
    for (const k of ['saliva', 'water', 'spray', 'digest', 'amylase'] as const) this.el[k] = this.root.querySelector(`.mh-${k}`)!;
    this.labels();
    this.el.spray.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onSpray();
    });
    this.el.amylase.addEventListener('click', onAmylase);
  }

  protected labels(): void {
    super.labels();
    if (!this.el.saliva) return;
    this.el.saliva.setAttribute('aria-label', t('mouth.aria.saliva'));
    this.el.spray.setAttribute('aria-label', t('mouth.aria.spray'));
    this.el.amylase.querySelector('span')!.textContent = t('mouth.digest.scissors');
    this.el.amylase.setAttribute('aria-label', t('mouth.digest.scissors'));
    if (this.digestStep) {
      this.el.timer.querySelector('span')!.textContent = t('mouth.digest.timer');
      this.el.digest.querySelector('h3')!.textContent = t('mouth.digest.title');
      this.el.digest.querySelector('p')!.textContent = t(this.digestHint ?? `mouth.digest.${this.digestStep}`, { total: this.digestTotal });
      this.el.digest.querySelector('strong')!.textContent = t(this.digestStep === 'bread' ? 'mouth.digest.breads' : 'mouth.digest.progress', { n: this.digestProgress, total: this.digestTotal });
    }
  }

  /** The untimed, required objective within mission 3. */
  showDigest(step: 'bread' | 'select' | 'cut' | 'done', progress: number, total: number): void {
    this.digestStep = step;
    this.digestProgress = progress;
    this.digestTotal = total;
    this.digestHint = null;
    this.root.classList.add('is-digesting');
    this.el.timer.classList.remove('hurry');
    this.el.digest.hidden = false;
    this.el.amylase.hidden = step === 'bread';
    this.el.amylase.setAttribute('aria-pressed', String(step === 'cut' || step === 'done'));
    (this.el.amylase as HTMLButtonElement).disabled = step === 'done';
    this.labels();
  }

  hintDigest(key: Key): void {
    this.digestHint = key;
    this.labels();
  }

  hideDigest(): void {
    this.digestStep = null;
    this.root.classList.remove('is-digesting');
    this.el.digest.hidden = true;
    this.el.amylase.hidden = true;
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
