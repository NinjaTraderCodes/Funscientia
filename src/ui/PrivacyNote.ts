import { I18n, t, type Key } from '../i18n/i18n';

/**
 * The privacy note (the same as backend/PRIVACY.md, in the player's language): what the game saves,
 * what it never saves, where, who can see it and for how long. Opened from the start page.
 */
const PARTS: readonly [Key, Key][] = [
  ['privacy.savedT', 'privacy.saved'],
  ['privacy.neverT', 'privacy.never'],
  ['privacy.whereT', 'privacy.where'],
  ['privacy.whoT', 'privacy.who'],
  ['privacy.howLongT', 'privacy.howLong'],
];

export function showPrivacy(): Promise<void> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'code-panel privacy-panel';
    const draw = () => {
      root.dir = I18n.rtl ? 'rtl' : 'ltr';
      root.innerHTML = `<div class="code-card privacy-card" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <h2 id="privacy-title">${t('privacy.title')}</h2>
        <p class="privacy-intro">${t('privacy.intro')}</p>
        <dl>${PARTS.map(([title, text]) => `<dt>${t(title)}</dt><dd>${t(text)}</dd>`).join('')}</dl>
        <button type="button" class="avatar-continue privacy-close">${t('review.close')}</button>
      </div>`;
      root.querySelector<HTMLButtonElement>('.privacy-close')?.focus({ preventScroll: true });
    };
    const close = () => {
      off();
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === root || (e.target as HTMLElement).closest('.privacy-close')) close();
    });
    window.addEventListener('keydown', onKey, true);
    const off = I18n.onChange(draw);
    document.getElementById('app')!.appendChild(root);
    draw();
  });
}
