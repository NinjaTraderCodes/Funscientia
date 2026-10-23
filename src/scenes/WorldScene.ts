import { Peristalsis } from '../world/Peristalsis';
import { t, type Key } from '../i18n/i18n';
import { discoveryText } from '../state/discoveries';
import { GAME_EVENTS } from './BootScene';
import { chooseAvatar } from '../ui/AvatarSelect';
import Phaser from 'phaser';
import type { CharacterManifest, CharacterName } from '../data/types';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { asset } from '../assetUrl';
import { GameState } from '../state/GameState';
import { DialogueBox } from '../ui/DialogueBox';
import { toast } from '../ui/Toast';
import { Sound } from '../audio/Sound';
import { Character } from '../world/Character';
import { Party } from '../world/Party';
import { Walkable } from '../world/Walkable';
import { Waypoint } from '../world/Waypoint';

/** A place file written by tools/pipeline/build_maps.py from a Tiled map. Units: master-image pixels. */
interface Place {
  name: string;
  title: string;
  image: string;
  /** Parallax layers, back to front; `front` layers are drawn over the characters. */
  layers?: { image: string; parallax: number; front: boolean }[];
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
  /** `to` makes a hotspot an exit to another place (a new camera shot). */
  hotspots: { name: string; x: number; y: number; knot: string; label: string; radius: number; foxTo?: string; to?: string }[];
  npcs: { name: string; x: number; y: number; who: string }[];
  props?: { name: string; x: number; y: number; prop: string; height?: number }[];
  /** Hotspot the camera eases towards as the party gets closer (default: "gate"). */
  goal?: string;
  /** Behind the gate: this scene (default Mouth), introduced by a chapter card (phrasebook keys). */
  next?: string;
  nextChapter?: string;
  nextTitle?: string;
  /** Peristalsis waves down a tunnel: where it vanishes and where its nearest ring is ("x,y"). */
  waves?: boolean;
  waveFar?: string;
  waveNear?: string;
  waveRadius?: number;
  /** "x,y;x,y;..." the trio's bolus rolls along, ahead of them, to the gate. */
  bolusPath?: string;
}

interface Hotspot {
  def: Place['hotspots'][number];
  marker: Waypoint;
  done: boolean;
  inside: boolean;
}

type Phase = 'intro' | 'play' | 'talk' | 'cutting' | 'leaving';


/**
 * A walkable place in the world, fully described by data: a Tiled map
 * (background, walkable area, spawn, hotspots, NPCs) and an ink dialogue file.
 * The chosen hero leads; the other kid and the fox follow.
 */
export class WorldScene extends Phaser.Scene {
  private placeName = 'road';
  private place!: Place;
  /** Peristalsis waves and the rolling bolus (the esophagus). */
  private peristalsis?: Peristalsis;
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
  /** Parallax layers and their scroll factors (1 = moves with the ground). */
  private parallax: { img: Phaser.GameObjects.Image; factor: number }[] = [];
  /** Extra zoom the camera eases into as the party approaches the goal. */
  private intentK = 1;
  /** Opening establishing shot: 1 = the whole picture, 0 = following the party. */
  private establish = { t: 0 };
  /** Arrived through a "new shot" cut: cross-fade in from the previous shot's last frame. */
  private cutIn = false;
  /** Extra camera push used by the "new shot" transition (1 = none). */
  private push = { k: 1 };
  /** Kid body height at the spawn point: the camera keeps the trio's on-screen size steady relative to it. */
  private spawnH = 1;
  private cutting = false;

  constructor() {
    super('World');
  }

  init(data: { place?: string; cut?: boolean }): void {
    this.placeName = data.place ?? 'road';
    GameState.place = this.placeName; // continue from here (online save)
    this.cutIn = !!data.cut;
    this.hotspots = [];
    this.parallax = [];
    this.phase = 'intro';
    this.intentK = 1;
    this.push.k = 1;
    this.cutting = false;
    this.peristalsis = undefined;
  }

