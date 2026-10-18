import Phaser from 'phaser';
import type { AnimState, CharacterDef, CharacterName } from '../data/types';

/** World speed is expressed in body heights per second so it reads right at any depth. */
const WALK_BODIES_PER_SEC = 0.62;

/**
 * A character standing on the ground plane. Gameplay code talks to this class
 * in world units and animation states only; how the frames look (cut-outs
 * today, new walk cycles or rigs later) comes entirely from the manifest.
 */
export class Character {
  readonly name: CharacterName;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly pos: Phaser.Math.Vector2;
  private readonly def: CharacterDef;
  private readonly heightAt: (y: number) => number;
  private state: AnimState | null = null;
  private target: Phaser.Math.Vector2 | null = null;
  private speedFactor = 1;
  private breathT = Math.random() * 10;
  /**
   * Extra view transform used only by the opening shot: the intro's camera
   * dollies towards the trio, so they appear `k` times larger about `pivot`.
   */
  readonly dolly = { pivotX: 0, pivotY: 0, k: 1 };

  constructor(
    scene: Phaser.Scene,
    name: CharacterName,
    def: CharacterDef,
    heightAt: (y: number) => number,
  ) {
    this.name = name;
    this.def = def;
    this.heightAt = heightAt;
    this.pos = new Phaser.Math.Vector2(def.start.x, def.start.y);

    const walk = def.animations.walk_back;
    const key = `${name}_walk_back`;
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNames(name, {
          prefix: walk.prefix,
          start: 0,
          end: walk.count - 1,
          zeroPad: 2,
        }),
        frameRate: walk.fps,
        repeat: -1,
      });
    }
    this.sprite = scene.add.sprite(this.pos.x, this.pos.y, name, def.animations.idle_back.frame);
    this.setState('idle_back');
    this.layout(0);
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

  /** Move by a velocity (world units / second), used for keyboard control. */
  nudge(dx: number, dy: number, dt: number, clamp: (v: Phaser.Math.Vector2) => Phaser.Math.Vector2): void {
    this.target = null;
    const speed = this.bodyHeight * WALK_BODIES_PER_SEC;
    const next = new Phaser.Math.Vector2(this.pos.x + dx * speed * dt, this.pos.y + dy * speed * dt * 0.6);
    clamp(next);
    const moved = Phaser.Math.Distance.Between(this.pos.x, this.pos.y, next.x, next.y) > 0.01;
    this.pos.copy(next);
    this.setState(moved ? 'walk_back' : 'idle_back');
  }

  update(dt: number, keyboardDriven = false): void {
    if (this.target) {
      const speed = this.bodyHeight * WALK_BODIES_PER_SEC * this.speedFactor;
      const dx = this.target.x - this.pos.x;
      const dy = this.target.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = speed * dt;
      if (dist <= step) {
        this.pos.copy(this.target);
        this.target = null;
      } else {
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dy / dist) * step;
      }
      this.setState(this.target ? 'walk_back' : 'idle_back');
      this.sprite.anims.timeScale = this.speedFactor;
    } else if (!keyboardDriven) {
      this.setState('idle_back');
    }
    this.layout(dt);
  }

  private setState(state: AnimState): void {
    if (state === this.state && (state !== 'walk_back' || this.sprite.anims.isPlaying)) return;
    this.state = state;
    const a = this.def.animations;
    if (state === 'walk_back') {
      this.sprite.setOrigin(0.5, a.walk_back.originY);
      // start each walk at a random phase so the trio does not step in lock-step
      this.sprite.play({ key: `${this.name}_walk_back`, startFrame: Phaser.Math.Between(0, a.walk_back.count - 1) });
    } else {
      this.sprite.stop();
      this.sprite.setFrame(a.idle_back.frame);
      this.sprite.setOrigin(0.5, a.idle_back.originY);
    }
  }

  /** Position, depth-scale and gently "breathe" the sprite. */
  private layout(dt: number): void {
    const a = this.def.animations;
    const bodyPx = this.state === 'walk_back' ? a.walk_back.bodyPx : a.idle_back.bodyPx;
    const scale = this.bodyHeight / bodyPx;
    let sy = scale;
    if (this.state === 'idle_back') {
      this.breathT += dt;
      sy *= 1 + 0.008 * Math.sin(this.breathT * 2.1);
    }
    const { pivotX, pivotY, k } = this.dolly;
    this.sprite.setPosition(pivotX + (this.pos.x - pivotX) * k, pivotY + (this.pos.y - pivotY) * k);
    this.sprite.setScale(scale * k, sy * k);
    this.sprite.setDepth(this.pos.y);
  }
}
