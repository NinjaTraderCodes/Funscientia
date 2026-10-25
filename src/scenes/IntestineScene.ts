import { I18n, t, type Key } from '../i18n/i18n';
import Phaser from 'phaser';
import { asset } from '../assetUrl';
import { Sound } from '../audio/Sound';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { DialogueBox } from '../ui/DialogueBox';
import { type Mood, type Who } from '../ui/MiniGameHud';
import { IntestineHud } from '../ui/IntestineHud';
import { toast } from '../ui/Toast';
import { GameState, type Avatar } from '../state/GameState';
import { discoveryText } from '../state/discoveries';

/** intestine.json (tools/pipeline/pack_intestine.py), in pixels of the 1280x720 background. */
interface Spot {
  x: number;
  y: number;
}
interface IntestineLayout {
  size: [number, number];
  bile: Spot;
  pancreas: Spot;
  wall: Spot;
  entry: Spot;
  exit: Spot;
  inside: [number, number][];
  villiY: number;
  vitamins: string[];
}

const ROUND_SECONDS = [30, 30, 32, 25];
const STARS = [650, 1250];
const STREAK_GAP = 1.6;

// the wall's waves (peristalsis) travel from the entry to the exit
const SLICES = 96;
const PIVOT_Y = 430;
const WAVE_TRAVEL = 2.2;
const WAVE_REST = 1.0;
const WAVE_FROM = 180;
const WAVE_TO = 1180;
const SQUEEZE = 0.06;
const SIGMA = 120;

const BEAD = 50;
const BEAD_GAP = 44;
const DUCT_R = 58; // tap this close to an opening to take what it gives

/** What the player can hold: bile, or an enzyme's scissors. */
type Tool = 'bile' | 'lipase' | 'trypsin' | 'peptidase' | 'amylase' | 'maltase';
type Source = 'bile' | 'pancreas' | 'wall';
/** Round by round, what each opening gives (null: nothing yet). */
const SOURCES: Record<Source, (Tool | null)[]> = {
  bile: ['bile', null, null, null],
  pancreas: ['lipase', 'trypsin', 'amylase', null],
  wall: [null, 'peptidase', 'maltase', null],
};
const SOURCE_COLOUR: Record<Source, number> = { bile: 0x9be23c, pancreas: 0xffb347, wall: 0xff8fb0 };

/** Single things that float along (their art, and where they are absorbed). */
type Single = 'fat' | 'fatWet' | 'glycerol' | 'fattyAcid' | 'amino' | 'glucose' | 'water' | 'minerals' | 'vitamin' | 'fibre';
type ChainKind = 'protein' | 'starch';

interface Floater {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wobble: number;
  gone: boolean;
  /** rolling in through the entry ring */
  entering: number;
}
interface Thing extends Floater {
  kind: Single;
  img: Phaser.GameObjects.Image;
  /** vitamins: which one (fat-soluble ones go to the lymph) */
  vitamin?: string;
  size: number;
  shake: number;
  /** products of digestion are absorbed a little later by themselves (rounds 1-3) */
  ripe: number;
}
interface Chain extends Floater {
  kind: ChainKind;
  beads: Phaser.GameObjects.Image[];
  links: Phaser.GameObjects.Image[];
  notches: Phaser.GameObjects.Image[];
  angle: number;
  shake: number;
  pts: Phaser.Math.Vector2[];
}

type Phase = 'intro' | 'banner' | 'play' | 'done';
const FAT_SOLUBLE = new Set(['vitamin_a', 'vitamin_d', 'vitamin_e', 'vitamin_k']);

/**
 * The Small Intestine mini-game (after Dounia's notes and SI_3rdGame sheets).
 * The chyme comes in by the ring on the left and is carried to the right by the
 * wall's waves. Above, three openings pour in the helpers - the green bile duct
 * (from the gallbladder), the pancreatic duct, and the intestine's own wall: tap
 * one to take what it gives, then use it on the molecules.
 *   1 Fats     - bile first (it prepares the fat: emulsified), then lipase's
 *                scissors: glycerol and fatty acids;
 *   2 Proteins - trypsin cuts the polypeptides (four units) into peptides (two),
 *                peptidase cuts the peptides into amino acids;
 *   3 Sugars   - pancreatic amylase cuts the remaining starch into maltose,
 *                maltase cuts maltose into glucose;
 *   4 Absorb   - tap the simple nutrients so the villi absorb them (blood, or
 *                lymph for the fats); fibre is not absorbed: it moves on.
 * Water, mineral salts and vitamins need no digestion: helpers bounce off them.
 */
export class SmallIntestineScene extends Phaser.Scene {
  private layout!: IntestineLayout;
  private inside!: Phaser.Geom.Polygon;
  private centre = new Phaser.Math.Vector2(680, 440);
  private hud!: IntestineHud;
  private box!: DialogueBox;
  private phase: Phase = 'intro';
  private round = 0;
  private timeLeft = 0;
  private paused = false;
  private clock = 0;
  private slices: Phaser.GameObjects.Image[] = [];
  private band!: Phaser.GameObjects.Image;
  private waveT = 0;
  private things: Thing[] = [];
  private chains: Chain[] = [];
  private spawnIn = 0;
  private travellerIn = 0;
  private spawned = 0;
  private tool: Tool | null = null;
  private toolImg!: Phaser.GameObjects.Image;
  private aim = new Phaser.Math.Vector2(640, 420);
  private lastCut = new Phaser.Math.Vector2(-1, -1);
  private glows: Record<Source, Phaser.GameObjects.Image> = {} as never;
  private rings: Record<Source, Phaser.GameObjects.Image> = {} as never;
  private juice: Record<Source, Phaser.GameObjects.Particles.ParticleEmitter> = {} as never;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private blood!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lymph!: Phaser.GameObjects.Particles.ParticleEmitter;
  private droplets!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stats = { score: 0, combo: 0, bestCombo: 0, last: -9, fats: 0, amino: 0, glucose: 0, absorbed: 0, wrong: 0, missed: 0 };
  private said = new Set<string>();

  constructor() {
    super('SmallIntestine');
  }

