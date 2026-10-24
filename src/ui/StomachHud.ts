import { I18n, t, type Key } from '../i18n/i18n';
import { asset } from '../assetUrl';
import { MiniGameHud, type HudCard } from './MiniGameHud';

/** The stomach's four jobs, in the order the rounds introduce them. */
export const STOMACH_CARDS: readonly HudCard[] = [
  { img: 'stomach/ui_card_churn.webp', label: 'stomach.card.churn' },
  { img: 'stomach/ui_card_acid.webp', label: 'stomach.card.acid' },
  { img: 'stomach/ui_card_pepsin.webp', label: 'stomach.card.pepsin' },
  { img: 'stomach/ui_card_chyme.webp', label: 'stomach.card.chyme' },
];

export interface StomachResults {
  stars: number;
  score: number;
  churned: number;
  zoneSeconds: number;
  germs: number;
  cuts: number;
  polypeptides: number;
  wrong: number;
}

/** pH shown for an acidity level (0 = neutral, pH 7 ... 1 = pH 1). */
export const phOf = (acidity: number) => 7 - 6 * Math.max(0, Math.min(1, acidity));

/**
 * The Stomach mini-game's interface: the shared one (step cards on the right,
 * the pylorus is on the left), plus the acidity gauge (Dounia's gauge, its
 * needle drawn here, the pepsin zone marked) and the acid flask to tap.
 */
export class StomachHud extends MiniGameHud {
  private pepsinActive = false;
  private proteins = 0;
  private proteinTotal = 0;
  private selected = false;
  private overtime = false;
  private hint: Key | null = null;

  constructor(onPause: () => void, onAcid: () => void, onPepsin: () => void, zone: [number, number]) {
    // the gauge's arc: the needle turns from -90deg (neutral, left) to +90deg (very acidic, right)
    const deg = (a: number) => -90 + 180 * a;
    super(
      STOMACH_CARDS,
      onPause,
      `<div class="sh-acid hidden">
        <div class="sh-gauge">
          <img src="${asset('stomach/gauge.webp')}" alt="" />
          <div class="sh-zone" style="--from:${deg(zone[0])}deg; --to:${deg(zone[1])}deg"></div>
          <div class="sh-needle"></div>
          <span class="sh-ph"></span>
        </div>
        <button type="button" class="sh-flask"><img src="${asset('stomach/flask.webp')}" alt="" /></button>
      </div>
      <section class="sh-task" hidden aria-live="polite">
        <h3></h3><p dir="auto"></p><strong dir="auto"></strong>
      </section>
      <button type="button" class="sh-pepsin" hidden aria-pressed="false">
        <img src="${asset('stomach/scissors.webp')}" alt="" /><span dir="auto"></span>
      </button>`,
      'stomach-hud',
    );
    for (const k of ['acid', 'needle', 'ph', 'flask', 'task', 'pepsin'] as const) this.el[k] = this.root.querySelector(`.sh-${k}`)!;
    this.labels();
    this.el.flask.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onAcid();
    });
    this.el.pepsin.addEventListener('click', onPepsin);
  }

  protected labels(): void {
    super.labels();
    if (!this.el.acid) return;
    this.el.acid.setAttribute('aria-label', t('stomach.aria.gauge'));
    this.el.flask.setAttribute('aria-label', t('stomach.aria.flask'));
    this.el.pepsin.setAttribute('aria-label', t('stomach.pepsin.scissors'));
    this.el.pepsin.querySelector('span')!.textContent = t('stomach.pepsin.scissors');
    if (this.pepsinActive) {
      const done = this.proteins === this.proteinTotal;
      this.el.task.querySelector('h3')!.textContent = t('stomach.pepsin.title');
      this.el.task.querySelector('p')!.textContent = t(this.hint ?? (done ? 'stomach.pepsin.done' : this.selected ? 'stomach.pepsin.cut' : 'stomach.pepsin.select'));
      this.el.task.querySelector('strong')!.textContent = t('stomach.pepsin.progress', { n: this.proteins, total: this.proteinTotal });
      if (this.overtime) this.el.timer.querySelector('span')!.textContent = t('stomach.pepsin.timer');
    }
  }

  showPepsin(proteins: number, total: number, selected: boolean, overtime: boolean): void {
    this.pepsinActive = true;
    this.proteins = proteins;
    this.proteinTotal = total;
    this.selected = selected;
    this.overtime = overtime;
    this.hint = null;
    this.root.classList.add('is-pepsin');
    this.el.task.hidden = false;
    this.el.pepsin.hidden = false;
    this.el.pepsin.setAttribute('aria-pressed', String(selected));
    (this.el.pepsin as HTMLButtonElement).disabled = proteins === total;
    if (overtime) this.el.timer.classList.remove('hurry');
    this.labels();
  }

  hintPepsin(key: Key): void {
    this.hint = key;
    this.labels();
  }

  hidePepsin(): void {
    this.pepsinActive = false;
    this.hint = null;
    this.root.classList.remove('is-pepsin');
    this.el.task.hidden = true;
    this.el.pepsin.hidden = true;
  }

  showAcid(on: boolean): void {
    this.el.acid.classList.toggle('hidden', !on);
  }

  /** The needle and the pH readout; `glow` asks for acid (flask pulses). */
  setAcidity(acidity: number, inZone: boolean, glow: boolean): void {
    const a = Math.max(0, Math.min(1, acidity));
    this.el.needle.style.transform = `rotate(${(-90 + 180 * a).toFixed(1)}deg)`;
    const ph = phOf(a).toFixed(1);
    this.el.ph.textContent = t('stomach.ph', { ph: I18n.lang === 'ar' ? ph.replace('.', ',') : ph });
    this.el.acid.classList.toggle('in-zone', inZone);
    this.el.flask.classList.toggle('glow', glow);
  }

  /** The flask gives a little shake when tapped. */
  pour(): void {
    const f = this.el.flask;
    f.classList.remove('pour');
    void f.offsetWidth;
    f.classList.add('pour');
  }

  results(r: StomachResults): Promise<void> {
    return this.showResults(r.stars, r.score, [
      t('stomach.res.churned', { n: `<b>${r.churned}</b>` }),
      t('stomach.res.zone', { n: `<b>${Math.round(r.zoneSeconds)}</b>` }),
      t('stomach.res.germs', { n: `<b>${r.germs}</b>` }),
      t('stomach.res.cuts', { n: `<b>${r.cuts}</b>` }),
      t('stomach.res.polypeptides', { n: `<b>${r.polypeptides}</b>` }),
      t(r.wrong === 1 ? 'stomach.res.wrong1' : 'stomach.res.wrong', { n: `<b>${r.wrong}</b>` }),
    ]);
  }
}
