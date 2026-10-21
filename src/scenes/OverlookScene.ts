import { Sound } from '../audio/Sound';
import Phaser from 'phaser';
import type { CharacterManifest, CharacterName, Rect, WorldLayout } from '../data/types';
import { Character } from '../world/Character';
import { Party } from '../world/Party';
import { Walkable } from '../world/Walkable';
import { Waypoint } from '../world/Waypoint';
import { GAME_EVENTS } from './BootScene';
import { GameState } from '../state/GameState';
import { chooseHero } from '../ui/HeroSelect';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { DialogueBox } from '../ui/DialogueBox';

type Phase = 'waiting' | 'zooming' | 'opening' | 'choose' | 'play' | 'leaving';

const OPENING_HOLD_MS = 700;
const OPENING_PULLBACK_MS = 3400;
/** Where the trail to the Digestive Kingdom starts: the right end of the ledge (world units). */
const TRAIL_START = { x: 598, y: 428 };

/**
 * The first playable place: the overlook above the Kingdoms. It is the intro's
 * last shot: when the video cuts here, the camera slowly closes in on the trio
 * while the intro's music ends, then pulls back to reveal the ledge and hands
 * control to the player.
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
  private nearLayer!: Phaser.GameObjects.Image;
  private movedOnce = false;
  private trail!: Waypoint;

  constructor() {
    super('Overlook');
  }

  create(data: { skipOpening?: boolean } = {}): void {
    // scenes are reused when restarted: reset per-run state
    this.phase = 'waiting';
    this.movedOnce = false;
    Sound.surface = 'gravel'; // a rocky ledge underfoot
    this.world = this.cache.json.get('world') as WorldLayout;
    const manifest = this.cache.json.get('characters') as CharacterManifest;
    const { far, near } = this.world.layers;

    this.add.image(far.x, far.y, far.image).setOrigin(0, 0).setDisplaySize(far.w, far.h).setDepth(-2e6);
    // drawn behind the characters: it is the ground they stand on
    this.nearLayer = this.add.image(near.x, near.y, near.image).setOrigin(0, 0).setDepth(-1e6);
    this.walkable = new Walkable(this.world.walkable);

    const horizon = this.world.horizonY;
    const make = (name: CharacterName) => {
      const def = manifest.characters[name];
      // ground-plane perspective: apparent height is proportional to distance below the horizon
      const heightAt = (y: number) => (def.start.bodyHeight * (y - horizon)) / (def.start.y - horizon);
      // ground foreshortening grows linearly below the horizon (pinhole camera); ~0.35 on the ledge
      const foreshorten = (y: number) => (0.35 * (y - horizon)) / (444 - horizon);
      const rel = def.start.bodyHeight / manifest.characters.boy.start.bodyHeight;
      return new Character(this, name, def, heightAt, foreshorten, rel);
    };
    this.characters = { boy: make('boy'), girl: make('girl'), fox: make('fox') };
    this.makeParty();

    // the shot opens wide on the whole overlook; the close framing (endFrameRect) is where it closes in to
    const { pivot } = this.world.endFrameParty;
    for (const c of this.party.members) {
      c.dolly.pivotX = pivot[0];
      c.dolly.pivotY = pivot[1];
    }
    this.setView(this.world.overviewRect, 1);

    const trailHeight = this.characters.boy.bodyHeight * ((TRAIL_START.y - horizon) / (this.characters.boy.pos.y - horizon));
    this.trail = new Waypoint(this, TRAIL_START.x, TRAIL_START.y, trailHeight, 'To the\nDigestive Kingdom');

    this.debug = this.add.graphics().setDepth(1e6).setVisible(false);
    this.walkable.draw(this.debug);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D',
    }) as typeof this.keys;
    kb.on('keydown-G', () => this.debug.setVisible(!this.debug.visible));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    const onResize = () => this.applyView(true);
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));

    if (data.skipOpening) {
      this.setView(this.world.overviewRect, 1);
      this.phase = 'play';
      this.movedOnce = true;
      this.trail.show(this);
      this.cameras.main.fadeIn(600, 11, 21, 51);
      this.game.events.emit(GAME_EVENTS.resumed);
      return;
    }
    this.game.events.once(GAME_EVENTS.introCut, (secondsLeft: number) => this.closeIn(secondsLeft));
    this.game.events.once(GAME_EVENTS.introDone, () => this.startOpening());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GAME_EVENTS.introCut);
      this.game.events.off(GAME_EVENTS.introDone);
    });
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
      if (this.trail.reached(this.party.leader.pos.x, this.party.leader.pos.y)) this.leave();
    } else if (this.phase === 'leaving') {
      this.party.update(dt, null);
    } else {
      for (const c of this.party.members) c.update(dt);
    }
    this.applyView(false, dt);
  }

  private async beforeChoice(): Promise<void> {
    try {
      const runner = await DialogueRunner.load('overlook', 'walid');
      const box = new DialogueBox('walid');
      await runner.run('before_choice', box);
      box.destroy();
    } catch (e) {
      console.warn('overlook dialogue unavailable', e);
    }
  }

  /** The chosen hero leads; the other kid and the fox follow in the intro's formation. */
  private makeParty(): void {
    const c = this.characters;
    this.party = new Party(c[GameState.leaderName], [c[GameState.buddyName], c.fox], this.walkable);
  }

  /**
   * The intro's last shot: from the wide view, close in on the trio for the rest
   * of the intro's music (the trio grows a little faster than the land behind,
   * as when a camera moves in).
   */
  private closeIn(seconds: number): void {
    if (this.phase !== 'waiting') return;
    this.phase = 'zooming';
    this.zoomFromTo(this.world.overviewRect, 1, this.world.endFrameRect, this.world.endFrameParty.scale, Math.max(0.5, seconds) * 1000, 'Sine.easeInOut');
  }

  private zoomTween?: Phaser.Tweens.Tween;

  private zoomFromTo(from: Rect, k0: number, to: Rect, k1: number, ms: number, ease: string, done?: () => void): void {
    this.zoomTween?.stop();
    this.zoomTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      ease,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        // zoom changes multiplicatively, so interpolate the framing size geometrically
        const w = from.w * Math.pow(to.w / from.w, t);
        const h = from.h * Math.pow(to.h / from.h, t);
        const cx = Phaser.Math.Linear(from.x + from.w / 2, to.x + to.w / 2, t);
        const cy = Phaser.Math.Linear(from.y + from.h / 2, to.y + to.h / 2, t);
        this.setView({ x: cx - w / 2, y: cy - h / 2, w, h }, Phaser.Math.Linear(k0, k1, t));
      },
      onComplete: () => done?.(),
    });
  }

  /** The music has ended (or the intro was skipped): pull back to the whole ledge, then play. */
  private startOpening(): void {
    if (this.phase !== 'waiting' && this.phase !== 'zooming') return;
    const closedIn = this.phase === 'zooming';
    this.zoomTween?.stop();
    this.phase = 'opening';
    const from = { ...this.view.rect };
    const k0 = this.view.k;
    const to = this.world.overviewRect;
    this.time.delayedCall(closedIn ? OPENING_HOLD_MS : 0, () => {
      this.zoomFromTo(from, k0, to, 1, closedIn ? OPENING_PULLBACK_MS : 1, 'Sine.easeInOut', async () => {
        this.camCenter.set(to.x + to.w / 2, to.y + to.h / 2);
        // the child picks who leads the way, then plays
        this.phase = 'choose';
        // a short exchange first, so choosing the leader is part of the story
        await this.beforeChoice();
        GameState.hero = await chooseHero();
        this.makeParty();
        this.phase = 'play';
        this.trail.show(this);
        this.game.events.emit(GAME_EVENTS.openingDone);
      });
    });
  }

  /** The trio sets off along the trail; fade to the next chapter. */
  private leave(): void {
    this.phase = 'leaving';
    this.trail.hide();
    this.game.events.emit(GAME_EVENTS.leaving);
    // walk on past the end of the ledge and down the trail, out of view
    this.party.leader.walkTo(TRAIL_START.x + 70, TRAIL_START.y + 45);
    this.party.unbounded = true;
    this.cameras.main.fadeOut(1400, 11, 21, 51);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Chapter', {
        title: 'Chapter 1',
        subtitle: 'The Road to the Mouth Gate',
        next: { scene: 'World', data: { place: 'road' } },
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
    // the near ground layer sits at the trio's depth, so it gets the same dolly
    const near = this.world.layers.near;
    const [px, py] = this.world.endFrameParty.pivot;
    this.nearLayer.setPosition(px + (near.x - px) * k, py + (near.y - py) * k);
    this.nearLayer.setDisplaySize(near.w * k, near.h * k);
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
      // follow the middle of the group so nobody walks off a narrow screen
      const members = this.party.members;
      const groupX = members.reduce((sum, c) => sum + c.pos.x, 0) / members.length;
      const tx = Phaser.Math.Clamp(groupX, r.x + visW / 2, r.x + r.w - visW / 2);
      const ty = Phaser.Math.Clamp(this.party.leader.pos.y - this.party.leader.bodyHeight, r.y + visH / 2, r.y + r.h - visH / 2);
      const a = snap ? 1 : 1 - Math.exp(-dt * 3);
      this.camCenter.x += (tx - this.camCenter.x) * a;
      this.camCenter.y += (ty - this.camCenter.y) * a;
    }
    cam.centerOn(this.camCenter.x, this.camCenter.y);
  }
}
