import { asset } from '../assetUrl';
import { DEFAULT_NAMES, type Avatar } from '../state/GameState';

export interface Profile {
  avatar: Avatar;
  /** What the child typed; empty keeps the character's own name. */
  name: string;
}

const CARDS: { avatar: Avatar; img: string }[] = [
  { avatar: 'walid', img: 'avatars/boy.webp' },
  { avatar: 'nesma', img: 'avatars/girl.webp' },
  { avatar: 'fox', img: 'avatars/fox.webp' },
];
const MAX_NAME = 14;

/**
 * "Choose Your Avatar" (after Dounia's mock-up): three portrait cards, the player's
 * name, Continue. With `current`, it opens as the profile editor, filled in.
 * Resolves with the choice; in edit mode, null when closed without saving.
 */
export function chooseAvatar(current?: Profile): Promise<Profile | null> {
  return new Promise((resolve) => {
    const edit = !!current;
    let picked: Avatar | null = current?.avatar ?? null;
    const root = document.createElement('div');
    root.className = 'avatar-select';
    root.innerHTML = `
      <div class="avatar-panel" role="dialog" aria-labelledby="avatar-title">
        <h2 id="avatar-title" class="avatar-banner"><span aria-hidden="true">★</span> ${edit ? 'Your Avatar' : 'Choose Your Avatar'} <span aria-hidden="true">★</span></h2>
        ${edit ? '<button type="button" class="avatar-close" aria-label="Close">✕</button>' : ''}
        <div class="avatar-cards" role="radiogroup" aria-label="Avatar">
          ${CARDS.map(
            (c) => `
            <button type="button" class="avatar-card" role="radio" aria-checked="false" data-avatar="${c.avatar}" aria-label="${DEFAULT_NAMES[c.avatar]}">
              <img src="${asset(c.img)}" alt="" draggable="false" />
              <span class="avatar-check" aria-hidden="true">✓</span>
            </button>`,
          ).join('')}
        </div>
        <div class="avatar-foot">
        <p class="avatar-hint" dir="auto">Tap the one you want to be!</p>
        <div class="avatar-bottom">
          <label class="avatar-name">
            <span>Player name</span>
            <input type="text" maxlength="${MAX_NAME}" autocomplete="off" spellcheck="false" dir="auto" placeholder="Your name" />
          </label>
          <button type="button" class="avatar-continue" disabled>${edit ? 'SAVE' : 'CONTINUE'}</button>
        </div>
        </div>
      </div>`;
    document.getElementById('app')!.appendChild(root);

    const cards = [...root.querySelectorAll<HTMLButtonElement>('.avatar-card')];
    const bottom = root.querySelector<HTMLElement>('.avatar-bottom')!;
    const input = root.querySelector('input')!;
    const go = root.querySelector<HTMLButtonElement>('.avatar-continue')!;
    input.value = current?.name ?? '';

    const show = () => {
      for (const c of cards) {
        const on = c.dataset.avatar === picked;
        c.classList.toggle('picked', on);
        c.setAttribute('aria-checked', String(on));
      }
      go.disabled = !picked;
      // the name box (and Continue) appear once a character is picked
      bottom.classList.toggle('shown', !!picked);
      root.querySelector('.avatar-hint')!.classList.toggle('gone', !!picked);
      // the name box suggests the picked character's own name
      input.placeholder = picked ? `Your name (or ${DEFAULT_NAMES[picked]})` : 'Your name';
    };
    show();

    const close = (result: Profile | null) => {
      root.classList.add('closing');
      window.setTimeout(() => root.remove(), 300);
      resolve(result);
    };
    for (const c of cards) {
      c.addEventListener('click', () => {
        const first = !picked;
        picked = c.dataset.avatar as Avatar;
        show();
        // ready to type on a computer; on touch screens the keyboard waits for a tap on the box
        if (first && window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
      });
    }
    go.addEventListener('click', () => {
      if (!picked) return;
      // letters, spaces and dashes only (any alphabet, so Arabic names work too)
      const name = input.value.replace(/[^\p{L}\p{M} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
      close({ avatar: picked, name });
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing must not walk the trio or advance dialogue
      if (e.key === 'Enter') go.click();
    });
    root.querySelector('.avatar-close')?.addEventListener('click', () => close(null));
    // taps on the panel must not reach the game underneath
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('keydown', (e) => e.stopPropagation());
  });
}
