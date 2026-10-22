import Phaser from 'phaser';
import { Sound } from '../audio/Sound';

export interface PeristalsisOptions {
  /** Where the tunnel vanishes (the far end), in world units. */
  far: { x: number; y: number };
  /** Centre of the tunnel's nearest ring (below and in front of the camera). */
  near: { x: number; y: number };
  /** Radius of the nearest ring (bigger than the screen). */
  nearRadius: number;
  /** The bolus rolls along this path (world units, from near to far), if given. */
  bolusPath?: [number, number][];
  /** Body height of a kid at a ground y (the bolus is sized from it). */
  kidAt: (y: number) => number;
  /** Seconds between waves. */
  every?: number;
}

const TRAVEL = 3.4; // seconds a wave takes from the camera to the far end
const DEPTH = 12; // the far end is this many times further than the nearest ring

/**
 * Peristalsis in the esophagus: rings of muscle squeeze down the tunnel one
 * after another, away from the camera towards the stomach. Each wave glows
 * along the tunnel's golden rings, rumbles, squeezes the view a little, and
 * pushes the trio's bolus further along - it rolls ahead of them to the gate.
 */
export class Peristalsis {
  private readonly o: Required<Omit<PeristalsisOptions, 'bolusPath'>> & { bolusPath?: [number, number][] };
  private readonly ring: Phaser.GameObjects.Graphics;
  private wave = -1; // 0..1 while a wave travels, -1 between waves
  private wait = 2.5;
  private pushed = false;
  private bolus?: Phaser.GameObjects.Image;
  /** How far along its path the bolus is (0..1), and where it is heading. */
  private u = 0.16;
  private uTarget = 0.16;
  private readonly lengths: number[] = [];
  /** Stops before the gate until it is let in. */
  private stopAt = 0.96;
  private wobble = 0;
  /** A wave squeezes the view: the scene reads this (1 = none). */
  squeeze = 1;
  /** Called when a wave passes the party (e.g. for a first-time remark). */
  onWave?: () => void;

  constructor(scene: Phaser.Scene, options: PeristalsisOptions) {
    this.o = { every: 6.5, ...options };
    this.ring = scene.add.graphics().setDepth(-5e5).setBlendMode(Phaser.BlendModes.ADD);
    const path = options.bolusPath;
    if (path && path.length > 1 && scene.textures.exists('m_bolus')) {
      let total = 0;
      this.lengths.push(0);
      for (let i = 1; i < path.length; i++) {
        total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        this.lengths.push(total);
      }
      this.bolus = scene.add.image(path[0][0], path[0][1], 'm_bolus').setOrigin(0.5, 0.92);
      this.placeBolus();
    }
  }

  /** Let the bolus roll on into the gate (the end of its path). */
  enterGate(): void {
    this.stopAt = 1;
    this.uTarget = 1;
  }

  update(dt: number): void {
    if (this.wave < 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wave = 0;
        this.pushed = false;
        Sound.noise(1.1, 85, 0.7, 0.16);
        Sound.tone(70, 45, 1.1, 0.06, 'sine');
      }
    } else {
      this.wave += dt / TRAVEL;
      // the wave reaches the bolus: it rolls on
      if (!this.pushed && this.bolus && this.wave > this.u * 0.75) {
        this.pushed = true;
        this.uTarget = Math.min(this.stopAt, this.u + 0.2);
        this.onWave?.();
      }
      if (this.wave >= 1) {
        this.wave = -1;
        this.wait = this.o.every * (0.85 + Math.random() * 0.3);
      }
    }
    this.drawRing();
    // the view squeezes a touch as the ring passes near the camera
    const near = this.wave >= 0 ? Math.max(0, 1 - this.wave / 0.35) : 0;
    this.squeeze = 1 + 0.018 * Math.sin(near * Math.PI);
    if (this.bolus) {
      const before = this.u;
      this.u += (this.uTarget - this.u) * Math.min(1, dt * 2.2);
      this.placeBolus(this.u - before);
    }
  }

  private drawRing(): void {
    const g = this.ring;
    g.clear();
    if (this.wave < 0) return;
    const { far, near, nearRadius } = this.o;
    const d = 1 + this.wave * (DEPTH - 1); // distance of the ring from the camera
    const r = nearRadius / d;
    const k = 1 / d;
    const cx = far.x + (near.x - far.x) * k;
    const cy = far.y + (near.y - far.y) * k;
    const fade = Math.min(1, this.wave / 0.08) * Math.min(1, (1 - this.wave) / 0.25);
    // a soft glow and a bright core, like the tunnel's golden rings lighting up
    g.lineStyle(Math.max(4, r * 0.16), 0xffc56b, 0.16 * fade);
    g.strokeEllipse(cx, cy, r * 2, r * 1.8);
    g.lineStyle(Math.max(2, r * 0.05), 0xffe7a8, 0.5 * fade);
    g.strokeEllipse(cx, cy, r * 2, r * 1.8);
  }

  private placeBolus(step = 0): void {
    const path = this.o.bolusPath!;
    const b = this.bolus!;
    const total = this.lengths[this.lengths.length - 1];
    const at = Phaser.Math.Clamp(this.u, 0, 1) * total;
    let i = 1;
    while (i < this.lengths.length - 1 && this.lengths[i] < at) i++;
    const t = (at - this.lengths[i - 1]) / Math.max(1e-6, this.lengths[i] - this.lengths[i - 1]);
    const x = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t;
    const y = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t;
    const h = this.o.kidAt(y) * 0.42;
    // it shrinks away into the gate at the very end
    const gone = Phaser.Math.Clamp((this.u - 0.97) / 0.03, 0, 1);
    b.setPosition(x, y).setDisplaySize(h * (b.width / b.height) * (1 - gone), h * (1 - gone)).setDepth(y);
    b.setAlpha(1 - gone * 0.6);
    // it rolls on with a happy wobble (its face stays up)
    this.wobble += step * 60;
    b.setAngle(Math.sin(this.wobble) * 9);
  }
}
