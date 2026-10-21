import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import type { CharacterDef, CharacterName, Facing, StillAnimDef, ViewName } from '../data/types';

/**
 * Walking speed ON THE GROUND, in kid body heights per second. Screen speed is
 * derived from it with the place's perspective, so steps never slide.
 */
const WALK_BODIES_PER_SEC = 0.5;
/**
 * Ground distance covered by one full walk cycle (two steps), in the
 * character's own body heights; measured from the real side-walk motion
 * the kids' frames were made from. The fox trots with shorter, quicker steps.
 */
const STRIDE_BODIES: Record<CharacterName, number> = { boy: 0.47, girl: 0.47, fox: 0.9 };
/** Below this speed (body heights / s) a character counts as standing still. */
const MOVING_THRESHOLD = 0.05;

/** Eight screen directions, clockwise from "away" (up the screen). */
type Dir = 'away' | 'away-right' | 'right' | 'toward-right' | 'toward' | 'toward-left' | 'left' | 'away-left';
const DIRS: Dir[] = ['away', 'away-right', 'right', 'toward-right', 'toward', 'toward-left', 'left', 'away-left'];

/** Which turnaround view shows a direction (ignoring left/right, solved by mirroring). */
const VIEW_FOR: Record<Dir, ViewName> = {
  away: 'back',
  'away-right': 'three-quarter-back',
  'away-left': 'three-quarter-back',
  right: 'side',
  left: 'side',
  'toward-right': 'three-quarter-front',
  'toward-left': 'three-quarter-front',
  toward: 'front',
};

/** Real walk cycles and the directions they cover (diagonals reuse the straight cycle). */
const WALK_CYCLES = { back: 'walk_back', front: 'walk_front', side: 'walk_side' } as const;
type Cycle = keyof typeof WALK_CYCLES;
const cycleFor = (d: Dir): Cycle | null =>
  d === 'away' || d === 'away-left' || d === 'away-right' ? 'back'
    : d === 'toward' || d === 'toward-left' || d === 'toward-right' ? 'front'
      : 'side';
/** The side walk cycle is drawn facing left; walking right mirrors it. */
const SIDE_CYCLE_FACES = -1;

const sideOf = (f: Facing | Dir): -1 | 0 | 1 => (f.endsWith('left') ? -1 : f.endsWith('right') ? 1 : 0);

/**
 * A character standing on the ground plane. Gameplay code talks to this class
 * in world units only; how it looks comes entirely from the manifest:
 * - walking away from / toward the camera plays real walk cycles (cut from the intro),
 * - sideways directions show the matching turnaround view with a procedural step
 *   (bob + sway) until real walk cycles for those directions are added.
 */
export class Character {
  readonly name: CharacterName;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Soft contact shadow on the ground, so the character sits in the scene. */
  readonly shadow: Phaser.GameObjects.Image;
  readonly pos: Phaser.Math.Vector2;
  private readonly def: CharacterDef;
  private readonly heightAt: (y: number) => number;
  private target: Phaser.Math.Vector2 | null = null;
  private speedFactor = 1;
  private breathT = Math.random() * 10;
  private readonly lastPos: Phaser.Math.Vector2;
  /** Smoothed velocity in world units / s, used to pick a direction without flicker. */
  private readonly vel = new Phaser.Math.Vector2();
  private dir: Dir = 'away';
  private moving = false;
  private stepPhase = Math.random();
  private groundSpeed = 0;
  private shown = '';
  /**
   * Extra view transform used only by the overlook's opening shot: the camera
   * dollies towards the trio, so they appear `k` times larger about `pivot`.
   */
  readonly dolly = { pivotX: 0, pivotY: 0, k: 1 };

