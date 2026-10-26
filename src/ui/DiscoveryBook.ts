import { asset } from '../assetUrl';
import { I18n, t } from '../i18n/i18n';
import { GameState, PLACE_ORDER } from '../state/GameState';
import { BOOK, BOOK_NOTES, COMING, JOURNEY, discoveryText } from '../state/discoveries';

/**
 * Nesma's Discovery Book: the Journey (where the child has got to, each mission's best stars, the
 * kingdoms still to come) and one page per part of the kingdom with every note found so far; the
 * missing ones show as shadows, with a hint of where to look. Resolves when it is closed.
 */
export function openBook(onReplay: (at: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'book';
    document.getElementById('app')!.appendChild(el);
    document.body.classList.add('book-open'); // the profile badge and the book button step aside
    let page = 'journey';
    const idx = (p: string) => (PLACE_ORDER as readonly string[]).indexOf(p);
    const has = (id: string) => GameState.discoveries.includes(id);
    const img = (path: string, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${asset(path)}" alt="" draggable="false" />`;
    const stars = (n: number) => `<span class="book-stars" aria-label="${t('book.stars', { n })}">${[0, 1, 2].map((i) => img('mouth/ui_star.webp', i < n ? 'won' : '')).join('')}</span>`;

    const journey = () => {
      const far = idx(GameState.furthest);
      const rows = JOURNEY.map((s, i) => {
        const done = far > idx(s.to);
        const here = !done && (far >= idx(s.from) || (i === 0 && far < 0));
        const best = s.result ? GameState.result(s.result) : undefined;
        const state = done ? 'done' : here ? 'here' : 'locked';
        return `<li class="book-stop ${state}">
          <b class="book-dot" aria-hidden="true">${done ? '✓' : here ? '' : '🔒'}</b>
          <span class="book-stop-name">${t(s.title)}<small>${t(`book.state.${state}`)}</small></span>
          ${best ? stars(best.stars) : ''}
          ${done ? `<button type="button" class="book-replay" data-at="${s.from}">${t('book.replay')}</button>` : ''}
        </li>`;
      }).join('');
      const found = BOOK_NOTES.filter(has).length;
      const crown = has('kingdom_complete');
      return `<div class="book-journey">
        <section><h3>${t('book.kingdom.digestion')}</h3><ol class="book-route">${rows}</ol></section>
        <section class="book-side">
          <div class="book-total"><b>${found} / ${BOOK_NOTES.length}</b><span>${t('book.notesFound')}</span>
            <i class="book-bar"><i style="width:${Math.round((100 * found) / BOOK_NOTES.length)}%"></i></i></div>
          <div class="book-crown${crown ? ' won' : ''}">${img('mouth/ui_star.webp')}<span>${t(crown ? 'book.crown' : 'book.crownSoon')}</span></div>
          <h3>${t('book.coming')}</h3>
          <div class="book-coming">${COMING.map((k) => `<figure>${img(k.art)}<figcaption>${t(k.title)}<small>${t('book.soon')}</small></figcaption></figure>`).join('')}</div>
        </section>
      </div>`;
    };

    const notes = (id: string) => {
      const p = BOOK.find((b) => b.id === id)!;
      return `<div class="book-notes">${p.notes.map((n) => has(n.id)
        ? `<article class="book-note">${img(n.art)}<p>${discoveryText(n.id)}</p></article>`
        : `<article class="book-note missing">${img(n.art)}<b aria-hidden="true">?</b><p>${t(n.where)}</p></article>`).join('')}</div>`;
    };

    const draw = () => {
      el.dir = I18n.rtl ? 'rtl' : 'ltr';
      const tabs = [{ id: 'journey', label: t('book.journey'), count: '' }, ...BOOK.map((p) => ({
        id: p.id, label: t(p.title), count: `${p.notes.filter((n) => has(n.id)).length}/${p.notes.length}`,
      }))];
      el.innerHTML = `<div class="book-card" role="dialog" aria-modal="true" aria-label="${t('book.title')}">
        <header>${img('portraits/nesma_happy.webp', 'book-keeper')}<div><h2>${t('book.title')}</h2><p>${t('book.keptBy', { name: GameState.nameOf('nesma') })}</p></div>
          <button type="button" class="book-close" data-act="close" aria-label="${t('review.close')}">×</button></header>
        <nav class="book-tabs" role="tablist">${tabs.map((b) => `<button type="button" role="tab" data-page="${b.id}" aria-selected="${b.id === page}">${b.label}${b.count ? `<small>${b.count}</small>` : ''}</button>`).join('')}</nav>
        <div class="book-page" role="tabpanel">${page === 'journey' ? journey() : notes(page)}</div>
      </div>`;
    };

    const close = () => {
      off();
      window.removeEventListener('keydown', onKey, true);
      el.remove();
      document.body.classList.remove('book-open');
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation(); // the world behind does not move while the book is open
      if (e.code === 'Escape') close();
    };
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (e.target === el || b?.dataset.act === 'close') return close();
      if (b?.dataset.page) { page = b.dataset.page; draw(); el.querySelector<HTMLButtonElement>(`[data-page="${page}"]`)?.focus(); }
      if (b?.dataset.at) { const at = b.dataset.at; close(); onReplay(at); }
    });
    window.addEventListener('keydown', onKey, true);
    const off = I18n.onChange(draw);
    draw();
    el.querySelector<HTMLButtonElement>('.book-close')?.focus();
  });
}
