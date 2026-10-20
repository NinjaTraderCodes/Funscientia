import Phaser from 'phaser';
import type { CharacterManifest, CharacterName } from '../data/types';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { asset } from '../assetUrl';
import { GameState } from '../state/GameState';
import { DialogueBox } from '../ui/DialogueBox';
import { toast } from '../ui/Toast';
import { Character } from '../world/Character';
import { Party } from '../world/Party';
import { Walkable } from '../world/Walkable';
import { Waypoint } from '../world/Waypoint';

/** A place file written by tools/pipeline/build_maps.py from a Tiled map. Units: master-image pixels. */
interface Place {
  name: string;
  title: string;
  image: string;
  width: number;
  height: number;
  dialogue: string;
  horizonY: number;
  pathWidthAtBottom: number;
  bodyPerPathWidth: number;
  /** Screen-vertical / horizontal size of a ground unit at the bottom of the picture. */
  foreshortenAtBottom?: number;
  arrivalKnot?: string;
  walkable: [number, number][];
  spawn: { x: number; y: number };
  hotspots: { name: string; x: number; y: number; knot: string; label: string; radius: number; foxTo?: string }[];
  npcs: { name: string; x: number; y: number; who: string }[];
}

interface Hotspot {
  def: Place['hotspots'][number];
  marker: Waypoint;
  done: boolean;
  inside: boolean;
}

type Phase = 'intro' | 'play' | 'talk' | 'leaving';

const DISCOVERIES: Record<string, string> = {
  saliva_smell: 'When you smell food, your mouth makes saliva to get ready for eating.',
};

/**
 * A walkable place in the world, fully described by data: a Tiled map
 * (background, walkable area, spawn, hotspots, NPCs) and an ink dialogue file.
 * The chosen hero leads; the other kid and the fox follow.
 */
export class WorldScene extends Phaser.Scene {
  private placeName = 'road';
  private place!: Place;
  private party!: Party;
  private chars!: Record<CharacterName, Character>;
  private walkable!: Walkable;
  private hotspots: Hotspot[] = [];
  private dialogue!: DialogueRunner;
  private box!: DialogueBox;
  private phase: Phase = 'intro';
  private camCenter = new Phaser.Math.Vector2();
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private debug!: Phaser.GameObjects.Graphics;
  /** Extra camera zoom towards a point (e.g. while talking to the Tooth Guardian). */
  private focus = { k: 1, x: 0, y: 0 };

  constructor() {
    super('World');
  }

  init(data: { place?: string }): void {
    this.placeName = data.place ?? 'road';
    this.hotspots = [];
    this.phase = 'intro';
  }

  preload(): void {
    this.load.json(`place:${this.placeName}`, asset(`world/${this.placeName}.place.json`));
    this.load.once('filecomplete-json-place:' + this.placeName, () => {
      const p = this.cache.json.get(`place:${this.placeName}`) as Place;
      this.load.image(p.image, asset(`${p.image}.webp`));
      for (const n of p.npcs) this.load.image(`npc_${n.who}`, asset(`world/npc_${n.who}.webp`));
    });
  }

