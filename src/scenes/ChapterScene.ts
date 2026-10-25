import Phaser from 'phaser';
import { I18n, t, type Key } from '../i18n/i18n';
import { asset } from '../assetUrl';

export type ChapterArtwork = 'roadToMouth' | 'mouthMission' | 'esophagus' | 'stomachMission' | 'smallIntestineRoad' | 'smallIntestineMission' | 'revision';

const ART: Record<ChapterArtwork, { file: string; title: Key; subtitle: Key; titleY: number; subtitleY: number }> = {
  smallIntestineRoad: { file: 'small-intestine-road', title: 'chapter.3', subtitle: 'chapter.roadToSmallIntestine', titleY: 0.13, subtitleY: 0.24 },
  smallIntestineMission: { file: 'small-intestine-mission', title: 'chapter.3', subtitle: 'chapter.smallIntestineMission', titleY: 0.19, subtitleY: 0.28 },
  revision: { file: 'revision', title: 'chapter.3', subtitle: 'chapter.revision', titleY: 0.25, subtitleY: 0.43 },
  roadToMouth: { file: 'road-to-mouth', title: 'chapter.1', subtitle: 'chapter.roadToMouth', titleY: 0.34, subtitleY: 0.45 },
  mouthMission: { file: 'mouth-mission', title: 'chapter.1', subtitle: 'chapter.mouthMission', titleY: 0.33, subtitleY: 0.43 },
  esophagus: { file: 'esophagus', title: 'chapter.2', subtitle: 'chapter.esophagus', titleY: 0.33, subtitleY: 0.43 },
  stomachMission: { file: 'stomach-mission', title: 'chapter.2', subtitle: 'chapter.stomachMission', titleY: 0.19, subtitleY: 0.28 },
};

export interface ChapterData {
  title: string;
  subtitle: string;
  /** An illustrated card, with its lettering supplied by the current language. */
  artwork?: ChapterArtwork;
  /** Optional line under the subtitle. */
  note?: string;
  /** Continue automatically to this scene after the card. */
  next?: { scene: string; data?: object };
  /** Show a button back to this scene instead of continuing. */
  back?: { scene: string; label: string; data?: object };
}

/** A storybook title card between places. */
export class ChapterScene extends Phaser.Scene {
  private artwork?: ChapterData['artwork'];

  constructor() {
    super('Chapter');
  }

  init(data: ChapterData): void {
    this.artwork = data.artwork;
  }

  preload(): void {
    if (this.artwork && !this.textures.exists(`chapter_${this.artwork}`)) {
      this.load.image(`chapter_${this.artwork}`, asset(`chapters/${ART[this.artwork].file}.webp`));
    }
  }

  create(data: ChapterData): void {
    if (this.artwork) {
      this.illustrated(data, this.artwork);
      return;
    }
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

  /** Dounia's scene stays text-free; the game adds English or Arabic lettering. */
  private illustrated(data: ChapterData, artwork: ChapterArtwork): void {
    const art = ART[artwork];
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b1533');
    const background = this.add.image(0, 0, `chapter_${artwork}`);
    const title = this.add.text(0, 0, '', { color: '#fff6e3', align: 'center' }).setOrigin(0.5).setAlpha(0);
    if (this.artwork === 'smallIntestineRoad' || this.artwork === 'revision') title.setStroke('#17294b', 3);
    const subtitle = this.add.text(0, 0, '', {
      color: '#f3c35a', align: 'center', stroke: '#5a3a0a', strokeThickness: 2,
      shadow: { offsetY: 2, color: '#0b1533', blur: 8, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    const layout = () => {
      const W = cam.width;
      const H = cam.height;
      // Fill a landscape screen; in portrait, keep the whole illustration visible.
      const scale = (W >= H ? Math.max : Math.min)(W / background.width, H / background.height);
      background.setPosition(W / 2, H / 2).setScale(scale);
      const top = (H - background.displayHeight) / 2;
      const unit = Math.min(W, background.displayHeight) / 100;

      title.setRTL(I18n.rtl).setStyle({
        fontFamily: I18n.font, fontSize: `${Math.round(unit * 4.2)}px`, fontStyle: I18n.rtl ? '700' : 'normal',
      });
      title.setLetterSpacing(I18n.rtl ? 0 : unit * 0.8);
      title.setText(I18n.rtl ? t(art.title) : t(art.title).toUpperCase());
      subtitle.setRTL(I18n.rtl).setStyle({
        fontFamily: I18n.display, fontSize: `${Math.round(unit * 8)}px`, fontStyle: I18n.rtl ? '700' : 'normal',
      });
      subtitle.setStroke('#5a3a0a', Math.max(2, unit * 0.35)).setText(t(art.subtitle));
      // Scale long titles to the available width without splitting the Arabic lettering.
      title.setScale(Math.min(1, (W * 0.88) / title.width));
      subtitle.setScale(Math.min(1, (W * 0.88) / subtitle.width));
      title.setPosition(W / 2, top + background.displayHeight * art.titleY);
      subtitle.setPosition(W / 2, top + background.displayHeight * art.subtitleY);
    };
    const refresh = () => {
      layout();
      // A language switch can load the Arabic font while this card is already open.
      void document.fonts.ready.then(() => {
        if (title.scene && this.sys.isActive()) layout();
      });
    };
    refresh();
    this.scale.on('resize', layout);
    const offLanguage = I18n.onChange(refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', layout);
      offLanguage();
    });

    cam.fadeIn(600, 11, 21, 51);
    this.tweens.chain({
      tweens: [
        { targets: title, alpha: 1, duration: 700 },
        { targets: subtitle, alpha: 1, duration: 900 },
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
