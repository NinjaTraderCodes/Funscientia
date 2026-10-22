import Phaser from 'phaser';
import { I18n } from '../i18n/i18n';

export interface ChapterData {
  title: string;
  subtitle: string;
  /** Optional line under the subtitle. */
  note?: string;
  /** Continue automatically to this scene after the card. */
  next?: { scene: string; data?: object };
  /** Show a button back to this scene instead of continuing. */
  back?: { scene: string; label: string; data?: object };
}

/** A storybook title card between places. */
export class ChapterScene extends Phaser.Scene {
  constructor() {
    super('Chapter');
  }

  create(data: ChapterData): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b1533');
    const W = cam.width;
    const H = cam.height;
    const u = Math.min(W, H) / 100;
    const text = (y: number, s: string, size: number, color: string, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) =>
      this.add.text(W / 2, H * y, s, { fontFamily: I18n.font, ...I18n.textStyle, fontSize: `${Math.round(u * size)}px`, color, align: 'center', wordWrap: { width: W * 0.85 }, ...extra }).setOrigin(0.5).setAlpha(0);

    // spaced capitals in English; Arabic letters join up, so no spacing there
    const title = I18n.rtl ? text(0.4, data.title, 5, '#fff6e3') : text(0.4, data.title.toUpperCase(), 4.2, '#fff6e3', { letterSpacing: u * 0.8 });
    const subtitle = text(0.5, data.subtitle, 8, '#f3c35a', { fontFamily: I18n.display, stroke: '#5a3a0a', strokeThickness: Math.max(2, u * 0.4) });
    const items: Phaser.GameObjects.Text[] = [];
    if (data.note) items.push(text(0.64, data.note, 3.4, '#fff6e3'));
    if (data.back) {
      const b = text(0.76, data.back.label, 3.6, '#ffe29a', { backgroundColor: '#13235a', padding: { x: u * 3, y: u * 1.6 } });
      b.setInteractive({ useHandCursor: true }).once('pointerup', () => this.go(data.back!.scene, data.back!.data));
      items.push(b);
    }

    cam.fadeIn(600, 11, 21, 51);
    this.tweens.chain({
      tweens: [
        { targets: title, alpha: 1, duration: 700 },
        { targets: subtitle, alpha: 1, duration: 900 },
        ...(items.length ? [{ targets: items, alpha: 1, duration: 700, delay: 600 }] : []),
      ],
      onComplete: () => {
        if (data.next) this.time.delayedCall(1100, () => this.go(data.next!.scene, data.next!.data));
      },
    });
  }

  private go(scene: string, data?: object): void {
    const cam = this.cameras.main;
    cam.fadeOut(500, 11, 21, 51);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