  async create(): Promise<void> {
    this.place = this.cache.json.get(`place:${this.placeName}`) as Place;
    const P = this.place;
    this.add.image(0, 0, P.image).setOrigin(0, 0).setDisplaySize(P.width, P.height).setDepth(-1e6);
    this.walkable = new Walkable(P.walkable);

    // perspective: the path's width shrinks linearly towards the horizon; kids are a fixed share of it
    const kidAt = (y: number) =>
      P.bodyPerPathWidth * P.pathWidthAtBottom * Math.max(0.05, (y - P.horizonY) / (P.height - P.horizonY));
    const manifest = this.cache.json.get('characters') as CharacterManifest;
    const ref = manifest.characters.boy.start.bodyHeight;
    const make = (n: CharacterName) => {
      const def = manifest.characters[n];
      const rel = def.start.bodyHeight / ref;
      // ground foreshortening grows linearly below the horizon (pinhole camera)
      const fb = P.foreshortenAtBottom ?? 0.45;
      const foreshorten = (y: number) => (fb * (y - P.horizonY)) / (P.height - P.horizonY);
      return new Character(this, n, def, (y) => kidAt(y) * rel, foreshorten, rel);
    };
    this.chars = { boy: make('boy'), girl: make('girl'), fox: make('fox') };

    // formation as in the intro: Nesma on the left, the fennec between, Walid on the right
    const leader = this.chars[GameState.leaderName];
    const h = kidAt(P.spawn.y);
    const slots: Record<CharacterName, number> = { girl: -0.85, fox: -0.42, boy: 0 };
    const base = P.spawn.x - slots[GameState.leaderName] * h;
    for (const n of ['girl', 'fox', 'boy'] as CharacterName[]) {
      const p = this.walkable.clamp(base + slots[n] * h, P.spawn.y - (n === 'fox' ? 0.02 * h : 0));
      this.chars[n].teleport(p.x, p.y);
    }
    this.party = new Party(leader, [this.chars[GameState.buddyName], this.chars.fox], this.walkable);

    for (const n of P.npcs) {
      const img = this.add.image(n.x, n.y, `npc_${n.who}`).setOrigin(0.5, 1).setDepth(n.y);
      const nh = kidAt(n.y) * 1.05;
      img.setScale(nh / img.height);
      this.tweens.add({ targets: img, y: n.y - nh * 0.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // labels stay readable at any distance: at least ~18 screen px
    this.applyView(true);
    const minLabel = 18 / this.cameras.main.zoom * Math.min(window.devicePixelRatio || 1, 2);
    for (const def of P.hotspots) {
      const marker = new Waypoint(this, def.x, def.y, kidAt(def.y), def.label, Math.max(kidAt(def.y) * 0.1, minLabel));
      this.hotspots.push({ def, marker, done: false, inside: false });
    }

    this.debug = this.add.graphics().setDepth(1e6).setVisible(false);
    this.walkable.draw(this.debug);
    for (const s of P.hotspots) this.debug.strokeCircle(s.x, s.y, s.radius);
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D' }) as typeof this.keys;
    kb.on('keydown-G', () => this.debug.setVisible(!this.debug.visible));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    const onResize = () => this.applyView(true);
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));

    this.camCenter.set(P.width / 2, P.height);
    this.applyView(true);
    this.cameras.main.fadeIn(700, 11, 21, 51);

    this.box = new DialogueBox(GameState.hero ?? 'walid');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.box.close());
    this.dialogue = await DialogueRunner.load(P.dialogue, GameState.hero ?? 'walid');
    this.time.delayedCall(900, () => this.talk(P.arrivalKnot ?? 'arrival').then(() => this.revealHotspots()));
  }