  preload(): void {
    this.load.json(`place:${this.placeName}`, asset(`world/${this.placeName}.place.json`));
    this.load.once('filecomplete-json-place:' + this.placeName, () => {
      const p = this.cache.json.get(`place:${this.placeName}`) as Place;
      for (const l of p.layers ?? [{ image: p.image }]) this.load.image(l.image, asset(`${l.image}.webp`));
      for (const n of p.npcs) this.load.image(`npc_${n.who}`, asset(`world/npc_${n.who}.webp`));
      for (const pr of p.props ?? []) this.load.image(`prop_${pr.prop}`, asset(`world/prop_${pr.prop}.webp`));
      if (p.bolusPath && !this.textures.exists('m_bolus')) this.load.image('m_bolus', asset('mouth/bolus.webp'));
    });
  }

  async create(): Promise<void> {
    Sound.surface = 'stone'; // the paved road
    this.place = this.cache.json.get(`place:${this.placeName}`) as Place;
    const P = this.place;
    const layers = P.layers ?? [{ image: P.image, parallax: 1, front: false }];
    layers.forEach((l, i) => {
      const img = this.add.image(0, 0, l.image).setOrigin(0, 0).setDisplaySize(P.width, P.height);
      // back layers behind everything; front layers over the characters but under labels and UI
      img.setDepth(l.front ? 5e4 + i : -1e6 + i);
      this.parallax.push({ img, factor: l.parallax });
    });
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
    this.spawnH = h;
    const slots: Record<CharacterName, number> = { girl: -0.85, fox: -0.42, boy: 0 };
    const base = P.spawn.x - slots[GameState.leaderName] * h;
    for (const n of ['girl', 'fox', 'boy'] as CharacterName[]) {
      const p = this.walkable.clamp(base + slots[n] * h, P.spawn.y - (n === 'fox' ? 0.02 * h : 0));
      this.chars[n].teleport(p.x, p.y);
    }
    this.party = new Party(leader, GameState.followerNames.map((n) => this.chars[n]), this.walkable);
    this.game.events.on(GAME_EVENTS.editProfile, this.onEditProfile, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(GAME_EVENTS.editProfile, this.onEditProfile, this));

    for (const n of P.npcs) {
      const img = this.add.image(n.x, n.y, `npc_${n.who}`).setOrigin(0.5, 1).setDepth(n.y);
      const nh = kidAt(n.y) * 1.05;
      img.setScale(nh / img.height);
      this.tweens.add({ targets: img, y: n.y - nh * 0.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    for (const pr of P.props ?? []) {
      const img = this.add.image(pr.x, pr.y, `prop_${pr.prop}`).setOrigin(0.5, 0.97).setDepth(pr.y);
      img.setScale((kidAt(pr.y) * (pr.height ?? 1.3)) / img.height);
    }
    this.ambient();
    if (P.waves) {
      const pt = (s: string | undefined, d: [number, number]) => (s ? s.split(',').map(Number) : d) as [number, number];
      const [fx, fy] = pt(P.waveFar, [P.width / 2, P.horizonY]);
      const [nx, ny] = pt(P.waveNear, [P.width / 2, P.height]);
      this.peristalsis = new Peristalsis(this, {
        far: { x: fx, y: fy },
        near: { x: nx, y: ny },
        nearRadius: P.waveRadius ?? P.width * 0.85,
        bolusPath: P.bolusPath?.split(';').map((q) => q.split(',').map(Number) as [number, number]),
        kidAt,
      });
    }
    // labels stay readable at any distance: at least ~18 screen px
    this.applyView(true);
    const minLabel = 18 / this.cameras.main.zoom * Math.min(window.devicePixelRatio || 1, 2);
    for (const def of P.hotspots) {
      // a label starting with @ is a phrasebook key (shown in the player's language)
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

    // establishing shot: the whole place while the arrival talk plays, then glide down to the party
    this.establish.t = 1;
    this.camCenter.set(P.width / 2, P.height);
    this.applyView(true);
    if (this.cutIn) {
      // open a little wide and settle in, under the previous shot's fading last frame
      this.push.k = 0.9;
      this.tweens.add({ targets: this.push, k: 1, duration: 1400, ease: 'Sine.easeOut' });
      fadeOutSnapshot();
    } else this.cameras.main.fadeIn(700, 11, 21, 51);
    const hold = this.cutIn ? 900 : 1200;

    this.box = new DialogueBox(GameState.storyLeader);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.box.destroy());
    this.dialogue = await DialogueRunner.load(P.dialogue, GameState.storyLeader);
    this.time.delayedCall(hold, async () => {
      await this.talk(P.arrivalKnot ?? 'arrival');
      this.tweens.add({ targets: this.establish, t: 0, duration: this.cutIn ? 1900 : 2600, ease: 'Sine.easeInOut' });
      this.revealHotspots();
    });
  }

  update(_t: number, deltaMs: number): void {
    if (!this.party) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.peristalsis?.update(dt);
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
    const members = this.party.members;
    for (const s of this.hotspots) {
      // whoever reaches the spot first (leader, friend or fennec) starts it
      const inside = members.some((c) => Phaser.Math.Distance.Between(c.pos.x, c.pos.y, s.def.x, s.def.y) < s.def.radius * 1.15);
      if (inside && !s.inside && (!s.done || s.def.knot === 'gate' || s.def.to)) void this.trigger(s);
      s.inside = inside;
    }
  }

  /** The profile badge: change name or avatar while walking about; a new avatar takes the lead on the spot. */
  private async onEditProfile(): Promise<void> {
    if (this.phase !== 'play') return;
    this.phase = 'talk'; // nobody walks while the editor is open
    for (const m of this.party.members) m.stop();
    const before = GameState.hero;
    const pick = await chooseAvatar({ avatar: GameState.hero ?? 'walid', name: GameState.playerName });
    if (pick) {
      GameState.hero = pick.avatar;
      GameState.playerName = pick.name;
      if (pick.avatar !== before) {
        this.party = new Party(this.chars[GameState.leaderName], GameState.followerNames.map((n) => this.chars[n]), this.walkable);
        this.box.destroy();
        this.box = new DialogueBox(GameState.storyLeader);
      }
      this.game.events.emit(GAME_EVENTS.profileChanged);
    }
    if (this.phase === 'talk') this.phase = 'play';
  }

  private async trigger(s: Hotspot): Promise<void> {
    if (s.def.to) return this.cutTo(s.def.to);
    Sound.chime();
    this.party.leader.stop();
    const fox = this.chars.fox;
    // the fennec runs ahead to what it smells (unless the child is the fennec)
    const foxRuns = !!s.def.foxTo && this.party.leader !== fox;
    if (foxRuns) {
      const [fx, fy] = s.def.foxTo!.split(',').map(Number);
      this.party.release(fox);
      fox.walkTo(fx, fy, 1.3);
    }
    const close = s.def.knot === 'gate';
    if (close) await this.zoomTo(1.3, s.def.x, s.def.y - kidAtGate(this.place, s.def.y));
    const result = await this.talk(s.def.knot);
    if (foxRuns) this.party.release(fox, false);
    const enter = result.actions.includes('enter_mouth') || result.actions.includes('enter');
    if (close && !enter) void this.zoomTo(1, s.def.x, s.def.y);
    s.done = true;
    if (s.def.knot !== 'gate') s.marker.hide();
    for (const d of result.discoveries) {
      if (GameState.discover(d)) {
        Sound.chime();
        toast(t('ui.discovery'), discoveryText(d));
      }
    }
    if (enter) this.enterGate(s);
  }

  private async talk(knot: string) {
    this.phase = 'talk';
    const result = await this.dialogue.run(knot, this.box);
    // the predictions asked so far on the road (ink variables predict_<question>)
    for (const q of ['saliva', 'pepsin']) {
      const answer = this.dialogue.variable(`predict_${q}`);
      if (typeof answer === 'string' && answer) GameState.predict(q, answer);
    }
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

  /**
   * "New shot": the trio walks on while the camera pushes in towards them, then
   * the last frame cross-fades into the next place, which settles in from a
   * slightly wider framing - like a film cut that follows the travellers.
   */
  private cutTo(place: string): void {
    if (this.phase === 'leaving' || this.cutting) return;
    this.cutting = true;
    for (const h of this.hotspots) h.marker.hide();
    const L = this.party.leader;
    const v = L.velocity.length() > 1 ? L.velocity.clone().normalize() : new Phaser.Math.Vector2(0.4, -0.9);
    L.walkTo(L.pos.x + v.x * L.bodyHeight * 1.2, L.pos.y + v.y * L.bodyHeight * 0.8);
    this.party.unbounded = true;
    this.phase = 'cutting';
    this.tweens.add({
      targets: this.push,
      k: 1.32,
      duration: 950,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.game.renderer.snapshot((image) => {
          showSnapshot(image as HTMLImageElement);
          this.scene.start('World', { place, cut: true });
        });
      },
    });
  }

  private enterGate(s: Hotspot): void {
    this.phase = 'leaving';
    for (const h of this.hotspots) h.marker.hide();
    this.party.leader.walkTo(s.def.x + 20, s.def.y - 25, 0.8);
    const cam = this.cameras.main;
    this.tweens.add({ targets: cam, zoom: cam.zoom * 1.8, duration: 1800, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: this.camCenter, x: s.def.x + 30, y: s.def.y - kidAtGate(this.place, s.def.y), duration: 1800, ease: 'Sine.easeIn' });
    cam.fadeOut(1800, 11, 21, 51);
    this.peristalsis?.enterGate();
    const P = this.place;
    const next = P.next ?? 'Mouth';
    const built = !!this.scene.manager.keys[next];
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('Chapter', {
        title: t((P.nextChapter ?? 'chapter.1') as Key),
        subtitle: t((P.nextTitle ?? 'chapter.mouthMission') as Key),
        artwork: next === 'Mouth' ? 'mouthMission' : next === 'Stomach' ? 'stomachMission' : undefined,
        // a mini-game still being built: say so, and offer the way back
        ...(built
          ? { next: { scene: next } }
          : { note: t('chapter.comingSoon'), back: { scene: 'World', label: t('chapter.back'), data: { place: this.placeName } } }),
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

  /**
   * A camera with intent: slightly zoomed in so it has room to move, looks a
   * little ahead of where the party walks, eases closer as the goal nears, and
   * opens on the whole place. Parallax layers shift with it.
   */
  private applyView(snap: boolean, dt = 0): void {
    const cam = this.cameras.main;
    const P = this.place;
    if (this.phase === 'leaving') {
      cam.centerOn(this.camCenter.x, this.camCenter.y);
      this.updateParallax();
      return;
    }
    const L = this.party.leader;
    // keep the trio at a steady size on screen: zoom in as they walk away from the
    // camera, ease back out when they come back (partly - the world must still show)
    const want = Phaser.Math.Clamp(Math.pow(this.spawnH / Math.max(1, L.kidHeight), 0.7), 1, 2.1);
    this.intentK += (want - this.intentK) * (snap ? 1 : 1 - Math.exp(-dt * 1.4));
    const cover = Math.max(cam.width / P.width, cam.height / P.height);
    const walking = cover * BASE_ZOOM * this.intentK * this.focus.k * this.push.k * (this.peristalsis?.squeeze ?? 1);
    // the establishing shot shows the whole picture (zoom = cover), easing into the walking framing
    const e = this.establish.t;
    const zoom = e > 0 ? Math.pow(walking, 1 - e) * Math.pow(cover, e) : walking;
    cam.setZoom(zoom);
    const visW = cam.width / zoom;
    const visH = cam.height / zoom;
    const m = this.party.members;
    const f = Math.min(1, (this.focus.k - 1) / 0.7); // blend from following the group to a dialogue focus point
    // look ahead in the walking direction (about 0.7 s of travel)
    const v = L.velocity;
    const gx = m.reduce((s, c) => s + c.pos.x, 0) / m.length + Phaser.Math.Clamp(v.x * 0.7, -visW * 0.15, visW * 0.15);
    const gy = L.pos.y - L.kidHeight * 0.8 + Phaser.Math.Clamp(v.y * 0.7, -visH * 0.15, visH * 0.15);
    let tx = Phaser.Math.Linear(gx, this.focus.x, f);
    let ty = Phaser.Math.Linear(gy, this.focus.y, f);
    if (e > 0) {
      tx = Phaser.Math.Linear(tx, P.width / 2, e);
      ty = Phaser.Math.Linear(ty, P.height / 2, e);
    }
    tx = Phaser.Math.Clamp(tx, visW / 2, P.width - visW / 2);
    ty = Phaser.Math.Clamp(ty, visH / 2, P.height - visH / 2);
    const a = snap || this.establish.t > 0 ? 1 : 1 - Math.exp(-dt * 2.5);
    this.camCenter.x += (tx - this.camCenter.x) * a;
    this.camCenter.y += (ty - this.camCenter.y) * a;
    cam.centerOn(this.camCenter.x, this.camCenter.y);
    this.updateParallax();
  }

  /**
   * Shift each layer by (1 - factor) of the camera's offset from its resting
   * (centred) framing: far layers lag behind, near layers race ahead.
   */
  private updateParallax(): void {
    const cam = this.cameras.main;
    cam.preRender();
    const view = cam.worldView;
    const restX = (this.place.width - view.width) / 2;
    const restY = (this.place.height - view.height) / 2;
    const W = this.place.width;
    const H = this.place.height;
    for (const { img, factor } of this.parallax) {
      if (factor === 1) continue;
      const dx = (1 - factor) * (view.x - restX);
      const dy = (1 - factor) * (view.y - restY) * 0.6;
      // grow the layer about the picture's centre just enough that the shift never
      // brings its edge into view (at rest it lines up exactly with the others)
      const s = 1 + 2 * Math.max(Math.abs(dx) / W, Math.abs(dy) / H) + 0.002;
      img.setDisplaySize(W * s, H * s);
      img.setPosition((W * (1 - s)) / 2 + dx, (H * (1 - s)) / 2 + dy);
    }
  }

  /** Drifting petals and floating golden motes: the world breathes. */
  private ambient(): void {
    const P = this.place;
    if (!this.textures.exists('petal')) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffc2d6, 1).fillEllipse(16, 8, 30, 14);
      g.fillStyle(0xffe3ec, 1).fillEllipse(13, 7, 14, 6);
      g.generateTexture('petal', 32, 16);
      g.clear();
      for (let r = 16; r > 0; r -= 2) g.fillStyle(0xfff1b8, 0.1 + (0.05 * (16 - r)) / 2).fillCircle(16, 16, r);
      g.generateTexture('mote', 32, 32);
      g.destroy();
    }
    const kid = P.bodyPerPathWidth * P.pathWidthAtBottom;
    this.add.particles(0, 0, 'petal', {
      x: { min: -P.width * 0.1, max: P.width * 0.6 },
      y: { min: -40, max: P.height * 0.5 },
      lifespan: 9000,
      speedX: { min: kid * 0.08, max: kid * 0.2 },
      speedY: { min: kid * 0.04, max: kid * 0.12 },
      rotate: { start: 0, end: 360 },
      scale: { min: kid / 900, max: kid / 500 },
      alpha: { start: 0.95, end: 0 },
      frequency: 420,
      quantity: 1,
    }).setDepth(6e4);
    this.add.particles(0, 0, 'mote', {
      x: { min: 0, max: P.width },
      y: { min: P.height * 0.15, max: P.height * 0.9 },
      lifespan: 5000,
      speedY: { min: -kid * 0.05, max: -kid * 0.015 },
      speedX: { min: -kid * 0.02, max: kid * 0.02 },
      scale: { start: 0, end: kid / 1600, ease: 'Sine.easeOut' },
      alpha: { start: 0.8, end: 0 },
      frequency: 260,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(6e4 - 1);
  }
}

/** The camera works a little closer than "fit the picture", leaving room to follow and parallax to show. */
const BASE_ZOOM = 1.12;

function kidAtGate(P: Place, y: number): number {
  return P.bodyPerPathWidth * P.pathWidthAtBottom * ((y - P.horizonY) / (P.height - P.horizonY)) * 0.5;
}

/** The previous shot's last frame, laid over the canvas while the next shot starts. */
function showSnapshot(image: HTMLImageElement): void {
  document.getElementById('shot-snapshot')?.remove();
  image.id = 'shot-snapshot';
  image.className = 'shot-snapshot';
  image.alt = '';
  document.getElementById('app')!.appendChild(image);
}

function fadeOutSnapshot(): void {
  const img = document.getElementById('shot-snapshot');
  if (!img) return;
  requestAnimationFrame(() => {
    img.classList.add('fade');
    window.setTimeout(() => img.remove(), 900);
  });
}
