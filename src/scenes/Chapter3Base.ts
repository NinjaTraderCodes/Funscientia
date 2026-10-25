import Phaser from 'phaser';
import { I18n } from '../i18n/i18n';
import { asset } from '../assetUrl';
import { Sound } from '../audio/Sound';
import { MiniGameHud } from '../ui/MiniGameHud';
import { GameState } from '../state/GameState';

class RevisionHud extends MiniGameHud {
  constructor(onPause: () => void) { super([], onPause, '', 'revision-hud'); this.labels(); }
  reserveFeedbackSpace(target: HTMLElement): () => void {
    const observer = new ResizeObserver(() => {
      target.style.setProperty('--c3-feedback-height', Math.ceil(this.el.react.getBoundingClientRect().height) + 24 + 'px');
    });
    observer.observe(this.el.react);
    return () => observer.disconnect();
  }
}

/** The memory board uses the same mini-game chrome, pause and character reactions. */
export abstract class Chapter3Base extends Phaser.Scene {
  protected root!: HTMLElement;
  protected main!: HTMLElement;
  protected footer!: HTMLElement;
  protected heading!: HTMLElement;
  protected subtitle!: HTMLElement;
  protected sharedHud!: RevisionHud;
  protected paused = false;
  private backdrop!: Phaser.GameObjects.Image;
  private badgeWas = true;
  private elapsed = 0;
  protected constructor(key: string, private readonly background: string) { super(key); }
  preload(): void { this.load.image(this.sys.settings.key + '-bg', asset(this.background)); }
  protected mount(): void {
    this.paused = false; this.elapsed = 0;
    this.backdrop = this.add.image(0, 0, this.sys.settings.key + '-bg').setOrigin(.5);
    this.fit();
    this.root = document.createElement('section');
    this.root.className = 'c3-root';
    this.root.innerHTML = '<header class="c3-header" hidden><h1></h1><p></p></header><main class="c3-main"></main><footer class="c3-footer"></footer>';
    document.getElementById('app')!.appendChild(this.root);
    this.main = this.root.querySelector('.c3-main')!;
    this.footer = this.root.querySelector('.c3-footer')!;
    this.heading = this.root.querySelector('h1')!;
    this.subtitle = this.root.querySelector('.c3-header p')!;
    this.sharedHud = new RevisionHud(() => this.togglePause());
    const stopMeasuring = this.sharedHud.reserveFeedbackSpace(this.root);
    this.root.addEventListener('pointerdown', e => e.stopPropagation());
    this.root.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button && !(button as HTMLButtonElement).disabled && !this.paused) this.action(button, e.detail === 0);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); this.togglePause(); }
      else if (!this.paused) this.shortcut(e);
    };
    const onHide = () => { if (document.hidden && !this.paused) this.togglePause(); };
    const offLang = I18n.onChange(() => { this.root.dir = I18n.rtl ? 'rtl' : 'ltr'; this.redraw(); });
    window.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onHide);
    this.scale.on('resize', this.fit, this);
    const badge = document.getElementById('profile-btn'); this.badgeWas = badge ? !!badge.hidden : true;
    if (badge) badge.hidden = true;
    const hint = document.getElementById('hud'); if (hint) hint.hidden = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offLang(); this.scale.off('resize', this.fit, this);
      window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide);
      stopMeasuring(); this.time.paused = false; this.sharedHud.destroy(); this.root.remove();
      if (badge) badge.hidden = this.badgeWas;
    });
    this.root.dir = I18n.rtl ? 'rtl' : 'ltr';
    Sound.duck(.12, .6); this.cameras.main.fadeIn(500, 11, 21, 51);
  }
  update(_time: number, delta: number): void {
    if (!this.sharedHud || this.paused) return;
    this.elapsed += Math.min(delta, 50) / 1000; this.sharedHud.setTime(this.elapsed);
  }
  private fit(): void {
    const cam = this.cameras.main, source = this.backdrop.texture.getSourceImage() as HTMLImageElement;
    this.backdrop.setPosition(cam.width / 2, cam.height / 2).setScale(Math.max(cam.width / source.width, cam.height / source.height));
  }
  protected feedbackReaction(text: string): void {
    const who = GameState.storyLeader === 'walid' ? 'nesma' : 'walid';
    if (!this.sharedHud.react(who, 'happy', text, 3500)) this.sharedHud.retextReaction(text);
  }
  protected togglePause(): void {
    this.paused = !this.paused; this.root.classList.toggle('paused', this.paused);
    this.main.inert = this.paused; this.footer.inert = this.paused; this.time.paused = this.paused;
    if (this.paused) this.sharedHud.pauseCard(() => this.togglePause());
    else this.sharedHud.dismissPause();
  }
  protected replaceMain(html: string, keyboard = false): void {
    const focused = this.main.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
    this.main.innerHTML = html;
    if (focused) {
      const next = [...this.main.querySelectorAll<HTMLButtonElement>('[data-focus]')].find(b => b.dataset.focus === focused && !b.disabled);
      (next ?? (keyboard ? this.main.querySelector<HTMLButtonElement>('button:not(:disabled)') : null))?.focus({ preventScroll: true });
    }
  }
  protected primary(label: string, action: string, disabled = false): string {
    return '<button type="button" class="avatar-continue" data-action="' + action + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  }
  protected abstract redraw(keyboard?: boolean): void;
  protected abstract action(button: HTMLElement, keyboard: boolean): void;
  protected shortcut(_e: KeyboardEvent): void { }
}
