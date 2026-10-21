import type { DialogueView, Hero, Line, Speaker } from '../dialogue/DialogueRunner';
import { asset } from '../assetUrl';
import { Sound } from '../audio/Sound';
import { GameState, type Avatar } from '../state/GameState';

/** Name tags: the trio's come from the player's profile (their typed name replaces their avatar's). */
const nameOf = (who: Hero | 'fox' | 'tooth') => (who === 'tooth' ? 'Tooth Guardian' : GameState.nameOf(who));
const SPEAKERS = ['walid', 'nesma', 'fox', 'tooth'] as const;
/** Names inside a line: [walid], [nesma], [fox] and [player] (whoever the child plays). */
const fillNames = (text: string) =>
  text.replace(/\[(walid|nesma|fox|player)\]/g, (_, w: string) => GameState.nameOf(w === 'player' ? (GameState.hero ?? 'walid') : (w as Avatar)));

const CHARS_PER_SEC = 45;
/** Portrait files known not to exist yet (mood variants still being made). */
const MISSING = new Set<string>();

/**
 * Bottom-of-screen dialogue panel, styled after Dounia's mockup: portrait in a
 * gold ring, a name ribbon, typewriter text, tap/Space/Enter to continue.
 * `dir="auto"` lets Arabic lines run right-to-left on their own.
 */
export class DialogueBox implements DialogueView {
  private readonly root: HTMLElement;
  private readonly portrait: HTMLImageElement;
  private readonly name: HTMLElement;
  private readonly text: HTMLElement;
  private readonly choices: HTMLElement;
  private readonly more: HTMLElement;
  private advance: (() => void) | null = null;

  constructor(private readonly hero: Hero) {
    this.root = document.createElement('div');
    this.root.className = 'dialogue';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="dlg-panel" role="dialog" aria-live="polite">
        <div class="dlg-portrait"><img alt="" /></div>
        <div class="dlg-body">
          <div class="dlg-name"></div>
          <p class="dlg-text" dir="auto"></p>
          <div class="dlg-choices"></div>
        </div>
        <span class="dlg-more" aria-hidden="true">▼</span>
      </div>`;
    document.getElementById('app')!.appendChild(this.root);
    // warm the cache so the first line of each speaker shows its face at once
    for (const w of SPEAKERS) new Image().src = asset(`portraits/${w}_happy.webp`);
    this.portrait = this.root.querySelector('.dlg-portrait img')!;
    this.name = this.root.querySelector('.dlg-name')!;
    this.text = this.root.querySelector('.dlg-text')!;
    this.choices = this.root.querySelector('.dlg-choices')!;
    this.more = this.root.querySelector('.dlg-more')!;
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.stopPropagation();
      this.advance?.();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.root.hidden && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.advance?.();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  private who(speaker: Speaker): Hero | 'fox' | 'tooth' {
    if (speaker === 'leader') return this.hero;
    if (speaker === 'buddy') return this.hero === 'walid' ? 'nesma' : 'walid';
    if (speaker === 'walid' || speaker === 'nesma') return speaker;
    return speaker;
  }

  async showLine(line: Line): Promise<void> {
    const who = this.who(line.speaker);
    this.root.hidden = false;
    this.root.dataset.speaker = who;
    this.choices.replaceChildren();
    this.name.textContent = nameOf(who);
    this.setPortrait(who, line.mood);
    if (line.sfx) Sound.sample(line.sfx);

    // typewriter; the first tap completes the line, the second continues
    this.more.hidden = true;
    let shown = 0;
    let done = false;
    const full = fillNames(line.text);
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = () => {
        if (done) return;
        shown = Math.min(full.length, Math.floor(((performance.now() - start) / 1000) * CHARS_PER_SEC));
        this.text.textContent = full.slice(0, shown);
        if (shown >= full.length) return finish();
        requestAnimationFrame(tick);
      };
      const finish = () => {
        done = true;
        this.text.textContent = full;
        this.more.hidden = false;
        this.advance = () => {
          this.advance = null;
          resolve();
        };
      };
      this.advance = finish;
      requestAnimationFrame(tick);
    });
  }

  /**
   * Swap the portrait only once the new image is decoded (no blank circle), and
   * remember missing mood variants so they fall back to "happy" immediately.
   */
  private setPortrait(who: string, mood: string): void {
    const url = (m: string) => asset(`portraits/${who}_${m}.webp`);
    const want = MISSING.has(url(mood)) ? url('happy') : url(mood);
    if (this.portrait.src.endsWith(want)) return;
    const img = new Image();
    img.onload = () => {
      if (this.root.dataset.speaker === who) this.portrait.src = want;
    };
    img.onerror = () => {
      MISSING.add(want);
      if (mood !== 'happy') this.setPortrait(who, 'happy');
    };
    img.src = want;
  }

  showChoices(choices: string[]): Promise<number> {
    this.more.hidden = true;
    this.advance = null;
    return new Promise((resolve) => {
      this.choices.replaceChildren(
        ...choices.map((c, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'dlg-choice';
          b.dir = 'auto';
          b.textContent = c;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            this.choices.replaceChildren();
            resolve(i);
          });
          return b;
        }),
      );
      (this.choices.firstElementChild as HTMLButtonElement | null)?.focus();
    });
  }

  /** Remove the box from the page (one-off conversations). */
  destroy(): void {
    this.close();
    this.root.remove();
  }

  close(): void {
    this.root.hidden = true;
    this.advance = null;
  }
}
