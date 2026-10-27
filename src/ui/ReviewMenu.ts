import { I18n, t, type Key } from '../i18n/i18n';

/**
 * The team's review menu (opened with ?review in the address): jump straight to any road or
 * mini-game. Pupils never see it. A small tab on the left edge brings it back during the game.
 */
export interface ReviewStop { group: Key; label: Key; at: string }

export class ReviewMenu {
  private readonly el: HTMLElement;
  private readonly tab: HTMLButtonElement;
  private ready = false;

  constructor(private readonly stops: readonly ReviewStop[], private readonly onPick: (at: string) => void, private readonly onBeginning: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'review';
    this.el.hidden = true;
    this.tab = document.createElement('button');
    this.tab.type = 'button';
    this.tab.className = 'review-tab';
    this.tab.hidden = true;
    this.tab.textContent = '☰';
    const app = document.getElementById('app')!;
    app.append(this.el, this.tab);
    for (const n of [this.el, this.tab]) n.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.tab.addEventListener('click', (e) => { e.stopPropagation(); this.open(); });
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === this.el) return this.close(); // a tap outside the panel
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      if (b.dataset.at) { this.close(); this.showTab(); this.onPick(b.dataset.at); }
      else if (b.dataset.act === 'start') { this.close(); this.onBeginning(); }
      else if (b.dataset.act === 'close') this.close();
    });
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !this.el.hidden) { e.stopPropagation(); this.close(); } }, true);
    I18n.onChange(() => this.draw());
    this.draw();
  }

  /** The game has loaded: the places can be chosen. */
  setReady(): void {
    this.ready = true;
    this.draw();
  }

  /** In the game: the tab that brings the menu back. */
  showTab(): void {
    this.tab.hidden = false;
  }

  open(): void {
    this.draw();
    this.el.hidden = false;
  }

  /** Closed (×, Escape or a tap outside): the tab on the left edge brings it back. */
  close(): void {
    this.el.hidden = true;
    this.showTab();
  }

  private draw(): void {
    const groups = [...new Set(this.stops.map((s) => s.group))];
    this.el.dir = I18n.rtl ? 'rtl' : 'ltr';
    this.tab.setAttribute('aria-label', t('review.open'));
    this.el.innerHTML = `<div class="review-card" role="dialog" aria-label="${t('review.title')}">
      <button type="button" class="review-close" data-act="close" aria-label="${t('review.close')}">×</button>
      <h2>${t('review.title')}</h2>
      <p>${t(this.ready ? 'review.note' : 'review.loading')}</p>
      <div class="review-groups">${groups.map((g) => `<section><h3>${t(g)}</h3>${this.stops.filter((s) => s.group === g)
        .map((s) => `<button type="button" data-at="${s.at}"${this.ready ? '' : ' disabled'}>${t(s.label)}</button>`).join('')}</section>`).join('')}</div>
      <button type="button" class="review-start" data-act="start">${t('review.start')}</button>
    </div>`;
  }
}
