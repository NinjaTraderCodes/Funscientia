import Phaser from 'phaser';
import { I18n, t } from '../i18n/i18n';
import { Sound } from '../audio/Sound';

export type StarchHint = 'select' | 'pairs';

/** Six starch units, two cut sites, three maltose pairs: Dounia's amylase task. */
export class StarchTask {
  private readonly root: Phaser.GameObjects.Container;
  private readonly scissors: Phaser.GameObjects.Image;
  private readonly aim = new Phaser.Math.Vector2(640, 430);
  private readonly cuts = [false, false];
  private readonly joints: Phaser.GameObjects.Arc[] = [];
  private readonly pairs: {
    root: Phaser.GameObjects.Container;
    beads: Phaser.GameObjects.Image[];
    bond: Phaser.GameObjects.Ellipse;
    product: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    complete: boolean;
  }[] = [];
  private readonly offLanguage: () => void;
  private ready = false;
  private selected = false;
  private finished = false;

  constructor(
    private readonly scene: Phaser.Scene,
    origin: { x: number; y: number },
    private readonly onProgress: (pairs: number) => void,
    private readonly onHint: (hint: StarchHint) => void,
    private readonly onComplete: () => void,
  ) {
    this.root = scene.add.container(origin.x, origin.y).setDepth(2700).setScale(0.25);
    const panel = scene.add.graphics();
    panel.fillStyle(0x13234d, 0.82).fillRoundedRect(-335, -95, 670, 235, 30);
    panel.lineStyle(3, 0xe2b85a, 0.85).strokeRoundedRect(-335, -95, 670, 235, 30);
    this.root.add(panel);
    for (let p = 0; p < 3; p++) {
      const root = scene.add.container((p - 1) * 192, 0);
      const bond = scene.add.ellipse(0, 0, 42, 25, 0xb75aeb).setStrokeStyle(2, 0xedb7ff);
      const beads = [-48, 48].map((x, i) => scene.add.image(x, 0, `m_starch_${(p + i) % 2}`).setDisplaySize(88, 88));
      const product = scene.add.image(0, 0, 'm_maltose').setVisible(false);
      product.setDisplaySize(175, 175 * product.height / product.width);
      const label = scene.add.text(0, 64, '', { color: '#ffe29a', fontSize: '23px', fontStyle: '700' }).setOrigin(0.5).setVisible(false);
      root.add([bond, ...beads, product, label]);
      this.root.add(root);
      this.pairs.push({ root, bond, beads, product, label, complete: false });
    }
    for (const x of [-96, 96]) {
      const joint = scene.add.circle(x, 0, 15, 0xba6bed).setStrokeStyle(3, 0xffe29a);
      this.root.add(joint);
      this.joints.push(joint);
      scene.tweens.add({ targets: joint, scale: 1.18, duration: 650, yoyo: true, repeat: -1 });
    }
    this.scissors = scene.add.image(origin.x, origin.y, 'm_amylase_scissors').setDepth(3000).setOrigin(0.45, 0.3).setVisible(false);
    this.scissors.setDisplaySize(105, 105 * this.scissors.height / this.scissors.width);
    scene.tweens.add({
      targets: this.root, x: 640, y: 430, scale: 1, duration: 650, ease: 'Cubic.easeOut',
      onComplete: () => { this.ready = true; },
    });
    const labels = () => {
      for (const p of this.pairs) p.label.setRTL(I18n.rtl).setStyle({ fontFamily: I18n.font }).setText(t('mouth.digest.maltose'));
    };
    labels();
    this.offLanguage = I18n.onChange(labels);
  }

  select(): void {
    if (this.finished) return;
    this.selected = true;
    this.scissors.setVisible(true);
  }

  aimAt(x: number, y: number): void {
    this.aim.set(x, y);
  }

  update(dt: number): void {
    this.scissors.x += (this.aim.x - this.scissors.x) * Math.min(1, dt * 20);
    this.scissors.y += (this.aim.y - this.scissors.y) * Math.min(1, dt * 20);
  }

  /** A tap or swipe cuts only the two bonds that leave complete pairs. */
  snip(x: number, y: number, from?: Phaser.Math.Vector2): void {
    if (this.finished || !this.ready) return;
    if (!this.selected) return this.onHint('select');
    this.aimAt(x, y);
    const line = from ? new Phaser.Geom.Line(from.x, from.y, x, y) : null;
    let hit = false;
    for (let i = 0; i < 2; i++) {
      if (this.cuts[i]) continue;
      const cx = this.root.x + (i === 0 ? -96 : 96);
      const cy = this.root.y;
      const near = line
        ? Phaser.Geom.Intersects.LineToCircle(line, new Phaser.Geom.Circle(cx, cy, 32))
        : Math.hypot(x - cx, y - cy) < 40;
      if (!near) continue;
      hit = true;
      this.cuts[i] = true;
      this.joints[i].setVisible(false);
      Sound.tone(1500, 2100, 0.12, 0.055, 'triangle');
      this.scene.tweens.add({ targets: this.scissors, angle: { from: -18, to: 0 }, duration: 90, yoyo: true });
      this.revealPairs();
    }
    if (!hit && !line && Math.abs(x - this.root.x) < 310 && Math.abs(y - this.root.y) < 85) this.onHint('pairs');
  }

  /** Keyboard equivalent of tapping the next glowing joint. */
  cutNext(): void {
    const i = this.cuts.findIndex((cut) => !cut);
    if (i >= 0) this.snip(this.root.x + (i === 0 ? -96 : 96), this.root.y);
  }

  private revealPairs(): void {
    const complete = [this.cuts[0], this.cuts[0] && this.cuts[1], this.cuts[1]];
    for (const [i, p] of this.pairs.entries()) {
      if (!complete[i] || p.complete) continue;
      p.complete = true;
      p.beads.forEach((b) => b.setVisible(false));
      p.bond.setVisible(false);
      p.product.setVisible(true);
      p.label.setVisible(true);
      this.scene.tweens.add({ targets: p.root, x: (i - 1) * 208, y: 22, duration: 400, ease: 'Sine.easeOut' });
    }
    const n = complete.filter(Boolean).length;
    this.onProgress(n);
    if (n === 3) {
      this.finished = true;
      this.scissors.setVisible(false);
      Sound.chime();
      this.scene.time.delayedCall(1600, this.onComplete);
    }
  }

  destroy(): void {
    this.offLanguage();
    this.scene.tweens.killTweensOf([this.root, this.scissors, ...this.joints, ...this.pairs.map((p) => p.root)]);
    this.root.destroy(true);
    this.scissors.destroy();
  }
}
