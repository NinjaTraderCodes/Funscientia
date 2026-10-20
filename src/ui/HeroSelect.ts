import type { Hero } from '../dialogue/DialogueRunner';
import { asset } from '../assetUrl';

/** "Who leads the way?" — two big portrait cards; resolves with the child's choice. */
export function chooseHero(): Promise<Hero> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'hero-select';
    root.innerHTML = `
      <div class="hero-card-wrap">
        <h2 dir="auto">Who leads the way?</h2>
        <div class="hero-options">
          <button type="button" class="hero-option" data-hero="walid">
            <img src="${asset('portraits/walid_happy.webp')}" alt="" />
            <span>Walid</span>
          </button>
          <button type="button" class="hero-option" data-hero="nesma">
            <img src="${asset('portraits/nesma_happy.webp')}" alt="" />
            <span>Nesma</span>
          </button>
        </div>
        <p dir="auto">Your friend and the little fennec will follow you!</p>
      </div>`;
    document.getElementById('app')!.appendChild(root);
    root.querySelectorAll<HTMLButtonElement>('.hero-option').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        root.classList.add('closing');
        window.setTimeout(() => root.remove(), 300);
        resolve(b.dataset.hero as Hero);
      }),
    );
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    // no auto-focus: nothing looks pre-selected; Tab still reaches both cards
  });
}
