import { t } from '../i18n/i18n';
import type { OnlineData } from '../state/GameState';
import { Offline, OnlineSave, normalizeCode } from '../state/OnlineSave';

/**
 * "Continue with my code": the player types their save code; the panel looks it
 * up online. Resolves with the code and its progress, or null when cancelled.
 * The code saved on this device (if any) is filled in already.
 */
export function askCode(): Promise<{ code: string; data: OnlineData } | null> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'code-panel';
    root.innerHTML = `
      <form class="code-card" role="dialog" aria-labelledby="code-title" novalidate>
        <h2 id="code-title">${t('save.title')}</h2>
        <label for="code-input">${t('save.prompt')}</label>
        <input id="code-input" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false"
          maxlength="11" dir="ltr" placeholder="K7QM-4FXA" />
        <p class="code-msg" aria-live="polite"></p>
        <div class="code-buttons">
          <button type="button" class="btn-ghost code-cancel">${t('save.cancel')}</button>
          <button type="submit" class="avatar-continue code-go">${t('avatar.continue')}</button>
        </div>
      </form>`;
    document.getElementById('app')!.appendChild(root);
    const form = root.querySelector('form')!;
    const input = root.querySelector('input')!;
    const msg = root.querySelector<HTMLElement>('.code-msg')!;
    const go = root.querySelector<HTMLButtonElement>('.code-go')!;
    input.value = OnlineSave.code ?? '';
    input.focus({ preventScroll: true });
    input.addEventListener('input', () => {
      // shown as typed, in capitals, with the dash added
      const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      input.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
      msg.textContent = '';
    });

    const close = (result: { code: string; data: OnlineData } | null) => {
      root.classList.add('closing');
      window.setTimeout(() => root.remove(), 250);
      resolve(result);
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = normalizeCode(input.value);
      if (!code) {
        msg.textContent = t('save.badCode');
        return;
      }
      go.disabled = true;
      msg.textContent = t('save.looking');
      try {
        const data = await OnlineSave.load(code);
        if (data) return close({ code, data });
        msg.textContent = t('save.notFound');
      } catch (err) {
        msg.textContent = err instanceof Offline ? t('save.offline') : t('save.notFound');
      }
      go.disabled = false;
    });
    root.querySelector('.code-cancel')!.addEventListener('click', () => close(null));
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close(null);
    });
  });
}
