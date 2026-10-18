import Phaser from 'phaser';
import type { CharacterManifest, CharacterName, Rect, WorldLayout } from '../data/types';
import { Character } from '../world/Character';
import { Party } from '../world/Party';
import { Walkable } from '../world/Walkable';
import { GAME_EVENTS } from './BootScene';

type Phase = 'waiting' | 'opening' | 'play';

const OPENING_HOLD_MS = 700;
const OPENING_PULLBACK_MS = 3400;

/**
 * The first playable place: the overlook above the Kingdoms where the intro
 * video ends. The scene starts framed exactly like the video's last frame,
 * pulls back to reveal the ledge, then hands control to the player.
 */
export class OverlookScene extends Phaser.Scene {
  private world!: WorldLayout;
  private walkable!: Walkable;
  private characters!: Record<CharacterName, Character>;
  private party!: Party;
  private phase: Phase = 'waiting';
  /** View currently framed by the camera (world units), plus the trio's dolly factor. */
  private view = { rect: { x: 0, y: 0, w: 1, h: 1 } as Rect, k: 1 };
  private camCenter = new Phaser.Math.Vector2();
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private debug!: Phaser.GameObjects.Graphics;
  private movedOnce = false;

  constructor() {
    super('Overlook');
  }

  create(): void {
    this.world = this.cache.json.get('world') as WorldLayout;
    const manifest = this.cache.json.get('characters') as CharacterManifest;
    const { plate } = this.world;

    this.add.image(plate.x, plate.y, plate.image).setOrigin(0, 0).setDisplaySize(plate.w, plate.h).setDepth(-1e6);
    this.walkable = new Walkable(this.world.walkable);

    const horizon = this.world.horizonY;
    const make = (name: CharacterName) => {
      const def = manifest.characters[name];
      // ground-plane perspective: apparent height is proportional to distance below the horizon
      const heightAt = (y: number) => (def.start.bodyHeight * (y - horizon)) / (def.start.y - horizon);
      return new Character(this, name, def, heightAt);
    };
    this.characters = { boy: make('boy'), girl: make('girl'), fox: make('fox') };
    this.party = new Party(this.characters.boy, [this.characters.girl, this.characters.fox], this.walkable);

    // Opening framing = the intro video's last frame.
    const { pivot, scale } = this.world.endFrameParty;
    for (const c of this.party.members) {
      c.dolly.pivotX = pivot[0];
      c.dolly.pivotY = pivot[1];
    }
    this.setView(this.world.endFrameRect, scale);

    this.debug = this.add.graphics().setDepth(1e6).setVisible(false);
    this.walkable.draw(this.debug);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D',
    }) as typeof this.keys;
    kb.on('keydown-G', () => this.debug.setVisible(!this.debug.visible));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.scale.on('resize', () => this.applyView(true));
    this.game.events.once(GAME_EVENTS.introDone, () => this.startOpening());
    this.game.events.emit(GAME_EVENTS.overlookReady);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.phase === 'play') {
      const k = this.keys;
      const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      if ((x || y) && !this.movedOnce) this.noteFirstMove();
      this.party.update(dt, { x, y });
    } else {
      for (const c of this.party.members) c.update(dt);
    }
    this.applyView(false, dt);
  }

  private startOpening(): void {
    if (this.phase !== 'waiting') return;
    this.phase = 'opening';
    const from = { ...this.world.endFrameRect };
    const to = this.world.overviewRect;
    const k0 = this.world.endFrameParty.scale;
    this.time.delayedCall(OPENING_HOLD_MS, () => {
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: OPENING_PULLBACK_MS,
        ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          // zoom changes multiplicatively, so interpolate the framing size geometrically
          const w = from.w * Math.pow(to.w / from.w, t);
          const h = from.h * Math.pow(to.h / from.h, t);
          const cx = Phaser.Math.Linear(from.x + from.w / 2, to.x + to.w / 2, t);
          const cy = Phaser.Math.Linear(from.y + from.h / 2, to.y + to.h / 2, t);
          this.setView({ x: cx - w / 2, y: cy - h / 2, w, h }, Phaser.Math.Linear(k0, 1, t));
        },
        onComplete: () => {
          this.phase = 'play';
          this.camCenter.set(to.x + to.w / 2, to.y + to.h / 2);
          this.game.events.emit(GAME_EVENTS.openingDone);
        },
      });
    });
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'play') return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const target = this.party.moveLeaderTo(w.x, w.y);
    this.showMarker(target.x, target.y);
    this.noteFirstMove();
  }

  private noteFirstMove(): void {
    if (this.movedOnce) return;
    this.movedOnce = true;
    this.game.events.emit(GAME_EVENTS.firstMove);
  }

  private showMarker(x: number, y: number): void {
    const h = this.party.leader.bodyHeight;
    const ring = this.add.ellipse(x, y, h * 0.42, h * 0.13).setStrokeStyle(2, 0xffe29a, 0.95).setDepth(y - 0.5);
    ring.setFillStyle(0xffe29a, 0.18);
    this.tweens.add({ targets: ring, scale: 1.35, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }

  private setView(rect: Rect, k: number): void {
    this.view.rect = rect;
    this.view.k = k;
    for (const c of this.party.members) c.dolly.k = k;
    this.camCenter.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
    this.applyView(true);
  }

  /**
   * Frame the camera so the view rect covers the screen (CSS object-fit: cover,
   * same as the intro video). In play, the camera follows the leader sideways
   * when the screen is narrower than the scene (portrait phones, tablets).
   */
  private applyView(snap: boolean, dt = 0): void {
    const cam = this.cameras.main;
    const r = this.view.rect;
    const zoom = Math.max(cam.width / r.w, cam.height / r.h);
    cam.setZoom(zoom);

    if (this.phase === 'play') {
      const visW = cam.width / zoom;
      const visH = cam.height / zoom;
      const tx = Phaser.Math.Clamp(this.party.leader.pos.x, r.x + visW / 2, r.x + r.w - visW / 2);
      const ty = Phaser.Math.Clamp(this.party.leader.pos.y - this.party.leader.bodyHeight, r.y + visH / 2, r.y + r.h - visH / 2);
      const a = snap ? 1 : 1 - Math.exp(-dt * 3);
      this.camCenter.x += (tx - this.camCenter.x) * a;
      this.camCenter.y += (ty - this.camCenter.y) * a;
    }
    cam.centerOn(this.camCenter.x, this.camCenter.y);
  }
}