  preload(): void {
    this.load.json('intestine', asset('intestine/intestine.json'));
    this.load.image('si_bg', asset('intestine/background.webp'));
    for (const k of ['bile', 'fat_wet', 'lipase', 'glycerol', 'fatty_acid_0', 'fatty_acid_1', 'fatty_acid_2', 'trypsin', 'peptidase', 'amylase', 'maltase', 'water', 'minerals', 'fibre']) {
      this.load.image(`si_${k}`, asset(`intestine/${k}.webp`));
    }
    for (let i = 0; i < 3; i++) this.load.image(`st_fat_${i}`, asset(`stomach/fat_${i}.webp`));
    for (let i = 0; i < 10; i++) this.load.image(`st_protein_${i}`, asset(`stomach/protein_${String(i).padStart(2, '0')}.webp`));
    for (let i = 0; i < 7; i++) this.load.image(`st_starch_${i}`, asset(`stomach/starch_${String(i).padStart(2, '0')}.webp`));
    this.load.once(Phaser.Loader.Events.FILE_COMPLETE + '-json-intestine', (_k: string, _t: string, data: IntestineLayout) => {
      for (const v of data.vitamins) this.load.image(`si_${v}`, asset(`intestine/${v}.webp`));
    });
  }

  create(data: { replay?: boolean } = {}): void {
    this.layout = this.cache.json.get('intestine') as IntestineLayout;
    GameState.place = 'small-intestine'; // continue from here (online save)
    if (data.replay) GameState.checkpointChapter3({ lesson: 0, quiz: 0, score: 0, mistakes: 0 });
    const [W, H] = this.layout.size;
    this.inside = new Phaser.Geom.Polygon(this.layout.inside.flat());
    Object.assign(this, { phase: 'intro', round: 0, paused: false, clock: 0, waveT: 0, things: [], chains: [], slices: [], spawnIn: 0, travellerIn: 2, spawned: 0, tool: null });
    this.stats = { score: 0, combo: 0, bestCombo: 0, last: -9, fats: 0, amino: 0, glucose: 0, absorbed: 0, wrong: 0, missed: 0 };
    this.said = new Set();
    this.makeTextures();

    // the background: a whole copy behind, and thin strips in front that the waves squeeze
    const tex = this.textures.get('si_bg').getSourceImage() as HTMLImageElement;
    const k = W / tex.width;
    this.add.image(0, 0, 'si_bg').setOrigin(0, 0).setScale(k).setDepth(-20);
    const sw = tex.width / SLICES;
    for (let i = 0; i < SLICES; i++) {
      const s = this.add.image(0, PIVOT_Y, 'si_bg').setOrigin(0, PIVOT_Y / H).setScale(k).setDepth(-10);
      s.setCrop(i * sw - 1, 0, sw + 2, tex.height);
      this.slices.push(s);
    }
    this.band = this.add.image(0, PIVOT_Y, 'si_band').setDisplaySize(260, 470).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(-5);

    // the three openings: a glow that shows what they offer, and the juice they pour in
    for (const src of ['bile', 'pancreas', 'wall'] as const) {
      const at = this.layout[src];
      this.glows[src] = this.add.image(at.x, at.y, 'si_glow').setDisplaySize(150, 150).setTint(SOURCE_COLOUR[src]).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(950);
      // a gold ring around an opening that has a helper to give: tap me
      this.rings[src] = this.add.image(at.x, at.y, 'si_ring').setTint(0xffd36b).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(951);
      this.juice[src] = this.add.particles(at.x, at.y + 10, 'si_dot', {
        speedY: { min: 120, max: 260 }, speedX: { min: -50, max: 50 }, lifespan: 900, gravityY: 260,
        scale: { start: 0.7, end: 0.15 }, tint: SOURCE_COLOUR[src], alpha: { start: 0.95, end: 0 }, emitting: false,
      }).setDepth(960);
    }
    this.toolImg = this.add.image(640, 420, 'si_lipase').setOrigin(0.35, 0.3).setDepth(3000).setVisible(false);
    this.sparks = this.add.particles(0, 0, 'si_star', {
      speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 }, lifespan: 800, scale: { start: 0.9, end: 0 },
      rotate: { start: 0, end: 180 }, tint: [0xffe29a, 0xfff6e3, 0x9fe4ff], blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(2500);
    this.blood = this.add.particles(0, 0, 'si_dot', {
      speedY: { min: 40, max: 160 }, speedX: { min: -60, max: 60 }, lifespan: 700, scale: { start: 0.6, end: 0 },
      tint: [0xff3b4a, 0xff7a7a, 0xc41230], blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(2450);
    this.lymph = this.add.particles(0, 0, 'si_dot', {
      speedY: { min: 40, max: 160 }, speedX: { min: -60, max: 60 }, lifespan: 700, scale: { start: 0.6, end: 0 },
      tint: [0xffe14d, 0xfff3a6, 0xe3c53a], blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(2450);
    this.droplets = this.add.particles(0, 0, 'si_dot', {
      speed: { min: 60, max: 180 }, angle: { min: 0, max: 360 }, lifespan: 700, gravityY: 200,
      scale: { start: 0.55, end: 0.1 }, tint: [0xb6e84a, 0xeaf27a, 0x8fc93a], alpha: { start: 0.95, end: 0 }, emitting: false,
    }).setDepth(2450);

    this.hud = new IntestineHud(() => this.togglePause());
    this.box = new DialogueBox(GameState.storyLeader);
    this.fit();
    this.scale.on('resize', this.fit, this);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointerup', () => this.lastCut.set(-1, -1));
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    const onHide = () => {
      if (document.hidden && this.phase === 'play' && !this.paused) this.togglePause();
    };
    document.addEventListener('visibilitychange', onHide);
    const badge = document.getElementById('profile-btn');
    const hint = document.getElementById('hud');
    const badgeWas = badge?.hidden ?? true;
    if (badge) badge.hidden = true;
    if (hint) hint.hidden = true;
    Sound.duck(0.08, 1.2);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.fit, this);
      document.removeEventListener('visibilitychange', onHide);
      this.input.setDefaultCursor('default');
      this.hud.destroy();
      this.box.destroy();
      if (badge) badge.hidden = badgeWas;
    });
    this.cameras.main.fadeIn(700, 11, 21, 51);
    this.time.delayedCall(700, () => void this.run());
  }

  /** The whole visit: the Guardian's welcome, the four rounds, results, explanation. */
  private async run(): Promise<void> {
    await this.talk('intro');
    for (let r = 0; r < 4; r++) {
      this.round = r;
      this.hud.setRound(r);
      this.phase = 'banner';
      this.setTool(null);
      await this.hud.banner(r, t(`si.round${r + 1}.title` as Key), t(`si.round${r + 1}.text` as Key));
      if (r === 0) this.react('bile', 'happy', t('si.say.bileHi'), 3200);
      if (r === 1) this.react('intestine', 'thinking', t('si.say.proteinHi'), 3200);
      if (r === 2) this.react('amylase', 'happy', t('si.say.amylaseHi'), 3200);
      if (r === 3) this.react('intestine', 'happy', t('si.say.absorbHi'), 3200);
      this.spawnIn = 0.4;
      this.spawned = 0;
      await this.playRound(ROUND_SECONDS[r]);
      this.clearRound();
    }
    this.hud.setRound(4);
    const stars = 1 + (this.stats.score >= STARS[0] ? 1 : 0) + (this.stats.score >= STARS[1] ? 1 : 0);
    if (stars === 3) Sound.tone(523, 1046, 0.5, 0.08, 'triangle');
    await this.hud.results({ stars, ...this.stats });
    GameState.checkpointChapter3({ lesson: 4, score: this.stats.score, mistakes: this.stats.wrong });
    const runner = await DialogueRunner.load('intestine', GameState.storyLeader);
    runner.setVariable('predict_bile', GameState.prediction('bile'));
    const result = await runner.run('explain', this.box);
    for (const [i, d] of result.discoveries.entries()) {
      if (GameState.discover(d)) {
        this.time.delayedCall(i * 1400, () => {
          Sound.chime();
          toast(t('ui.discovery'), discoveryText(d), 3800);
        });
      }
    }
    this.phase = 'done';
    this.time.delayedCall(result.discoveries.length * 1400 + 1800, () => {
      this.cameras.main.fadeOut(900, 11, 21, 51);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        void Sound.music();
        // the journey is done: what did we learn? (the memory game)
        GameState.place = 'revision';
        this.scene.start('Chapter', { title: t('chapter.3'), subtitle: t('chapter.revision'), artwork: 'revision', next: { scene: 'Revision' } });
      });
    });
  }