  /**
   * @param heightAt body height (world units) at a ground y
   * @param foreshorten screen-vertical / screen-horizontal size of one ground unit at y
   *   (how much the ground is squashed by the camera's angle; 1 = top-down)
   * @param relHeight this character's height relative to a kid (speed is shared by the party)
   */
  constructor(
    scene: Phaser.Scene,
    name: CharacterName,
    def: CharacterDef,
    heightAt: (y: number) => number,
    private readonly foreshorten: (y: number) => number = () => 0.45,
    private readonly relHeight = 1,
  ) {
    this.name = name;
    this.def = def;
    this.heightAt = heightAt;
    this.pos = new Phaser.Math.Vector2(def.start.x, def.start.y);
    this.lastPos = this.pos.clone();

    for (const [cycle, walk] of Object.entries(WALK_CYCLES).map(([c, k]) => [c, def.animations[k]] as const)) {
      const key = `${name}_${cycle}`;
      if (!walk || scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims
          .generateFrameNames(name, { prefix: walk.prefix, start: 0, end: walk.count - 1, zeroPad: 2 })
          .map((f, i) => (walk.durations ? { ...f, duration: walk.durations[i] } : f)),
        frameRate: walk.fps, // per-frame durations (when present) take precedence in Phaser 4
        repeat: -1,
      });
    }
    ensureShadowTexture(scene);
    this.shadow = scene.add.image(this.pos.x, this.pos.y, 'contact_shadow').setAlpha(0.42);
    this.sprite = scene.add.sprite(this.pos.x, this.pos.y, name, def.animations.idle_back.frame);
    this.layout(0);
  }

  /** Smoothed on-screen velocity (world units / s). */
  get velocity(): Readonly<Phaser.Math.Vector2> {
    return this.vel;
  }

  get isMoving(): boolean {
    return this.target !== null;
  }

  /** Current body height in world units (shrinks with distance). */
  get bodyHeight(): number {
    return this.heightAt(this.pos.y);
  }

  walkTo(x: number, y: number, speedFactor = 1): void {
    this.target = new Phaser.Math.Vector2(x, y);
    this.speedFactor = speedFactor;
  }

  stop(): void {
    this.target = null;
  }

  /** Place the character instantly (scene start, spawn points). */
  teleport(x: number, y: number): void {
    this.target = null;
    this.pos.set(x, y);
    this.lastPos.set(x, y);
    this.vel.set(0, 0);
    this.layout(0);
  }

  /** Turn to face a point without walking (e.g. to look at something). */
  faceTowards(x: number, y: number): void {
    this.dir = dirOf(x - this.pos.x, y - this.pos.y);
  }

  /** Kid body height here: the unit the party's shared speed is measured in. */
  private get kidHeight(): number {
    return this.bodyHeight / this.relHeight;
  }

  /**
   * Screen distance covered in dt along a screen direction (ux, uy), for a
   * given ground speed: vertical screen moves are foreshortened ground moves.
   */
  private screenStep(ux: number, uy: number, dt: number, factor: number): number {
    const r = Math.max(0.05, this.foreshorten(this.pos.y));
    const groundPerPx = Math.hypot(ux, uy / r) / this.kidHeight; // kid body heights per screen px
    return (WALK_BODIES_PER_SEC * factor * dt) / Math.max(1e-6, groundPerPx);
  }

  /** Move along a unit direction, used for keyboard control. */
  nudge(dx: number, dy: number, dt: number, clamp: (v: Phaser.Math.Vector2) => Phaser.Math.Vector2): void {
    this.target = null;
    this.speedFactor = 1;
    const step = this.screenStep(dx, dy, dt, 1);
    const next = new Phaser.Math.Vector2(this.pos.x + dx * step, this.pos.y + dy * step);
    this.pos.copy(clamp(next));
  }

  update(dt: number): void {
    if (this.target) {
      const dx = this.target.x - this.pos.x;
      const dy = this.target.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = dist > 0 ? this.screenStep(dx / dist, dy / dist, dt, this.speedFactor) : 0;
      if (dist <= step) {
        this.pos.copy(this.target);
        this.target = null;
      } else {
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dy / dist) * step;
      }
    }
    this.layout(dt);
  }

  /** Work out motion from how far we moved this frame, then draw. */
  private layout(dt: number): void {
    const h = this.bodyHeight;
    if (dt > 0) {
      const vx = (this.pos.x - this.lastPos.x) / dt;
      const vy = (this.pos.y - this.lastPos.y) / dt;
      const a = 1 - Math.exp(-dt * 14);
      this.vel.x += (vx - this.vel.x) * a;
      this.vel.y += (vy - this.vel.y) * a;
      const speed = this.vel.length() / h;
      this.moving = speed > MOVING_THRESHOLD;
      // ground speed actually achieved this frame, in this character's body heights / s
      const r = Math.max(0.05, this.foreshorten(this.pos.y));
      this.groundSpeed = Math.hypot(this.vel.x, this.vel.y / r) / h;
      if (this.moving) {
        this.dir = dirOf(this.vel.x, this.vel.y, this.dir);
        // one footstep per half stride of ground travelled
        const before = Math.floor(this.stepPhase);
        this.stepPhase += (this.groundSpeed * dt) / (STRIDE_BODIES[this.name] / 2);
        if (Math.floor(this.stepPhase) !== before) {
          const cam = this.sprite.scene.cameras.main;
          const loud = Phaser.Math.Clamp((h * cam.zoom) / (cam.height * 0.45), 0, 1);
          Sound.step(this.name === 'fox', loud);
        }
      }
    }
    this.lastPos.copy(this.pos);

    const anims = this.def.animations;
    const cycle = this.moving ? cycleFor(this.dir) : null;
    const walkDef = cycle ? anims[WALK_CYCLES[cycle]] : undefined; // missing cycle -> standing view + procedural step
    const useWalkCycle = !!walkDef;
    let still: StillAnimDef = anims.idle_back;
    let flip = false;
    if (useWalkCycle) {
      if (this.shown !== cycle) {
        this.sprite.setOrigin(0.5, walkDef!.originY);
        // random phase so the trio does not step in lock-step
        this.sprite.play({ key: `${this.name}_${cycle}`, startFrame: Phaser.Math.Between(0, walkDef!.count - 1) });
        this.shown = cycle!;
      }
      // feet lock to the ground: one cycle per stride travelled
      const cycleSec = walkDef!.durations
        ? walkDef!.durations.reduce((a, b) => a + b, 0) / 1000
        : walkDef!.count / walkDef!.fps;
      this.sprite.anims.timeScale = Phaser.Math.Clamp(
        (this.groundSpeed * cycleSec) / (STRIDE_BODIES[this.name] * (walkDef!.strides ?? 1)), 0.3, 3);
      flip = cycle === 'side' && sideOf(this.dir) !== SIDE_CYCLE_FACES;
    } else {
      // standing: the crisp turnaround view for the way it faces
      const view = this.def.views?.[VIEW_FOR[this.dir]];
      if (view) {
        still = view;
        const want = sideOf(this.dir);
        const has = sideOf(view.facing);
        flip = want !== 0 && has !== 0 && want !== has;
      }
      if (this.shown !== still.frame) {
        this.sprite.stop();
        this.sprite.setFrame(still.frame);
        this.sprite.setOrigin(0.5, still.originY);
        this.shown = still.frame;
      }
    }
    this.sprite.setFlipX(flip);

    const bodyPx = walkDef ? walkDef.bodyPx : still.bodyPx;
    const scale = h / bodyPx;
    let sx = scale;
    let sy = scale;
    let lift = 0;
    let tilt = 0;
    if (!useWalkCycle && this.moving) {
      // procedural step for directions that have no walk cycle yet
      const fox = this.name === 'fox';
      const s = Math.sin(this.stepPhase * Math.PI);
      lift = Math.abs(s) * h * (fox ? 0.05 : 0.03);
      tilt = s * (fox ? 2 : 3);
      sy *= 1 - (1 - Math.abs(s)) * 0.025; // tiny squash on each foot-down
      sx *= 1 + (1 - Math.abs(s)) * 0.012;
    } else if (!this.moving) {
      this.breathT += dt;
      sy *= 1 + 0.008 * Math.sin(this.breathT * 2.1);
    }

    const { pivotX, pivotY, k } = this.dolly;
    this.sprite.setPosition(pivotX + (this.pos.x - pivotX) * k, pivotY + (this.pos.y - lift - pivotY) * k);
    this.sprite.setScale(sx * k, sy * k);
    this.sprite.setAngle(tilt);
    this.sprite.setDepth(this.pos.y);
    // shadow: an ellipse under the feet, longer when seen from the side (the fox's body)
    const side = this.dir === 'left' || this.dir === 'right';
    const wide = (this.name === 'fox' ? (side ? 1.15 : 0.55) : side ? 0.48 : 0.42) * h * k;
    this.shadow.setPosition(pivotX + (this.pos.x - pivotX) * k, pivotY + (this.pos.y - pivotY) * k);
    this.shadow.setDisplaySize(wide, wide * 0.24).setDepth(this.pos.y - 0.5);
    this.shadow.setVisible(this.sprite.visible);
  }
}

/**
 * Screen direction of a ground-plane motion. Vertical screen motion is
 * foreshortened (the ground recedes), so it is weighted up before choosing.
 * A little hysteresis keeps diagonal walks from flickering between views.
 */
function dirOf(dx: number, dy: number, current?: Dir): Dir {
  const angle = Phaser.Math.RadToDeg(Math.atan2(dx, -dy * 2)); // 0 = away, clockwise
  const sector = (a: number) => DIRS[((Math.round(a / 45) % 8) + 8) % 8];
  const next = sector(angle);
  if (current && next !== current) {
    const ci = DIRS.indexOf(current) * 45;
    const diff = Math.abs(((angle - ci + 540) % 360) - 180);
    if (diff < 22.5 + 8) return current;
  }
  return next;
}

/** A soft radial blob, baked once (drawn shapes would be re-tessellated every frame). */
function ensureShadowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('contact_shadow')) return;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(40,20,30,0.9)');
  g.addColorStop(0.55, 'rgba(40,20,30,0.45)');
  g.addColorStop(1, 'rgba(40,20,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas('contact_shadow', canvas);
}
