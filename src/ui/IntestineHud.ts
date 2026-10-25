import { t } from '../i18n/i18n';
import { MiniGameHud, type HudCard } from './MiniGameHud';

/** The small intestine's four jobs, in the order the rounds introduce them. */
export const INTESTINE_CARDS: readonly HudCard[] = [
  { img: 'intestine/ui_card_fats.webp', label: 'si.card.fats' },
  { img: 'intestine/ui_card_proteins.webp', label: 'si.card.proteins' },
  { img: 'intestine/ui_card_carbs.webp', label: 'si.card.carbs' },
  { img: 'intestine/ui_card_absorb.webp', label: 'si.card.absorb' },
];

export interface IntestineResults {
  stars: number;
  score: number;
  fats: number;
  amino: number;
  glucose: number;
  absorbed: number;
  wrong: number;
}

/**
 * The Small Intestine mini-game's interface: the shared one, with the step cards
 * in a row at the bottom right (the rings at both sides are the way in and out).
 * The helpers themselves come from the openings in the picture, not from buttons.
 */
export class IntestineHud extends MiniGameHud {
  constructor(onPause: () => void) {
    super(INTESTINE_CARDS, onPause, '', 'intestine-hud');
    this.labels();
  }

  /** The helper in hand (for screen readers: the picture shows it as the cursor). */
  setTool(tool: string | null): void {
    this.root.dataset.tool = tool ?? '';
  }

  results(r: IntestineResults): Promise<void> {
    return this.showResults(r.stars, r.score, [
      t('si.res.fats', { n: `<b>${r.fats}</b>` }),
      t('si.res.amino', { n: `<b>${r.amino}</b>` }),
      t('si.res.glucose', { n: `<b>${r.glucose}</b>` }),
      t('si.res.absorbed', { n: `<b>${r.absorbed}</b>` }),
      t(r.wrong === 1 ? 'si.res.wrong1' : 'si.res.wrong', { n: `<b>${r.wrong}</b>` }),
    ]);
  }
}