  private async talk(knot: string): Promise<void> {
    const runner = await DialogueRunner.load('intestine', GameState.storyLeader);
    await runner.run(knot, this.box);
  }

  private playRound(seconds: number): Promise<void> {
    this.timeLeft = seconds;
    this.hud.setTime(seconds);
    this.phase = 'play';
    return new Promise((resolve) => {
      const check = () => {
        if (this.phase === 'play') this.time.delayedCall(100, check);
        else resolve();
      };
      check();
    });
  }

  private endRound(): void {
    this.phase = 'banner';
    this.setTool(null);
    Sound.tone(660, 990, 0.25, 0.07, 'triangle');
  }

  /** Between rounds: everything still floating is carried on. */
  private clearRound(): void {
    for (const th of this.things) this.fade(th.img, th);
    for (const c of this.chains) this.fadeChain(c);
    this.things = [];
    this.chains = [];
  }

  update(_t: number, deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt;
    this.waveStep(dt);
    this.ductStep();
    for (const th of this.things) this.moveThing(th, dt);
    for (const c of this.chains) this.moveChain(c, dt);
    this.things = this.things.filter((x) => !x.gone);
    this.chains = this.chains.filter((x) => !x.gone);
    this.spread(dt);
    this.toolImg.x += (this.aim.x - this.toolImg.x) * Math.min(1, dt * 20);
    this.toolImg.y += (this.aim.y - this.toolImg.y) * Math.min(1, dt * 20);
    if (this.phase !== 'play') return;
    this.timeLeft -= dt;
    this.hud.setTime(this.timeLeft);
    if (this.timeLeft <= 0) return this.endRound();
    this.serve(dt);
  }

  // ---- the wall's waves ------------------------------------------------------------

  private waveStrength(): number {
    if (this.waveT >= WAVE_TRAVEL) return 0;
    return Math.sin((this.waveT / WAVE_TRAVEL) * Math.PI);
  }

  private get waveX(): number {
    return WAVE_FROM + (WAVE_TO - WAVE_FROM) * Phaser.Math.Clamp(this.waveT / WAVE_TRAVEL, 0, 1);
  }

  private squeezeAt(x: number): number {
    const s = this.waveStrength();
    return s ? SQUEEZE * s * Math.exp(-(((x - this.waveX) / SIGMA) ** 2)) : 0;
  }

  private squeezedY(x: number, y: number): number {
    return PIVOT_Y + (y - PIVOT_Y) * (1 - this.squeezeAt(x) * 1.6);
  }

  private waveStep(dt: number): void {
    const before = this.waveT;
    this.waveT += dt;
    if (this.waveT >= WAVE_TRAVEL + WAVE_REST) this.waveT = 0;
    if (this.waveT < before) {
      Sound.noise(1.2, 90, 0.7, 0.1);
      Sound.tone(72, 50, 1.1, 0.04, 'sine');
    }
    const W = this.layout.size[0];
    const k = this.slices[0]?.scaleX ?? 1;
    for (const [i, s] of this.slices.entries()) s.scaleY = k * (1 - this.squeezeAt(((i + 0.5) * W) / SLICES));
    this.band.setX(this.waveX).setAlpha(0.35 * this.waveStrength());
  }

  // ---- the openings -------------------------------------------------------------------

  private gives(src: Source): Tool | null {
    return SOURCES[src][this.round] ?? null;
  }

