import Phaser from 'phaser';
import { I18n, t } from '../i18n/i18n';
import { Sound } from '../audio/Sound';

const SITES = [
  { x: 390, y: 385 }, { x: 890, y: 385 },
  { x: 390, y: 480 }, { x: 890, y: 480 },
  { x: 640, y: 575 },
] as const;
export const STARCH_BREAD_COUNT = SITES.length;
export const STARCH_PAIR_COUNT = STARCH_BREAD_COUNT * 3;
export type StarchHint = 'select' | 'pairs';

interface MaltosePair {
  root: Phaser.GameObjects.Container;
  beads: Phaser.GameObjects.Image[];
  bond: Phaser.GameObjects.Ellipse;
  product: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  complete: boolean;
}

interface StarchChain {
  root: Phaser.GameObjects.Container;
  bread: Phaser.GameObjects.Image;
  molecule: Phaser.GameObjects.Container;
  revealed: boolean;
  cuts: boolean[];
  joints: Phaser.GameObjects.Arc[];
  pairs: MaltosePair[];
}

/** Reveal all five breads, then cut their six-unit starch chains into maltose pairs. */
export class StarchTask {
  private readonly chains: StarchChain[] = [];
  private readonly scissors: Phaser.GameObjects.Image;
  private readonly aim = new Phaser.Math.Vector2(640, 430);
  private readonly offLanguage: () => void;
  private selected = false;
  private finished = false;
  private completionTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onBread: (revealed: number) => void,
    private readonly onProgress: (pairs: number) => void,
    private readonly onHint: (hint: StarchHint) => void,
    private readonly onComplete: () => void,
  ) {
    for (const site of SITES) {
      const root = scene.add.container(site.x, site.y).setDepth(2700);
      const panel = scene.add.graphics();
      panel.fillStyle(0x13234d, 0.88).fillRoundedRect(-215, -36, 430, 88, 18);
      panel.lineStyle(2, 0xe2b85a, 0.85).strokeRoundedRect(-215, -36, 430, 88, 18);
      const bread = scene.add.image(0, 3, 'm_bread');
      bread.setDisplaySize(115, 115 * bread.height / bread.width);
      const molecule = scene.add.container(0, 0).setVisible(false);
      root.add([panel, bread, molecule]);
      const chain: StarchChain = { root, bread, molecule, revealed: false, cuts: [false, false], joints: [], pairs: [] };
      for (let p = 0; p < 3; p++) {
        const pairRoot = scene.add.container((p - 1) * 132, 0);
        const bond = scene.add.ellipse(0, 0, 30, 17, 0xb75aeb).setStrokeStyle(2, 0xedb7ff);
        const beads = [-33, 33].map((x, i) => scene.add.image(x, 0, `m_starch_${(p + i) % 2}`).setDisplaySize(57, 57));
        const product = scene.add.image(0, 0, 'm_maltose').setVisible(false);
        product.setDisplaySize(115, 115 * product.height / product.width);
        const label = scene.add.text(0, 38, '', { color: '#ffe29a', fontSize: '18px', fontStyle: '700' }).setOrigin(0.5).setVisible(false);
        pairRoot.add([bond, ...beads, product, label]);
        molecule.add(pairRoot);
        chain.pairs.push({ root: pairRoot, bond, beads, product, label, complete: false });
      }
      for (const x of [-66, 66]) {
        const joint = scene.add.circle(x, 0, 11, 0xba6bed).setStrokeStyle(2, 0xffe29a);
        molecule.add(joint);
        chain.joints.push(joint);
        scene.tweens.add({ targets: joint, scale: 1.18, duration: 650, yoyo: true, repeat: -1 });
      }
      this.chains.push(chain);
    }
    this.scissors = scene.add.image(640, 430, 'm_amylase_scissors').setDepth(3000).setOrigin(0.45, 0.3).setVisible(false);
    this.scissors.setDisplaySize(95, 95 * this.scissors.height / this.scissors.width);
    const labels = () => {
      for (const chain of this.chains) for (const p of chain.pairs) {
        p.label.setRTL(I18n.rtl).setStyle({ fontFamily: I18n.font }).setText(t('mouth.digest.maltose'));
      }
    };
    labels();
    this.offLanguage = I18n.onChange(labels);
  }

  /** A bread remains until hit, and each bread reveals exactly one chain. */
  hitBread(x: number, y: number): boolean {
    const chain = this.chains.find((c) => !c.revealed && Math.abs(x - c.root.x) < 85 && Math.abs(y - c.root.y) < 43);
    if (!chain) return false;
    chain.revealed = true;
    chain.bread.setVisible(false);
    chain.molecule.setVisible(true).setScale(0.65);
    this.scene.tweens.add({ targets: chain.molecule, scale: 1, duration: 280, ease: 'Back.easeOut' });
    Sound.noise(0.09, 900, 0.9, 0.22);
    Sound.tone(180, 90, 0.08, 0.06, 'triangle');
    this.onBread(this.chains.filter((c) => c.revealed).length);
    return true;
  }

  nextBread(): { x: number; y: number } | undefined {
    const chain = this.chains.find((c) => !c.revealed);
    return chain ? { x: chain.root.x, y: chain.root.y } : undefined;
  }

  select(): void {
    if (this.finished || this.chains.some((c) => !c.revealed)) return;
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

  /** A tap or swipe cuts only the two bonds per chain that leave complete pairs. */
  snip(x: number, y: number, from?: Phaser.Math.Vector2): void {
    if (this.finished || this.chains.some((c) => !c.revealed)) return;
    if (!this.selected) return this.onHint('select');
    this.aimAt(x, y);
    const line = from ? new Phaser.Geom.Line(from.x, from.y, x, y) : null;
    let hit = false;
    for (const chain of this.chains) {
      for (let i = 0; i < 2; i++) {
        if (chain.cuts[i]) continue;
        const cx = chain.root.x + (i === 0 ? -66 : 66);
        const cy = chain.root.y;
        const near = line
          ? Phaser.Geom.Intersects.LineToCircle(line, new Phaser.Geom.Circle(cx, cy, 28))
          : Math.hypot(x - cx, y - cy) < 32;
        if (!near) continue;
        hit = true;
        chain.cuts[i] = true;
        chain.joints[i].setVisible(false);
        Sound.tone(1500, 2100, 0.12, 0.055, 'triangle');
        this.scene.tweens.add({ targets: this.scissors, angle: { from: -18, to: 0 }, duration: 90, yoyo: true });
        this.revealPairs(chain);
      }
    }
    if (!hit && !line) this.onHint('pairs');
  }

  /** Keyboard equivalent of tapping the next glowing joint across all five chains. */
  cutNext(): void {
    const chain = this.chains.find((c) => c.cuts.some((cut) => !cut));
    if (!chain) return;
    const i = chain.cuts.findIndex((cut) => !cut);
    this.snip(chain.root.x + (i === 0 ? -66 : 66), chain.root.y);
  }

  private revealPairs(chain: StarchChain): void {
    const complete = [chain.cuts[0], chain.cuts[0] && chain.cuts[1], chain.cuts[1]];
    for (const [i, p] of chain.pairs.entries()) {
      if (!complete[i] || p.complete) continue;
      p.complete = true;
      p.beads.forEach((b) => b.setVisible(false));
      p.bond.setVisible(false);
      p.product.setVisible(true);
      p.label.setVisible(true);
      this.scene.tweens.add({ targets: p.root, x: (i - 1) * 140, y: 2, duration: 300, ease: 'Sine.easeOut' });
    }
    const n = this.chains.reduce((sum, c) => sum + c.pairs.filter((p) => p.complete).length, 0);
    this.onProgress(n);
    if (n === STARCH_PAIR_COUNT) {
      this.finished = true;
      this.scissors.setVisible(false);
      Sound.chime();
      this.completionTimer = this.scene.time.delayedCall(1600, this.onComplete);
    }
  }

  destroy(): void {
    this.offLanguage();
    this.completionTimer?.remove();
    for (const c of this.chains) {
      this.scene.tweens.killTweensOf([c.molecule, ...c.joints, ...c.pairs.map((p) => p.root)]);
      c.root.destroy(true);
    }
    this.scene.tweens.killTweensOf(this.scissors);
    this.scissors.destroy();
  }
}