  update(_t: number, deltaMs: number): void {
    if (!this.party) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.phase === 'play') {
      const k = this.keys;
      const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      this.party.update(dt, { x, y });
      this.checkHotspots();
    } else {
      this.party.update(dt, null);
    }
    this.applyView(false, dt);
  }

  private revealHotspots(): void {
    for (const s of this.hotspots) s.marker.show(this);
  }

  private checkHotspots(): void {
    const L = this.party.leader.pos;
    for (const s of this.hotspots) {
      const inside = Phaser.Math.Distance.Between(L.x, L.y, s.def.x, s.def.y) < s.def.radius;
      if (inside && !s.inside && (!s.done || s.def.knot === 'gate')) void this.trigger(s);
      s.inside = inside;
    }
  }

  private async trigger(s: Hotspot): Promise<void> {
    this.party.leader.stop();
    const fox = this.chars.fox;
    if (s.def.foxTo) {
      const [fx, fy] = s.def.foxTo.split(',').map(Number);
      this.party.release(fox);
      fox.walkTo(fx, fy, 1.3);
    }
    const close = s.def.knot === 'gate';
    if (close) await this.zoomTo(1.7, s.def.x, s.def.y - kidAtGate(this.place, s.def.y));
    const result = await this.talk(s.def.knot);
    if (s.def.foxTo) this.party.release(fox, false);
    if (close && !result.actions.includes('enter_mouth')) void this.zoomTo(1, s.def.x, s.def.y);
    s.done = true;
    if (s.def.knot !== 'gate') s.marker.hide();
    for (const d of result.discoveries) {
      if (GameState.discover(d)) toast('Discovery!', DISCOVERIES[d] ?? d);
    }
    if (result.actions.includes('enter_mouth')) this.enterGate(s);
  }

  private async talk(knot: string) {
    this.phase = 'talk';
    const result = await this.dialogue.run(knot, this.box);
    const prediction = this.dialogue.variable('predict_saliva');
    if (typeof prediction === 'string' && prediction) GameState.predict('saliva', prediction);
    if (this.phase === 'talk') this.phase = 'play';
    return result;
  }

  private zoomTo(k: number, x: number, y: number): Promise<void> {
    this.focus.x = x;
    this.focus.y = y;
    return new Promise((resolve) =>
      this.tweens.add({ targets: this.focus, k, duration: 900, ease: 'Sine.easeInOut', onComplete: () => resolve() }),
    );
  }

  private enterGate(s: Hotspot): void {
    this.phase = 'leaving';
    for (const h of this.hotspots) h.marker.hide();
    this.party.leader.walkTo(s.def.x + 20, s.def.y - 25, 0.8);
    const cam = this.cameras.main;
    this.tweens.add({ targets: cam, zoom: cam.zoom * 1.8, duration: 1800, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: this.camCenter, x: s.def.x + 30, y: s.def.y - kidAtGate(this.place, s.def.y), duration: 1800, ease: 'Sine.easeIn' });
    cam.fadeOut(1800, 11, 21, 51);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('Chapter', {
        title: 'Chapter 1',
        subtitle: 'Mouth Mission',
        note: 'The Mouth mini-game is being built — come back soon!',
        back: { scene: 'World', label: '‹ Back to the road', data: { place: this.placeName } },
      }),
    );
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'play') return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    // tapping near a hotspot walks to it
    const near = this.hotspots.find((s) => (!s.done || s.def.knot === 'gate') && Phaser.Math.Distance.Between(w.x, w.y, s.def.x, s.def.y) < s.def.radius * 2.2);
    const target = this.party.moveLeaderTo(near ? near.def.x : w.x, near ? near.def.y : w.y);
    const h = this.party.leader.bodyHeight;
    const ring = this.add.ellipse(target.x, target.y, h * 0.42, h * 0.13).setStrokeStyle(2, 0xffe29a, 0.95).setFillStyle(0xffe29a, 0.18).setDepth(target.y - 0.5);
    this.tweens.add({ targets: ring, scale: 1.35, alpha: 0, duration: 650, onComplete: () => ring.destroy() });
  }

  /** Cover the screen with the place; follow the group within the picture. */
  private applyView(snap: boolean, dt = 0): void {
    const cam = this.cameras.main;
    const P = this.place;
    if (this.phase === 'leaving') {
      cam.centerOn(this.camCenter.x, this.camCenter.y);
      return;
    }
    const zoom = Math.max(cam.width / P.width, cam.height / P.height) * this.focus.k;
    cam.setZoom(zoom);
    const visW = cam.width / zoom;
    const visH = cam.height / zoom;
    const m = this.party.members;
    const f = (this.focus.k - 1) / 0.7; // 0..1 blend from following the group to the focus point
    const gx = m.reduce((s, c) => s + c.pos.x, 0) / m.length;
    const fy = this.party.leader.pos.y - this.party.leader.bodyHeight * 0.8;
    const tx = Phaser.Math.Clamp(Phaser.Math.Linear(gx, this.focus.x, Math.min(1, f)), visW / 2, P.width - visW / 2);
    const ty = Phaser.Math.Clamp(Phaser.Math.Linear(fy, this.focus.y, Math.min(1, f)), visH / 2, P.height - visH / 2);
    const a = snap ? 1 : 1 - Math.exp(-dt * 3);
    this.camCenter.x += (tx - this.camCenter.x) * a;
    this.camCenter.y += (ty - this.camCenter.y) * a;
    cam.centerOn(this.camCenter.x, this.camCenter.y);
  }
}

function kidAtGate(P: Place, y: number): number {
  return P.bodyPerPathWidth * P.pathWidthAtBottom * ((y - P.horizonY) / (P.height - P.horizonY)) * 0.5;
}