  /** The openings glow when they have something for this round; the one in use glows the most. */
  private ductStep(): void {
    for (const src of ['bile', 'pancreas', 'wall'] as const) {
      const give = this.phase === 'play' ? this.gives(src) : null;
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 4 + (src === 'wall' ? 2 : src === 'pancreas' ? 1 : 0));
      const inUse = give && give === this.tool;
      this.glows[src].setAlpha(give ? (inUse ? 0.95 : 0.5 + 0.4 * pulse) : 0).setScale((inUse ? 1.3 : 1.05) * (150 / 128) * (0.9 + 0.12 * pulse));
      this.rings[src].setAlpha(give && !inUse ? 0.45 + 0.55 * pulse : 0).setDisplaySize(84 + 26 * pulse, 84 + 26 * pulse);
    }
  }

  /** Tap an opening: it pours its juice in, and its helper comes to the player's hand. */
  private takeFrom(src: Source): void {
    const give = this.gives(src);
    if (!give) {
      this.popText(t('si.pop.notNow'), this.layout[src].x, this.layout[src].y + 70, '#fff6e3');
      return;
    }
    this.juice[src].explode(24);
    Sound.noise(0.4, 1400, 0.8, 0.1);
    Sound.tone(500, 900, 0.18, 0.05, 'triangle');
    this.setTool(give);
    // the helper flies from its opening to the hand
    const at = this.layout[src];
    this.toolImg.setPosition(at.x, at.y + 20);
    this.once(`take_${give}`, give === 'bile' ? 'bile' : give === 'amylase' ? 'amylase' : give === 'lipase' ? 'lipase' : 'intestine', 'happy', t(`si.say.take.${give}` as Key), 3000);
  }

  private setTool(tool: Tool | null): void {
    this.tool = tool;
    this.toolImg.setVisible(!!tool && this.phase === 'play');
    this.input.setDefaultCursor(tool && this.phase === 'play' ? 'none' : 'default');
    if (tool) {
      this.toolImg.setTexture(`si_${tool}`);
      const w = tool === 'bile' ? 96 : 104;
      this.toolImg.setDisplaySize(w, w * (this.toolImg.height / this.toolImg.width)).setOrigin(tool === 'bile' ? 0.5 : 0.35, tool === 'bile' ? 0.6 : 0.3);
    }
    this.hud.setTool(tool);
    for (const c of this.chains) this.relinkNotches(c);
  }

  // ---- what comes in ----------------------------------------------------------------------

  private serve(dt: number): void {
    this.spawnIn -= dt;
    this.travellerIn -= dt;
    const busy = this.things.filter((x) => this.needsWork(x)).length + this.chains.length;
    if (this.round < 3 && this.travellerIn <= 0) {
      this.travellerIn = Phaser.Math.FloatBetween(3.5, 5.5);
      this.addTraveller();
    }
    if (this.spawnIn > 0) return;
    if (this.round === 3) {
      // the absorption round: digested nutrients, the ready ones, and fibre
      if (this.things.length >= 9) return;
      this.spawnIn = 0.8;
      const r = Math.random();
      if (r < 0.2) this.addThing('fibre');
      else if (r < 0.4) this.addTraveller();
      else this.addThing(Phaser.Utils.Array.GetRandom(['glucose', 'glucose', 'amino', 'amino', 'glycerol', 'fattyAcid'] as Single[]));
      return;
    }
    if (busy >= 4) return;
    this.spawnIn = 1.9;
    this.spawned++;
    if (this.round === 0) this.addThing('fat');
    else if (this.round === 1) this.addChain('protein', 4);
    else this.addChain('starch', this.spawned % 3 === 1 ? 2 : 6); // maltose (from the mouth) and remaining starch
  }

  private floater(): Floater {
    const { entry } = this.layout;
    return { x: entry.x + 40, y: entry.y + Phaser.Math.Between(-30, 50), vx: 70, vy: Phaser.Math.FloatBetween(-10, 30), wobble: Math.random() * 6, gone: false, entering: 1.4 };
  }

  private art(kind: Single, vitamin?: string): string {
    switch (kind) {
      case 'fat': return `st_fat_${Phaser.Math.Between(0, 2)}`;
      case 'fatWet': return 'si_fat_wet';
      case 'fattyAcid': return `si_fatty_acid_${Phaser.Math.Between(0, 2)}`;
      case 'amino': return `st_protein_${Phaser.Math.Between(0, 9)}`;
      case 'glucose': return `st_starch_${Phaser.Math.Between(0, 6)}`;
      case 'vitamin': return `si_${vitamin}`;
      default: return `si_${kind}`;
    }
  }

  private static SIZE: Record<Single, number> = { fat: 150, fatWet: 160, glycerol: 62, fattyAcid: 96, amino: 46, glucose: 46, water: 74, minerals: 82, vitamin: 70, fibre: 96 };

  private addThing(kind: Single, at?: Phaser.Math.Vector2, vitamin?: string): Thing {
    const f = this.floater();
    if (at) Object.assign(f, { x: at.x, y: at.y, entering: 0, vx: Phaser.Math.FloatBetween(-60, 60), vy: Phaser.Math.FloatBetween(-60, 30) });
    const img = this.add.image(f.x, f.y, this.art(kind, vitamin));
    const size = SmallIntestineScene.SIZE[kind];
    const th: Thing = { ...f, kind, img, vitamin, size, shake: 0, ripe: Phaser.Math.FloatBetween(2.5, 3.5) };
    this.sizeThing(th);
    this.things.push(th);
    return th;
  }

  private addTraveller(): void {
    const r = Math.random();
    if (r < 0.3) this.addThing('water');
    else if (r < 0.5) this.addThing('minerals');
    else if (r < 0.62 && this.round < 3) this.addThing('fibre');
    else this.addThing('vitamin', undefined, Phaser.Utils.Array.GetRandom(this.layout.vitamins));
  }

  private sizeThing(th: Thing): void {
    const s = th.size / Math.max(th.img.width, th.img.height);
    th.img.setScale(s * (1 + th.shake * 0.08));
  }

  private addChain(kind: ChainKind, n: number, at?: { x: number; y: number }): Chain {
    const f = this.floater();
    if (at) Object.assign(f, at, { entering: 0 });
    const art = kind === 'protein' ? 'st_protein' : 'st_starch';
    const beads = Array.from({ length: n }, () => this.add.image(f.x, f.y, `${art}_${Phaser.Math.Between(0, kind === 'protein' ? 9 : 6)}`).setDisplaySize(BEAD, BEAD));
    const c: Chain = { ...f, kind, beads, links: [], notches: [], angle: Phaser.Math.FloatBetween(-0.25, 0.25), shake: 0, pts: [] };
    for (let i = 0; i < n - 1; i++) c.links.push(this.add.image(0, 0, kind === 'protein' ? 'si_link_p' : 'si_link_s'));
    this.relinkNotches(c);
    this.chains.push(c);
    return c;
  }

  // ---- what each helper does ------------------------------------------------------------

  /** Where the tool in hand may cut this chain (link i joins beads i and i + 1). */
  private cutsAt(c: Chain, tool = this.tool): number[] {
    const n = c.beads.length;
    if (c.kind === 'protein') {
      if (tool === 'trypsin' && n === 4) return [1];
      if (tool === 'peptidase' && n === 2) return [0];
    } else {
      if (tool === 'amylase' && n > 2) return Array.from({ length: Math.floor((n - 1) / 2) }, (_x, k) => 1 + 2 * k);
      if (tool === 'maltase' && n === 2) return [0];
    }
    return [];
  }

  private relinkNotches(c: Chain): void {
    for (const o of c.notches) o.destroy();
    const at = this.cutsAt(c);
    c.links.forEach((l, i) => l.setTint(at.includes(i) ? 0xffe29a : 0xffffff));
    c.notches = at.map(() => this.add.image(0, 0, 'si_ring').setTint(0xffd36b).setBlendMode(Phaser.BlendModes.ADD));
  }

  /** Has this thing still to be digested? */
  private needsWork(th: Thing): boolean {
    return th.kind === 'fat' || th.kind === 'fatWet';
  }

  /** The helper in hand acts where the player taps (or along a swipe). */
  private act(x: number, y: number, from?: Phaser.Math.Vector2): void {
    if (this.round === 3) return this.absorbAt(x, y);
    if (!this.tool) {
      if (!from && this.hitAnything(x, y)) {
        this.popText(t('si.pop.takeHelper'), x, y - 30, '#cfe7ff');
        this.once('takeHelper', 'intestine', 'thinking', t('si.say.takeHelper'), 3000);
      }
      return;
    }
    // a chain's link?
    const seg = from ? new Phaser.Geom.Line(from.x, from.y, x, y) : null;
    let best: { c: Chain; i: number; d: number } | null = null;
    for (const c of this.chains) {
      if (c.gone || c.entering > 0.6) continue;
      for (let i = 0; i < c.pts.length - 1; i++) {
        const mx = (c.pts[i].x + c.pts[i + 1].x) / 2;
        const my = (c.pts[i].y + c.pts[i + 1].y) / 2;
        const d = Phaser.Math.Distance.Between(x, y, mx, my);
        const hit = seg ? Phaser.Geom.Intersects.LineToCircle(seg, new Phaser.Geom.Circle(mx, my, 20)) : d < 42;
        if (hit && (!best || d < best.d)) best = { c, i, d };
      }
    }
    if (best) {
      const at = this.cutsAt(best.c);
      if (!at.length) return this.wrong(best.c, x, y, this.chainHint(best.c));
      const i = at.reduce((b, k) => (Math.abs(k - best!.i) < Math.abs(b - best!.i) ? k : b), at[0]);
      return this.cutChain(best.c, i);
    }
    if (seg) return;
    // a single thing?
    const th = this.things.find((q) => !q.gone && q.entering < 0.6 && Phaser.Math.Distance.Between(x, y, q.img.x, q.img.y) < q.size * 0.5);
    if (!th) return;
    if (th.kind === 'fat' && this.tool === 'bile') return this.emulsify(th);
    if (th.kind === 'fatWet' && this.tool === 'lipase') return this.splitFat(th);
    if (th.kind === 'fat' && this.tool === 'lipase') return this.wrong(th, x, y, 'si.pop.bileFirst', 'bileFirst', 'bile', t('si.say.bileFirst'));
    if (th.kind === 'fatWet' && this.tool === 'bile') return this.popText(t('si.pop.ready.bile'), x, y - 30, '#e9ffb0');
    if (['water', 'minerals', 'vitamin'].includes(th.kind)) return this.wrong(th, x, y, 'si.pop.simple', 'simple', this.buddy(), t('si.say.simple'), true);
    if (th.kind === 'fibre') return this.wrong(th, x, y, 'si.pop.fibre', 'fibre', 'intestine', t('si.say.fibre'), true);
    if (['glycerol', 'fattyAcid', 'amino', 'glucose'].includes(th.kind)) return this.popText(t('si.pop.done'), x, y - 30, '#cff4ff');
    this.wrong(th, x, y, 'si.pop.wrongHelper');
  }

  private chainHint(c: Chain): Key {
    const n = c.beads.length;
    if (c.kind === 'protein') return n === 4 ? 'si.pop.trypsinFirst' : n === 2 ? 'si.pop.peptidaseJob' : 'si.pop.done';
    return n === 2 ? 'si.pop.maltaseJob' : 'si.pop.amylaseFirst';
  }

  private hitAnything(x: number, y: number): boolean {
    return this.things.some((q) => Phaser.Math.Distance.Between(x, y, q.img.x, q.img.y) < q.size * 0.5) || this.chains.some((c) => c.pts.some((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) < BEAD * 0.7));
  }

  private emulsify(th: Thing): void {
    th.kind = 'fatWet';
    th.img.setTexture('si_fat_wet');
    th.size = SmallIntestineScene.SIZE.fatWet;
    th.shake = 1;
    this.sizeThing(th);
    this.droplets.explode(20, th.img.x, th.img.y);
    Sound.noise(0.3, 2200, 0.7, 0.1);
    this.score(5, th.img.x, th.img.y - 60, t('si.pop.emulsified'));
    this.once('emulsified', this.storyKid(), 'surprised', t('si.say.emulsified'), 3000);
  }

  private splitFat(th: Thing): void {
    th.gone = true;
    const at = new Phaser.Math.Vector2(th.img.x, th.img.y);
    th.img.destroy();
    this.snipAnim();
    this.sparks.explode(14, at.x, at.y);
    Sound.tone(2200, 1400, 0.06, 0.06, 'square');
    this.stats.fats++;
    this.combo();
    this.addThing('glycerol', at.clone().add(new Phaser.Math.Vector2(-50, 0)));
    for (let k = 0; k < 3; k++) this.addThing('fattyAcid', at.clone().add(new Phaser.Math.Vector2(30, -40 + k * 40)));
    this.score(10 + this.comboBonus(), at.x, at.y - 60, t('si.pop.glycerol'));
    this.once('lipaseDone', 'lipase', 'happy', t('si.say.lipaseDone'), 3000);
  }

  private cutChain(c: Chain, i: number): void {
    const mx = (c.pts[i].x + c.pts[i + 1].x) / 2;
    const my = (c.pts[i].y + c.pts[i + 1].y) / 2;
    this.snipAnim();
    this.sparks.explode(8, mx, my);
    Sound.tone(2200, 1400, 0.06, 0.06, 'square');
    Sound.noise(0.06, 4000, 1, 0.08);
    this.combo();
    for (const o of [...c.links, ...c.notches]) o.destroy();
    c.gone = true;
    const dir = new Phaser.Math.Vector2(Math.cos(c.angle), Math.sin(c.angle));
    let label: Key = 'si.pop.cut';
    for (const [part, sign] of [[c.beads.slice(0, i + 1), -1], [c.beads.slice(i + 1), 1]] as const) {
      const n = part.length;
      const cx = part.reduce((s, b) => s + b.x, 0) / n;
      const cy = part.reduce((s, b) => s + b.y, 0) / n;
      if (n === 1) {
        // a single unit: an amino acid, or glucose - the end of digestion
        part[0].destroy();
        const kind: Single = c.kind === 'protein' ? 'amino' : 'glucose';
        const th = this.addThing(kind, new Phaser.Math.Vector2(cx, cy));
        th.vx = dir.x * sign * 80;
        if (kind === 'amino') this.stats.amino++;
        else this.stats.glucose++;
        label = kind === 'amino' ? 'si.pop.amino' : 'si.pop.glucose';
        continue;
      }
      const piece: Chain = {
        ...c, beads: [...part], links: [], notches: [], pts: [], gone: false, shake: 0.6, x: cx, y: cy,
        vx: c.vx + dir.x * sign * 70, vy: c.vy - 10, entering: 0,
      };
      for (let k = 0; k < n - 1; k++) piece.links.push(this.add.image(0, 0, c.kind === 'protein' ? 'si_link_p' : 'si_link_s'));
      this.relinkNotches(piece);
      this.chains.push(piece);
      if (n === 2) label = c.kind === 'protein' ? 'si.pop.peptides' : 'si.pop.maltose';
    }
    this.score(8 + this.comboBonus(), mx, my - 30, t(label));
    if (label === 'si.pop.peptides') this.once('peptides', this.buddy(), 'happy', t('si.say.peptides'), 3000);
    if (label === 'si.pop.amino') this.once('amino', this.storyKid(), 'cheering', t('si.say.amino'), 3000);
    if (label === 'si.pop.maltose') this.once('maltose', 'amylase', 'happy', t('si.say.maltose'), 3000);
    if (label === 'si.pop.glucose') this.once('glucose', this.storyKid(), 'cheering', t('si.say.glucose'), 3000);
  }

  private wrong(target: Thing | Chain, x: number, y: number, pop: Key, sayKey?: string, who?: Who, say?: string, soft = false): void {
    target.shake = 1;
    if (this.clock - this.stats.last < 0.3) return; // one swipe is one mistake
    this.stats.last = this.clock;
    this.stats.combo = 0;
    if (!soft) {
      this.stats.wrong++;
      this.stats.score = Math.max(0, this.stats.score - 3);
      this.hud.setScore(this.stats.score);
    }
    Sound.tone(300, 180, 0.18, 0.07, 'square');
    Sound.tone(600, 900, 0.08, 0.04, 'triangle', 0.1);
    this.popText(t(pop), x, y - 30, '#ffd6e8');
    if (sayKey && who && say) this.once(sayKey, who, 'thinking', say, 3000);
  }

  // ---- round 4: absorption ---------------------------------------------------------------

  private absorbAt(x: number, y: number): void {
    const th = this.things.find((q) => !q.gone && q.entering < 0.6 && Phaser.Math.Distance.Between(x, y, q.img.x, q.img.y) < Math.max(40, q.size * 0.55));
    if (!th) return;
    if (th.kind === 'fibre') return this.wrong(th, x, y, 'si.pop.fibreStays', 'fibre4', 'intestine', t('si.say.fibre'));
    this.absorb(th, true);
  }

  /** Into the villi: the blood, or (fats and the fat-soluble vitamins) the lymph first. */
  private absorb(th: Thing, byPlayer: boolean): void {
    th.gone = true;
    const lymph = th.kind === 'glycerol' || th.kind === 'fattyAcid' || (th.kind === 'vitamin' && FAT_SOLUBLE.has(th.vitamin ?? ''));
    const y = this.layout.villiY;
    this.tweens.add({
      targets: th.img, y, scale: th.img.scale * 0.3, alpha: 0, duration: 450, ease: 'Sine.easeIn',
      onComplete: () => {
        (lymph ? this.lymph : this.blood).explode(10, th.img.x, y);
        th.img.destroy();
      },
    });
    if (!byPlayer) return;
    this.stats.absorbed++;
    this.combo();
    Sound.tone(lymph ? 700 : 900, lymph ? 1100 : 1500, 0.15, 0.05, 'triangle');
    this.score(5 + this.comboBonus(), th.img.x, th.img.y - 40, t(lymph ? 'si.pop.lymph' : 'si.pop.blood'));
    if (lymph) this.once('lymph', 'intestine', 'thinking', t('si.say.lymph'), 3200);
    else this.once('blood', this.buddy(), 'surprised', t('si.say.blood'), 3200);
  }

  // ---- moving things ----------------------------------------------------------------------

  /** Float along: rolled in by the entry ring, carried on by the flow and the waves, kept inside. */
  private float(f: Floater, dt: number): void {
    if (f.entering > 0) {
      f.entering -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      return;
    }
    f.wobble += dt;
    const push = this.squeezeAt(f.x) > 0.01 ? 80 : 0; // the wave pushes what it passes
    const flow = this.round === 3 ? 40 : 30;
    f.vx += (flow + push + Math.sin(f.wobble * 0.9) * 14 - f.vx * 0.9) * dt;
    f.vy += (Math.cos(f.wobble * 0.7) * 12 - f.vy * 0.4) * dt;
    const nx = f.x + f.vx * dt;
    const ny = f.y + f.vy * dt;
    if (this.inside.contains(nx, ny)) {
      f.x = nx;
      f.y = ny;
    } else if (nx > 1060) {
      f.x = nx; // on towards the exit
      f.y += (this.layout.exit.y - f.y) * Math.min(1, dt * 2);
    } else {
      // outside (e.g. cut near a ring): swim back in towards the middle
      const to = new Phaser.Math.Vector2(this.centre.x - f.x, this.centre.y - f.y).normalize();
      f.vx = to.x * 80;
      f.vy = to.y * 80;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }

  private moveThing(th: Thing, dt: number): void {
    if (th.gone) return;
    this.float(th, dt);
    th.shake = Math.max(0, th.shake - dt * 3);
    this.sizeThing(th);
    th.img.setPosition(th.x + Math.sin(this.clock * 40) * th.shake * 6, this.squeezedY(th.x, th.y)).setDepth(th.y)
      .setAngle(Math.sin(this.clock * 1.4 + th.wobble) * 8);
    if (this.tool && this.canUse(th)) th.img.setTint(Phaser.Display.Color.GetColor(255, 255, 220 + 35 * Math.sin(this.clock * 8)));
    else th.img.clearTint();
    // products of digestion are absorbed by the lining a little later (the player's job in round 4)
    const product = th.kind === 'glycerol' || th.kind === 'fattyAcid' || th.kind === 'amino' || th.kind === 'glucose';
    if (this.round < 3 && product && this.phase === 'play') {
      th.ripe -= dt;
      if (th.ripe <= 0) return this.absorb(th, false);
    }
    if (th.x > this.layout.exit.x - 30) this.leave(th);
  }

  private canUse(th: Thing): boolean {
    return (th.kind === 'fat' && this.tool === 'bile') || (th.kind === 'fatWet' && this.tool === 'lipase');
  }

  /** Out by the exit ring: digested or not. */
  private leave(th: Thing): void {
    th.gone = true;
    if (this.needsWork(th) && this.phase === 'play') {
      this.stats.missed++;
      this.stats.score = Math.max(0, this.stats.score - 4);
      this.hud.setScore(this.stats.score);
      this.popText(t('si.pop.missed'), this.layout.exit.x - 60, this.layout.exit.y - 60, '#ffd6a8');
      this.once('missed', 'fox', 'surprised', t('si.say.missed'), 2800);
    } else if (th.kind === 'fibre' && this.round === 3 && this.phase === 'play') {
      this.score(3, this.layout.exit.x - 60, this.layout.exit.y - 60, t('si.pop.fibreOn'));
    }
    this.fade(th.img);
  }

  private moveChain(c: Chain, dt: number): void {
    if (c.gone) return;
    this.float(c, dt);
    c.shake = Math.max(0, c.shake - dt * 3);
    const n = c.beads.length;
    const sway = c.angle + Math.sin(this.clock * 0.6 + c.wobble) * 0.3;
    const dir = new Phaser.Math.Vector2(Math.cos(sway), Math.sin(sway));
    const nrm = new Phaser.Math.Vector2(-dir.y, dir.x);
    c.pts = [];
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * BEAD_GAP;
      const wave = Math.sin(this.clock * 2.4 + i * 0.9 + c.wobble) * 6 + Math.sin(this.clock * 40) * c.shake * 5;
      const px = c.x + dir.x * along + nrm.x * wave;
      const py = c.y + dir.y * along + nrm.y * wave;
      c.pts.push(new Phaser.Math.Vector2(px, this.squeezedY(px, py)));
    }
    c.pts.forEach((p, i) => c.beads[i].setPosition(p.x, p.y).setDepth(c.y + 2).setAngle(Math.sin(this.clock * 1.5 + i) * 8));
    c.links.forEach((l, i) => {
      const a = c.pts[i];
      const b = c.pts[i + 1];
      l.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2).setRotation(Math.atan2(b.y - a.y, b.x - a.x)).setDepth(c.y + 1);
      l.setDisplaySize(Math.max(8, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) - BEAD * 0.55), 12);
    });
    this.cutsAt(c).forEach((i, k) => {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 6 + k);
      c.notches[k]?.setPosition(c.links[i].x, c.links[i].y).setDepth(c.y + 3).setDisplaySize(32 + 10 * pulse, 32 + 10 * pulse).setAlpha(0.55 + 0.45 * pulse);
    });
    if (c.x > this.layout.exit.x - 30) {
      c.gone = true;
      if (this.phase === 'play') {
        this.stats.missed++;
        this.stats.score = Math.max(0, this.stats.score - 4);
        this.hud.setScore(this.stats.score);
        this.popText(t('si.pop.missed'), this.layout.exit.x - 60, this.layout.exit.y - 60, '#ffd6a8');
        this.once('missed', 'fox', 'surprised', t('si.say.missed'), 2800);
      }
      this.fadeChain(c);
    }
  }

  /** Floating things push each other gently apart. */
  private spread(dt: number): void {
    const items = [
      ...this.things.filter((x) => !x.gone && x.entering <= 0).map((x) => ({ f: x as Floater, r: x.size * 0.45 })),
      ...this.chains.filter((c) => !c.gone && c.entering <= 0).map((c) => ({ f: c as Floater, r: 26 + c.beads.length * 11 })),
    ];
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const A = items[a];
        const B = items[b];
        const dx = B.f.x - A.f.x;
        const dy = (B.f.y - A.f.y) * 1.4;
        const d = Math.hypot(dx, dy) || 1;
        const overlap = A.r + B.r - d;
        if (overlap <= 0) continue;
        const push = Math.min(overlap, 200 * dt) * 0.5;
        for (const [it, sgn] of [[A, -1], [B, 1]] as const) {
          const x = it.f.x + (dx / d) * push * sgn;
          const y = it.f.y + (dy / d) * push * sgn * 0.6;
          if (this.inside.contains(x, y)) {
            it.f.x = x;
            it.f.y = y;
          }
        }
      }
    }
  }

  private fade(img: Phaser.GameObjects.Image, th?: Thing): void {
    if (th) th.gone = true;
    this.tweens.add({ targets: img, alpha: 0, scale: img.scale * 0.4, duration: 500, onComplete: () => img.destroy() });
  }

  private fadeChain(c: Chain): void {
    c.gone = true;
    for (const o of c.notches) o.destroy();
    this.tweens.add({ targets: [...c.beads, ...c.links], alpha: 0, scale: 0.2, duration: 500, onComplete: () => [...c.beads, ...c.links].forEach((o) => o.destroy()) });
  }

  // ---- input, pause, view, helpers ----------------------------------------------------------

  private onMove(p: Phaser.Input.Pointer): void {
    this.aim.set(p.worldX, p.worldY);
    if (this.phase !== 'play' || this.paused || !this.tool || !p.isDown || this.lastCut.x < 0) return;
    const here = new Phaser.Math.Vector2(p.worldX, p.worldY);
    if (Phaser.Math.Distance.BetweenPoints(here, this.lastCut) > 6) {
      this.act(here.x, here.y, this.lastCut.clone());
      this.lastCut.copy(here);
    }
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'play' || this.paused) return;
    const x = p.worldX;
    const y = p.worldY;
    this.aim.set(x, y);
    this.lastCut.set(x, y);
    // an opening?
    if (this.round < 3) {
      for (const src of ['bile', 'pancreas', 'wall'] as const) {
        const at = this.layout[src];
        if (Phaser.Math.Distance.Between(x, y, at.x, at.y) < DUCT_R) return this.takeFrom(src);
      }
    }
    this.toolImg.setPosition(x, y);
    this.act(x, y);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') return this.togglePause();
    if (this.phase !== 'play' || this.paused) return;
    const src = ({ '1': 'bile', '2': 'pancreas', '3': 'wall' } as const)[e.key as '1' | '2' | '3'];
    if (src && this.round < 3) return this.takeFrom(src);
    if (e.code !== 'Space' && e.key !== 'Enter') return;
    e.preventDefault();
    // act on the nearest thing the helper can work on (round 4: the nearest nutrient)
    const near = (x: number, y: number) => Phaser.Math.Distance.Between(x, y, this.aim.x, this.aim.y);
    if (this.round === 3) {
      const th = this.things.filter((q) => !q.gone && q.kind !== 'fibre').sort((a, b) => near(a.img.x, a.img.y) - near(b.img.x, b.img.y))[0];
      if (th) this.absorb(th, true);
      return;
    }
    const chain = this.chains.filter((c) => this.cutsAt(c).length).sort((a, b) => near(a.x, a.y) - near(b.x, b.y))[0];
    const th = this.things.filter((q) => !q.gone && this.canUse(q)).sort((a, b) => near(a.img.x, a.img.y) - near(b.img.x, b.img.y))[0];
    if (chain && (!th || near(chain.x, chain.y) < near(th.img.x, th.img.y))) return this.cutChain(chain, this.cutsAt(chain)[0]);
    if (th) this.act(th.img.x, th.img.y);
  }

  private togglePause(): void {
    if (this.phase !== 'play' && !this.paused) return;
    this.paused = !this.paused;
    this.tweens.pauseAll();
    this.time.paused = this.paused;
    if (this.paused) this.hud.pauseCard(() => this.togglePause());
    else this.tweens.resumeAll();
  }

  private fit(): void {
    const cam = this.cameras.main;
    const [W, H] = this.layout.size;
    cam.setZoom(Math.max(cam.width / W, cam.height / H));
    cam.centerOn(W / 2, H / 2);
  }

  private snipAnim(): void {
    this.tweens.killTweensOf(this.toolImg);
    const sx = this.toolImg.scaleX;
    this.tweens.add({ targets: this.toolImg, scaleX: sx * 0.8, angle: { from: -16, to: 0 }, duration: 90, yoyo: true, onComplete: () => this.toolImg.setScale(sx, this.toolImg.scaleY) });
  }

  private combo(): void {
    const streak = this.clock - this.stats.last < STREAK_GAP;
    this.stats.combo = streak ? this.stats.combo + 1 : 1;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.stats.last = this.clock;
    if (this.stats.combo === 5) this.react(GameState.hero ?? 'walid', 'cheering', t('si.say.streak'));
  }

  private comboBonus(): number {
    return Math.min(4, this.stats.combo - 1);
  }

  private score(points: number, x: number, y: number, label: string): void {
    this.stats.score = Math.max(0, this.stats.score + points);
    this.hud.setScore(this.stats.score);
    this.popText(`+${points}  ${label}`, x, y, '#fff4af');
  }

  private popText(text: string, x: number, y: number, color: string): void {
    const pop = this.add
      .text(x, y, text, { fontFamily: I18n.font, fontSize: '26px', fontStyle: 'bold', color, stroke: '#66315f', strokeThickness: 6, resolution: 2 })
      .setOrigin(0.5, 1).setDepth(2600);
    this.tweens.add({ targets: pop, y: pop.y - 50, alpha: 0, duration: 950, ease: 'Sine.easeOut', onComplete: () => pop.destroy() });
  }

  private makeTextures(): void {
    if (this.textures.exists('si_link_s')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('si_dot', 16, 16);
    g.clear().fillStyle(0xffffff, 1).fillPoints([
      { x: 12, y: 0 }, { x: 15, y: 9 }, { x: 24, y: 12 }, { x: 15, y: 15 }, { x: 12, y: 24 }, { x: 9, y: 15 }, { x: 0, y: 12 }, { x: 9, y: 9 },
    ] as Phaser.Math.Vector2[], true);
    g.generateTexture('si_star', 24, 24);
    g.clear();
    for (let i = 0; i < 32; i++) g.fillStyle(0xffc56b, Math.sin((i / 31) * Math.PI) ** 2 * 0.9).fillRect(i * 2, 0, 2, 128);
    g.generateTexture('si_band', 64, 128);
    g.clear();
    for (let r = 64; r > 0; r -= 4) g.fillStyle(0xffffff, 0.06).fillCircle(64, 64, r);
    g.generateTexture('si_glow', 128, 128);
    g.clear().lineStyle(8, 0xffffff, 1).strokeCircle(32, 32, 27);
    g.generateTexture('si_ring', 64, 64);
    for (const [key, base, light] of [['si_link_p', 0x2a86e8, 0x9fd8ff], ['si_link_s', 0x9a5ae0, 0xe2c6ff]] as const) {
      g.clear().fillStyle(base, 1).fillRoundedRect(0, 0, 40, 12, 6).fillStyle(light, 0.9).fillRoundedRect(6, 3, 28, 3, 2);
      g.generateTexture(key, 40, 12);
    }
    g.destroy();
  }

  private buddy(): Avatar {
    const hero = GameState.hero ?? 'walid';
    return hero === 'walid' ? 'nesma' : 'walid';
  }

  private storyKid(): Avatar {
    return GameState.storyLeader;
  }

  private react(who: Who, mood: Mood, text: string, ms?: number): void {
    this.hud.react(who, mood, text, ms);
  }

  private once(key: string, who: Who, mood: Mood, text: string, ms?: number): void {
    if (this.said.has(key)) return;
    if (this.hud.react(who, mood, text, ms)) this.said.add(key);
  }
}
