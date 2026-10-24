import { I18n, t, type Key } from '../i18n/i18n';
import Phaser from 'phaser';
import { asset } from '../assetUrl';
import { Sound } from '../audio/Sound';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { DialogueBox } from '../ui/DialogueBox';
import { type Mood, type Who } from '../ui/MiniGameHud';
import { StomachHud } from '../ui/StomachHud';
import { toast } from '../ui/Toast';
import { GameState, type Avatar } from '../state/GameState';
import { discoveryText } from '../state/discoveries';

/** stomach.json (tools/pipeline/pack_stomach.py), in pixels of the 1280x720 background. */
interface StomachLayout {
  size: [number, number];
  cardia: { x: number; y: number };
  pylorus: { x: number; y: number };
  inside: [number, number][];
  protein: number;
  fat: number;
}

const ROUND_SECONDS = [24, 22, 30, 25];
const STARS = [600, 1250]; // points for two and for three stars (everyone who finishes gets one)
const STREAK_GAP = 1.6;

// the walls' squeeze: a wave travels from the fundus (right) to the pylorus (left), then the walls relax
const SLICES = 96;
const PIVOT_Y = 410; // the squeeze closes the walls towards this line
const WAVE_TRAVEL = 1.8;
const WAVE_REST = 0.9;
const WAVE_FROM = 1250;
const WAVE_TO = 200;
const BAND = 105; // food this close to the wave's centre is being squeezed
const SQUEEZE = 0.11;
const SIGMA = 115;

// acidity 0 (neutral, pH 7) ... 1 (pH 1); pepsin works from pH 3 to 1.5
const ZONE: [number, number] = [4 / 6, 5.5 / 6];
const TOO_MUCH = 0.97;
const ACID_DOSE = 0.13;

/** Food chunk sizes, by how whole they still are (3 = a big bite). */
const CHUNK_SIZE = [0, 0, 84, 128];
const BEAD = 52;
const BEAD_GAP = 46;
const PROTEIN_TARGET = 5;
const PROTEIN_UNITS = 8;
const PEPTIDE_UNITS = 4;
const PEPTIDE_SECONDS = 3.2;
const PROTEIN_LANES = [{ x: 730, y: 325 }, { x: 730, y: 455 }] as const;

type Phase = 'intro' | 'banner' | 'play' | 'done';

interface Floater {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** falling in from the gate, down to this height */
  landY: number;
  falling: boolean;
  gone: boolean;
  wobble: number;
}
interface Chunk extends Floater {
  img: Phaser.GameObjects.Image;
  level: number;
  squash: number;
}
interface Germ extends Floater {
  img: Phaser.GameObjects.Image;
  zap: number;
  grow: number;
}
interface Chain extends Floater {
  beads: Phaser.GameObjects.Image[];
  links: Phaser.GameObjects.Image[];
  lane: number;
  part: -1 | 0 | 1;
  joint?: Phaser.GameObjects.Arc;
  label?: Phaser.GameObjects.Text;
  angle: number;
  spin: number;
  /** a short protein piece: seconds left before it melts into the chyme (-1: not yet) */
  peptide: number;
  shake: number;
  /** where each bead is drawn this frame (for cutting) */
  pts: Phaser.Math.Vector2[];
}
interface Molecule extends Floater {
  kind: 'maltose' | 'fat';
  img: Phaser.GameObjects.Image;
  homeX: number;
  angle: number;
  shake: number;
}

/**
 * The Stomach mini-game (after Dounia's designs and notes): the bolus falls in
 * by the gate at the top; the game happens inside; the chyme leaves by the
 * pylorus on the left. Four rounds, one job each:
 *   1 Churn  - the walls squeeze in waves (mechanical digestion): tap the food
 *              while a wave squeezes it, big chunks break into smaller ones;
 *   2 Acid   - keep the right acidity (about pH 2) with the acid flask; new food
 *              lowers it; in the zone the acid stops the germs;
 *   3 Pepsin - select the blue scissors and split five eight-unit proteins into
 *              four-unit peptide pieces (maltose and fat stay unchanged, and
 *              pepsin still needs the right acidity);
 *   4 Chyme  - the pylorus lets the chyme out in small squirts, at the right moment.
 * The prediction asked at the Stomach Gate is explained at the end.
 */
export class StomachScene extends Phaser.Scene {
  private layout!: StomachLayout;
  private inside!: Phaser.Geom.Polygon;
  private centre = new Phaser.Math.Vector2(760, 420);
  private hud!: StomachHud;
  private box!: DialogueBox;
  private phase: Phase = 'intro';
  private round = 0;
  private timeLeft = 0;
  private paused = false;
  private clock = 0;
  private slices: Phaser.GameObjects.Image[] = [];
  private band!: Phaser.GameObjects.Image;
  private arrows: Phaser.GameObjects.Image[] = [];
  private pool!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Image;
  private scissors!: Phaser.GameObjects.Image;
  private scissorsAim = new Phaser.Math.Vector2(700, 420);
  private lastCut = new Phaser.Math.Vector2(-1, -1);
  private waveT = 0;
  private waves = false;
  private chunks: Chunk[] = [];
  private germs: Germ[] = [];
  private chains: Chain[] = [];
  private molecules: Molecule[] = [];
  private pepsinSelected = false;
  private pepsinOvertime = false;
  private spawnIn = 0;
  private spawned = 0;
  private acid = 0.35;
  private acidOn = false;
  private zoneTick = 0;
  private chyme = 0;
  private pressure = 0;
  private squirts = 0;
  private skill = 1;
  private dots!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private acidDrops!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stats = { score: 0, churned: 0, combo: 0, bestCombo: 0, last: -9, zoneSeconds: 0, germs: 0, cuts: 0, polypeptides: 0, wrong: 0 };
  private said = new Set<string>();
  private handledKeys = new WeakSet<KeyboardEvent>();

  constructor() {
    super('Stomach');
  }

  preload(): void {
    this.load.json('stomach', asset('stomach/stomach.json'));
    this.load.image('st_bg', asset('stomach/background.webp'));
    for (const k of ['scissors', 'germ', 'chyme', 'fat_0', 'fat_1', 'fat_2']) this.load.image(`st_${k}`, asset(`stomach/${k}.webp`));
    this.load.image('st_maltose', asset('mouth/maltose.webp'));
    if (!this.textures.exists('m_bolus')) this.load.image('m_bolus', asset('mouth/bolus.webp'));
    this.load.once(Phaser.Loader.Events.FILE_COMPLETE + '-json-stomach', (_k: string, _t: string, data: StomachLayout) => {
      for (let i = 0; i < data.protein; i++) this.load.image(`st_protein_${i}`, asset(`stomach/protein_${String(i).padStart(2, '0')}.webp`));
    });
  }

  create(): void {
    this.layout = this.cache.json.get('stomach') as StomachLayout;
    GameState.place = 'stomach'; // continue from here (online save)
    const [W, H] = this.layout.size;
    this.inside = new Phaser.Geom.Polygon(this.layout.inside.flat());
    Object.assign(this, {
      phase: 'intro', round: 0, paused: false, clock: 0, waveT: 0, waves: false, spawnIn: 0, spawned: 0,
      acid: 0.35, acidOn: false, zoneTick: 0, chyme: 0, pressure: 0, squirts: 0, skill: 1,
      chunks: [], germs: [], chains: [], molecules: [], slices: [], arrows: [], pepsinSelected: false, pepsinOvertime: false,
    });
    this.stats = { score: 0, churned: 0, combo: 0, bestCombo: 0, last: -9, zoneSeconds: 0, germs: 0, cuts: 0, polypeptides: 0, wrong: 0 };
    this.said = new Set();
    this.handledKeys = new WeakSet();
    this.makeTextures();

    // the background, twice: a whole copy behind (seen where the walls close in), and thin strips
    // in front that the waves squeeze
    const tex = this.textures.get('st_bg').getSourceImage() as HTMLImageElement;
    const k = W / tex.width;
    this.add.image(0, 0, 'st_bg').setOrigin(0, 0).setScale(k).setDepth(-20);
    const sw = tex.width / SLICES;
    for (let i = 0; i < SLICES; i++) {
      const s = this.add.image(0, PIVOT_Y, 'st_bg').setOrigin(0, PIVOT_Y / H).setScale(k).setDepth(-10);
      s.setCrop(i * sw - 1, 0, sw + 2, tex.height);
      this.slices.push(s);
    }
    this.band = this.add.image(0, PIVOT_Y, 'st_band').setDisplaySize(BAND * 2 + 120, 560).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(-5);
    for (const dir of [1, -1]) {
      this.arrows.push(this.add.image(0, PIVOT_Y - dir * 215, 'st_arrow').setAngle(dir > 0 ? 180 : 0).setDisplaySize(70, 52).setAlpha(0).setDepth(900));
    }
    this.pool = this.add.image(720, 600, 'st_pool').setDisplaySize(900, 170).setAlpha(0).setDepth(-4).setTint(0xf6d9b8);
    this.ring = this.add.image(this.layout.pylorus.x, this.layout.pylorus.y, 'st_ring').setDisplaySize(190, 190).setAlpha(0).setDepth(950);
    this.scissors = this.add.image(700, 420, 'st_scissors').setOrigin(0.35, 0.3).setDepth(3000).setVisible(false);
    this.scissors.setDisplaySize(96, 96 * (this.scissors.height / this.scissors.width));

    this.dots = this.add.particles(0, 0, 'st_dot', {
      speed: { min: 80, max: 260 }, angle: { min: 0, max: 360 }, lifespan: { min: 350, max: 750 }, gravityY: 300,
      scale: { min: 0.25, max: 0.6 }, tint: [0xf6d9b8, 0xe8b98a, 0xfff0d8], alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(2400);
    this.sparks = this.add.particles(0, 0, 'st_star', {
      speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 }, lifespan: 800,
      scale: { start: 0.9, end: 0 }, rotate: { start: 0, end: 180 }, tint: [0xffe29a, 0xfff6e3, 0x9fe4ff],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(2500);
    this.acidDrops = this.add.particles(0, 0, 'st_dot', {
      speedY: { min: 120, max: 260 }, speedX: { min: -30, max: 30 }, lifespan: 900, gravityY: 400,
      scale: { start: 0.55, end: 0.2 }, tint: [0xffe14d, 0xfff17a, 0xffc93d], alpha: { start: 0.95, end: 0 }, emitting: false,
    }).setDepth(2450);

    this.hud = new StomachHud(() => this.togglePause(), () => this.addAcid(), () => this.selectPepsin(), ZONE);
    this.box = new DialogueBox(GameState.storyLeader);
    this.fit();
    this.scale.on('resize', this.fit, this);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.lastCut.set(-1, -1);
      if (p.wasTouch) this.scissors.setVisible(false); // leave the four-unit products unobstructed
    });
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    const onHide = () => {
      if (document.hidden && this.phase === 'play' && !this.paused) this.togglePause();
    };
    document.addEventListener('visibilitychange', onHide);
    const offLanguage = I18n.onChange(() => {
      this.labelPeptides();
      void document.fonts.ready.then(() => { if (this.sys.isActive()) this.labelPeptides(); });
    });
    const badge = document.getElementById('profile-btn');
    const hint = document.getElementById('hud');
    const badgeWas = badge?.hidden ?? true;
    if (badge) badge.hidden = true;
    if (hint) hint.hidden = true;
    Sound.duck(0.08, 1.2);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.fit, this);
      document.removeEventListener('visibilitychange', onHide);
      offLanguage();
      this.input.setDefaultCursor('default');
      this.hud.destroy();
      this.box.destroy();
      if (badge) badge.hidden = badgeWas;
    });
    this.cameras.main.fadeIn(700, 11, 21, 51);
    this.time.delayedCall(700, () => void this.run());
  }

  /** The whole visit: the bolus arrives, the four rounds, results, explanation. */
  private async run(): Promise<void> {
    // the trio's bolus drops in through the gate
    this.waves = true;
    this.dropChunk(3, this.layout.cardia.x, 470);
    await this.talk('intro');
    for (let r = 0; r < 4; r++) {
      this.round = r;
      this.hud.setRound(r);
      this.phase = 'banner';
      if (r === 1) {
        this.acidOn = true;
        this.acid = 0.4;
        this.hud.showAcid(true);
      }
      if (r >= 2) this.meltAll(); // clear the previous lesson before molecules or chyme arrive
      await this.hud.banner(r, t(`stomach.round${r + 1}.title` as Key), t(`stomach.round${r + 1}.text` as Key));
      if (r === 1) {
        this.react('amylase', 'happy', t('stomach.say.amylase'), 3200);
        // more food arrives, and germs with it
        const c = this.dropChunk(3);
        this.addGerm(c.x - 40, c.landY - 30);
        this.addGerm(c.x + 40, c.landY + 10);
      }
      if (r === 2) this.react('pepsin', 'happy', t('stomach.say.pepsinHi'), 2600);
      if (r === 3) this.react('stomach', 'happy', t('stomach.say.pylorus'));
      this.spawnIn = 0.3;
      this.spawned = 0;
      await this.playRound(ROUND_SECONDS[r]);
    }
    this.hud.setRound(4);
    this.hud.showAcid(false);
    this.waves = false;
    this.ring.setAlpha(0);
    const stars = 1 + (this.stats.score >= STARS[0] ? 1 : 0) + (this.stats.score >= STARS[1] ? 1 : 0);
    if (stars === 3) Sound.tone(523, 1046, 0.5, 0.08, 'triangle');
    await this.hud.results({ stars, ...this.stats });
    const runner = await DialogueRunner.load('stomach', GameState.storyLeader);
    runner.setVariable('predict_pepsin', GameState.prediction('pepsin'));
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
        // the chyme goes on to the small intestine: the next chapter, still to come
        this.scene.start('Chapter', {
          title: t('chapter.3'),
          subtitle: t('chapter.smallIntestine'),
          note: t('chapter.toBeContinued'),
          back: { scene: 'Stomach', label: t('chapter.playAgain') },
        });
      });
    });
  }

  private async talk(knot: string): Promise<void> {
    const runner = await DialogueRunner.load('stomach', GameState.storyLeader);
    await runner.run(knot, this.box);
  }

  private playRound(seconds: number): Promise<void> {
    this.timeLeft = seconds;
    this.hud.setTime(seconds);
    this.phase = 'play';
    this.scissors.setVisible(false);
    this.input.setDefaultCursor('default');
    if (this.round === 2) {
      this.pepsinSelected = false;
      this.pepsinOvertime = false;
      this.lastCut.set(-1, -1);
      this.hud.showPepsin(0, PROTEIN_TARGET, false, false);
      this.addMolecule('maltose');
      this.addMolecule('fat');
    }
    return new Promise((resolve) => {
      const check = () => {
        if (this.phase === 'play') this.time.delayedCall(100, check);
        else resolve();
      };
      check();
    });
  }

  private endRound(): void {
    if (this.round === 2 && (this.stats.cuts < PROTEIN_TARGET || this.chains.some((c) => !c.gone))) return;
    this.phase = 'banner';
    this.scissors.setVisible(false);
    this.input.setDefaultCursor('default');
    this.hud.hidePepsin();
    Sound.tone(660, 990, 0.25, 0.07, 'triangle');
  }

  update(_t: number, deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt;
    this.waveStep(dt);
    for (const c of this.chunks) this.moveChunk(c, dt);
    for (const g of this.germs) this.moveGerm(g, dt);
    for (const c of this.chains) this.moveChain(c, dt);
    for (const m of this.molecules) this.moveMolecule(m, dt);
    this.chunks = this.chunks.filter((c) => !c.gone);
    this.germs = this.germs.filter((g) => !g.gone);
    this.chains = this.chains.filter((c) => !c.gone);
    this.molecules = this.molecules.filter((m) => !m.gone);
    this.pool.setAlpha(Math.min(0.75, this.chyme / 100) * (0.85 + 0.15 * Math.sin(this.clock * 2)));
    this.scissors.x += (this.scissorsAim.x - this.scissors.x) * Math.min(1, dt * 20);
    this.scissors.y += (this.scissorsAim.y - this.scissors.y) * Math.min(1, dt * 20);
    this.scissors.setTint(this.inZone() ? 0xffffff : 0x8a93a8);
    if (this.phase !== 'play') return;

    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.hud.setTime(this.timeLeft);
    }
    if (this.timeLeft <= 0) {
      if (this.round !== 2) return this.endRound();
      if (!this.pepsinOvertime) {
        this.pepsinOvertime = true;
        this.hud.showPepsin(this.stats.cuts, PROTEIN_TARGET, this.pepsinSelected, true);
      }
    }
    if (this.round === 2 && this.stats.cuts === PROTEIN_TARGET && this.chains.length === 0) return this.endRound();
    if (this.acidOn) this.acidStep(dt);
    if (this.round <= 1) this.serveChunks(dt);
    if (this.round === 2) this.serveMolecules(dt);
    if (this.round === 3) this.pyloruStep(dt);
  }

  // ---- the walls' waves -----------------------------------------------------------

  /** 0..1 while a wave travels (eased in and out), 0 between waves. */
  private waveStrength(): number {
    if (!this.waves || this.waveT >= WAVE_TRAVEL) return 0;
    return Math.sin((this.waveT / WAVE_TRAVEL) * Math.PI);
  }

  private get waveX(): number {
    const u = Phaser.Math.Clamp(this.waveT / WAVE_TRAVEL, 0, 1);
    return WAVE_FROM + (WAVE_TO - WAVE_FROM) * u;
  }

  /** How much the walls close at x (0 = relaxed). */
  private squeezeAt(x: number): number {
    const s = this.waveStrength();
    return s ? SQUEEZE * s * Math.exp(-(((x - this.waveX) / SIGMA) ** 2)) : 0;
  }

  /** Where something at (x, y) is drawn while the walls squeeze. */
  private squeezedY(x: number, y: number): number {
    return PIVOT_Y + (y - PIVOT_Y) * (1 - this.squeezeAt(x) * 1.6);
  }

  private waveStep(dt: number): void {
    if (this.waves) {
      const before = this.waveT;
      this.waveT += dt;
      if (this.waveT >= WAVE_TRAVEL + WAVE_REST) this.waveT = 0;
      if (this.waveT < before) {
        // a new wave starts: a low rumble
        Sound.noise(1.2, 80, 0.7, 0.14);
        Sound.tone(68, 46, 1.2, 0.05, 'sine');
      }
    }
    const W = this.layout.size[0];
    const k = this.slices[0]?.scaleX ?? 1;
    for (const [i, s] of this.slices.entries()) s.scaleY = k * (1 - this.squeezeAt(((i + 0.5) * W) / SLICES));
    const strength = this.waveStrength();
    this.band.setX(this.waveX).setAlpha(0.55 * strength);
    // the arrows ride on the walls as they close in
    for (const [i, a] of this.arrows.entries()) {
      const wallY = PIVOT_Y + (i === 0 ? -215 : 215);
      a.setPosition(this.waveX, this.squeezedY(this.waveX, wallY) + (i === 0 ? 1 : -1) * 12 * strength).setAlpha(strength);
    }
    if (strength > 0.2 && this.round === 0 && this.phase === 'play') this.once('firstWave', 'stomach', 'happy', t('stomach.say.firstWave'), 2800);
  }

  private inBand(x: number): boolean {
    return this.waveStrength() > 0.15 && Math.abs(x - this.waveX) < BAND;
  }

  // ---- floating things --------------------------------------------------------------

  private floater(x: number, landY: number): Floater {
    return { x, y: this.layout.cardia.y + 30, vx: Phaser.Math.FloatBetween(-40, 40), vy: 120, landY, falling: true, gone: false, wobble: Math.random() * 6 };
  }

  /** Move a floating thing inside the stomach: fall in, drift, stay inside, drift towards the pylorus. */
  private float(f: Floater, dt: number, drift = 0): void {
    if (f.falling) {
      f.vy += 900 * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      if (f.y >= f.landY) {
        f.falling = false;
        f.vy = Phaser.Math.FloatBetween(-20, 20);
        f.vx = Phaser.Math.FloatBetween(-50, 30);
        this.landed();
      }
      return;
    }
    f.wobble += dt;
    f.vx += (Math.sin(f.wobble * 0.9) * 14 - drift - f.vx * 0.15) * dt;
    f.vy += (Math.cos(f.wobble * 0.7) * 10 - f.vy * 0.15) * dt;
    const nx = f.x + f.vx * dt;
    const ny = f.y + f.vy * dt;
    if (this.inside.contains(nx, ny)) {
      f.x = nx;
      f.y = ny;
    } else {
      // bounce back towards the middle
      const to = new Phaser.Math.Vector2(this.centre.x - f.x, this.centre.y - f.y).normalize();
      const speed = Math.max(30, Math.hypot(f.vx, f.vy));
      f.vx = to.x * speed;
      f.vy = to.y * speed;
    }
  }

  /** Something new arrived from the esophagus: food lowers the acidity. */
  private landed(): void {
    Sound.noise(0.18, 300, 1, 0.08);
    if (this.acidOn) this.acid = Math.max(0, this.acid - (this.round === 1 ? 0.1 : 0.05));
  }

  // ---- round 1-2: chunks of food --------------------------------------------------------

  private dropChunk(level: number, x = this.layout.cardia.x + Phaser.Math.Between(-30, 30), landY = Phaser.Math.Between(330, 540)): Chunk {
    const img = this.add.image(x, this.layout.cardia.y + 30, 'm_bolus');
    const c: Chunk = { ...this.floater(x, landY), img, level, squash: 0 };
    this.chunks.push(c);
    this.sizeChunk(c);
    if (level === 3 && this.phase === 'play') this.once('bigChunk', 'fox', 'surprised', t('stomach.say.bigChunk'));
    return c;
  }

  private sizeChunk(c: Chunk): void {
    const s = CHUNK_SIZE[c.level] / c.img.width;
    c.img.setScale(s * (1 + c.squash * 0.15), s * (1 - c.squash * 0.2));
  }

  private serveChunks(dt: number): void {
    this.spawnIn -= dt;
    const most = (this.round === 0 ? 5 : 8) + (this.skill > 1.2 ? 1 : 0);
    if (this.spawnIn > 0 || this.chunks.length >= most) return;
    this.spawnIn = (this.round === 0 ? 1.5 : 2.1) / this.skill;
    const c = this.dropChunk(Math.random() < 0.75 ? 3 : 2);
    this.spawned++;
    // round 2: germs come in with some of the food
    if (this.round === 1 && Math.random() < 0.65) this.addGerm(c.x + 30, c.landY - 20);
  }

  private moveChunk(c: Chunk, dt: number): void {
    if (c.gone) return;
    this.float(c, dt, this.round >= 1 ? 4 : 0);
    c.squash = Math.max(0, c.squash - dt * 4);
    // a wave going by squeezes it a little
    const sq = this.squeezeAt(c.x);
    this.sizeChunk(c);
    c.img.scaleY *= 1 - sq * 2.5;
    c.img.setPosition(c.x, this.squeezedY(c.x, c.y)).setDepth(c.y).setAngle(Math.sin(this.clock * 2 + c.wobble) * 6);
  }

  private crush(c: Chunk): void {
    c.squash = 1;
    Sound.noise(0.14, 700, 0.9, 0.2);
    Sound.tone(150, 80, 0.12, 0.07, 'triangle');
    this.dots.explode(c.level * 6, c.img.x, c.img.y);
    const streak = this.clock - this.stats.last < STREAK_GAP;
    this.stats.combo = streak ? this.stats.combo + 1 : 1;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.stats.last = this.clock;
    const bonus = 2 * Math.min(4, this.stats.combo - 1);
    if (c.level > 2) {
      // it breaks in two smaller pieces
      c.level--;
      const twin = this.dropChunk(c.level, c.x, c.y);
      twin.falling = false;
      twin.y = c.y;
      twin.vx = -c.vx + Phaser.Math.Between(-60, 60);
      twin.vy = Phaser.Math.Between(-70, -30);
      c.vy = Phaser.Math.Between(30, 70);
      this.addScore(8 + bonus, c.img.x, c.img.y - 40, this.stats.combo >= 2 ? t('stomach.pop.streak', { n: this.stats.combo }) : t('stomach.pop.squeeze'));
    } else {
      this.melt(c);
      this.stats.churned++;
      this.addScore(12 + bonus, c.img.x, c.img.y - 30, t('stomach.pop.churned'));
    }
    this.skill = Math.min(1.4, this.skill + 0.02);
    if (this.stats.combo === 4) this.react(GameState.hero ?? 'walid', 'cheering', t('stomach.say.streak'));
  }

  /** A chunk is churned up: it melts into the chyme at the bottom of the stomach. */
  private melt(c: Chunk): void {
    c.gone = true;
    this.chyme = Math.min(100, this.chyme + 4);
    this.tweens.add({ targets: c.img, scale: c.img.scale * 0.2, alpha: 0, y: c.img.y + 60, duration: 500, ease: 'Sine.easeIn', onComplete: () => c.img.destroy() });
  }

  /** Clear the previous lesson's objects; only active-play germ stops earn points. */
  private meltAll(): void {
    for (const c of this.chunks) this.melt(c);
    for (const g of this.germs) this.zapGerm(g, false);
    for (const ch of this.chains) this.meltChain(ch, false);
    for (const m of this.molecules) {
      m.gone = true;
      this.tweens.add({ targets: m.img, alpha: 0, scale: m.img.scale * 0.3, duration: 500, onComplete: () => m.img.destroy() });
    }
  }

  // ---- round 2: acid and germs ----------------------------------------------------------

  private inZone(): boolean {
    return this.acid >= ZONE[0] && this.acid <= ZONE[1];
  }

  private addAcid(): void {
    if (this.phase !== 'play' || !this.acidOn || this.paused) return;
    this.acid = Math.min(1, this.acid + ACID_DOSE);
    this.hud.pour();
    Sound.noise(0.25, 3200, 0.8, 0.09);
    Sound.tone(900, 1300, 0.12, 0.035);
    // gastric juice comes out of the walls
    for (const [x, y] of [[420, 250], [640, 200], [860, 200], [1080, 220]]) this.acidDrops.explode(5, x, y);
    if (this.acid > TOO_MUCH) {
      this.stats.score = Math.max(0, this.stats.score - 3);
      this.hud.setScore(this.stats.score);
      this.popText(t('stomach.pop.tooMuch'), 720, 300, '#ffd6a8');
      this.once('tooMuch', 'stomach', 'thinking', t('stomach.say.tooMuch'), 3000);
    }
  }

  private acidStep(dt: number): void {
    this.acid = Math.max(0, this.acid - dt * (this.round === 1 ? 0.04 : 0.028));
    const ok = this.inZone();
    this.hud.setAcidity(this.acid, ok, this.acid < ZONE[0]);
    if (ok) {
      this.stats.zoneSeconds += dt;
      this.zoneTick += dt;
      if (this.zoneTick >= 0.5) {
        this.zoneTick = 0;
        this.stats.score += 2;
        this.hud.setScore(this.stats.score);
      }
    } else if (this.acid < ZONE[0] - 0.08 && this.clock > 2) {
      this.once(this.round === 2 ? 'noAcid' : 'lowAcid', this.round === 2 ? 'pepsin' : this.buddy(), 'thinking', t(this.round === 2 ? 'stomach.say.noAcid' : 'stomach.say.lowAcid'));
    }
  }

  private addGerm(x: number, landY: number): void {
    const img = this.add.image(x, this.layout.cardia.y + 30, 'st_germ');
    img.setDisplaySize(58, 58);
    const g: Germ = { ...this.floater(x, landY), img, zap: 0, grow: 0 };
    this.germs.push(g);
    this.once('germs', 'fox', 'surprised', t('stomach.say.germs'));
  }

  private moveGerm(g: Germ, dt: number): void {
    if (g.gone) return;
    this.float(g, dt);
    if (this.phase === 'play' && !g.falling) {
      if (this.inZone()) {
        g.zap += dt;
        if (g.zap >= 1.1) this.zapGerm(g, true);
      } else if (this.germs.length < 10) {
        g.zap = Math.max(0, g.zap - dt);
        g.grow += dt;
        if (g.grow > 5) {
          // not acidic enough: the germs multiply
          g.grow = 0;
          const twin: Germ = { ...this.floater(g.x, g.y), img: this.add.image(g.x, g.y, 'st_germ').setDisplaySize(58, 58), zap: 0, grow: 0, falling: false };
          twin.y = g.y;
          this.germs.push(twin);
          this.once('germsGrow', this.buddy(), 'surprised', t('stomach.say.germsGrow'));
        }
      }
    }
    const fade = Math.min(1, g.zap / 1.1);
    g.img.setPosition(g.x, this.squeezedY(g.x, g.y)).setDepth(g.y + 1)
      .setAngle(Math.sin(this.clock * (5 + fade * 25) + g.wobble) * (10 + fade * 15))
      .setTint(Phaser.Display.Color.GetColor(255 - fade * 90, 255 - fade * 60, 255 - fade * 40));
  }

  private zapGerm(g: Germ, scored: boolean): void {
    if (g.gone) return;
    g.gone = true;
    this.sparks.explode(10, g.img.x, g.img.y);
    Sound.tone(1400, 500, 0.15, 0.04, 'square');
    if (scored) {
      this.stats.germs++;
      this.addScore(8, g.img.x, g.img.y - 30, t('stomach.pop.germ'));
      if (this.stats.germs === 2) this.react(this.storyKid(), 'happy', t('stomach.say.germZap'));
    }
    this.tweens.add({ targets: g.img, scale: 0, alpha: 0, angle: 180, duration: 350, onComplete: () => g.img.destroy() });
  }

  // ---- round 3: pepsin and the molecules ---------------------------------------------------

  private serveMolecules(dt: number): void {
    this.spawnIn -= dt;
    if (this.spawnIn > 0 || this.spawned >= PROTEIN_TARGET) return;
    // Each lane remains reserved while its two completed pieces are on display.
    // Maltose and fat have their own places, so they cannot block the next protein.
    const lane = PROTEIN_LANES.findIndex((_p, i) => !this.chains.some((c) => !c.gone && c.lane === i));
    if (lane < 0) return;
    this.spawnIn = 1.8 / this.skill;
    this.spawned++;
    this.addChain(lane);
  }

  private addChain(lane: number): void {
    const beads = Array.from({ length: PROTEIN_UNITS }, () =>
      this.add.image(this.layout.cardia.x, 0, `st_protein_${Phaser.Math.Between(0, this.layout.protein - 1)}`).setDisplaySize(BEAD, BEAD),
    );
    const c: Chain = {
      ...this.floater(this.layout.cardia.x, PROTEIN_LANES[lane].y), beads, links: [], lane, part: 0,
      angle: 0, spin: Phaser.Math.FloatBetween(-0.1, 0.1), peptide: -1, shake: 0, pts: [],
      joint: this.add.circle(0, 0, 13, 0x4aa7ef).setStrokeStyle(3, 0xffe29a).setVisible(false),
    };
    this.relink(c);
    this.chains.push(c);
  }

  /** (Re)make the little links between a chain's beads. */
  private relink(c: Chain): void {
    for (const l of c.links) l.destroy();
    c.links = [];
    for (let i = 0; i < c.beads.length - 1; i++) c.links.push(this.add.image(0, 0, 'st_link_p'));
  }

  private moveChain(c: Chain, dt: number): void {
    if (c.gone) return;
    const home = PROTEIN_LANES[c.lane];
    if (c.falling) {
      this.float(c, dt);
      c.x += (home.x - c.x) * Math.min(1, dt * 4);
    } else {
      c.wobble += dt;
      c.x += (home.x + c.part * 108 + Math.sin(c.wobble * 0.7) * 12 - c.x) * Math.min(1, dt * 4);
      c.y += (home.y + Math.sin(c.wobble * 0.9) * 7 - c.y) * Math.min(1, dt * 4);
    }
    c.shake = Math.max(0, c.shake - dt * 3);
    const n = c.beads.length;
    const sway = c.angle + Math.sin(this.clock * (0.35 + Math.abs(c.spin)) + c.wobble) * 0.1;
    const dir = new Phaser.Math.Vector2(Math.cos(sway), Math.sin(sway));
    const nrm = new Phaser.Math.Vector2(-dir.y, dir.x);
    c.pts = [];
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * BEAD_GAP;
      const wave = Math.sin(this.clock * 2.2 + i * 0.9 + c.wobble) * 7 + Math.sin(this.clock * 40) * c.shake * 6;
      const px = c.x + dir.x * along + nrm.x * wave;
      const py = c.y + dir.y * along + nrm.y * wave;
      c.pts.push(new Phaser.Math.Vector2(px, this.squeezedY(px, py)));
    }
    c.pts.forEach((p, i) => c.beads[i].setPosition(p.x, p.y).setDepth(c.y + 2).setAngle(Math.sin(this.clock * 1.5 + i) * 8));
    c.links.forEach((l, i) => {
      const a = c.pts[i];
      const b = c.pts[i + 1];
      l.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2).setRotation(Math.atan2(b.y - a.y, b.x - a.x)).setDepth(c.y + 1);
      l.setDisplaySize(Math.max(8, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) - BEAD * 0.55), 13);
      l.setTint(c.peptide < 0 && i === PEPTIDE_UNITS - 1 ? 0xffe29a : 0xffffff);
    });
    if (c.joint) {
      const a = c.pts[PEPTIDE_UNITS - 1];
      const b = c.pts[PEPTIDE_UNITS];
      c.joint.setVisible(!c.falling).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2)
        .setDepth(c.y + 5).setScale(1 + Math.sin(this.clock * 6) * 0.12);
    }
    c.label?.setPosition(c.x, this.squeezedY(c.x, c.y) + 46);
    if (c.peptide >= 0) {
      // a peptide: ready, it glows and melts into the chyme
      c.peptide -= dt;
      for (const b of c.beads) b.setTint(0xcff4ff);
      if (c.peptide <= 0) this.meltChain(c, true);
    }
  }

  private meltChain(c: Chain, scored: boolean): void {
    if (c.gone) return;
    c.gone = true;
    c.joint?.destroy();
    c.label?.destroy();
    if (scored) {
      this.chyme = Math.min(100, this.chyme + 3);
      this.addScore(8, c.x, c.y - 40, t('stomach.pop.peptide'));
    }
    this.tweens.add({ targets: [...c.beads, ...c.links], alpha: 0, scale: 0.2, y: '+=50', duration: 600, ease: 'Sine.easeIn', onComplete: () => [...c.beads, ...c.links].forEach((o) => o.destroy()) });
  }

  private addMolecule(kind: Molecule['kind']): void {
    const home = kind === 'maltose' ? { x: 420, y: 375 } : { x: 1030, y: 405 };
    const img = this.add.image(this.layout.cardia.x, 0, kind === 'maltose' ? 'st_maltose' : `st_fat_${Phaser.Math.Between(0, this.layout.fat - 1)}`);
    const width = kind === 'maltose' ? 140 : 125;
    img.setDisplaySize(width, width * img.height / img.width);
    this.molecules.push({ ...this.floater(this.layout.cardia.x, home.y), kind, img, homeX: home.x, angle: Phaser.Math.FloatBetween(-12, 12), shake: 0 });
    if (kind === 'fat') this.once('lipase', 'lipase', 'happy', t('stomach.say.lipase'), 3000);
  }

  private moveMolecule(m: Molecule, dt: number): void {
    if (m.gone) return;
    if (m.falling) {
      this.float(m, dt);
      m.x += (m.homeX - m.x) * Math.min(1, dt * 4);
    } else {
      m.wobble += dt;
      m.x = m.homeX + Math.sin(m.wobble * 0.7) * 15;
      m.y = m.landY + Math.sin(m.wobble * 0.8) * 12;
    }
    m.shake = Math.max(0, m.shake - dt * 3);
    m.img.setPosition(m.x + Math.sin(this.clock * 40) * m.shake * 8, this.squeezedY(m.x, m.y)).setDepth(m.y)
      .setAngle(m.angle + Math.sin(this.clock * 1.3 + m.wobble) * 8);
  }

  private selectPepsin(): void {
    if (this.phase !== 'play' || this.round !== 2 || this.paused || this.stats.cuts >= PROTEIN_TARGET) return;
    this.pepsinSelected = true;
    this.scissors.setVisible(true);
    this.input.setDefaultCursor('none');
    this.lastCut.set(-1, -1);
    this.hud.showPepsin(this.stats.cuts, PROTEIN_TARGET, true, this.pepsinOvertime);
  }

  /** Only the middle bond is a cut site: eight units become two intact groups of four. */
  private snip(x: number, y: number, from?: Phaser.Math.Vector2): boolean {
    if (this.phase !== 'play' || this.round !== 2 || this.paused || this.stats.cuts >= PROTEIN_TARGET) return false;
    if (!this.pepsinSelected) {
      this.hud.hintPepsin('stomach.pepsin.select');
      return false;
    }
    const seg = from ? new Phaser.Geom.Line(from.x, from.y, x, y) : null;
    const near = (px: number, py: number, r: number) =>
      seg ? Phaser.Geom.Intersects.LineToCircle(seg, new Phaser.Geom.Circle(px, py, r)) : Phaser.Math.Distance.Between(x, y, px, py) < r;
    // Prefer the visible cut site to nearby beads, especially on touch screens.
    for (const c of this.chains) {
      if (c.gone || c.falling || c.peptide >= 0 || c.pts.length !== PROTEIN_UNITS) continue;
      const a = c.pts[PEPTIDE_UNITS - 1];
      const b = c.pts[PEPTIDE_UNITS];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (!near(mx, my, 32)) continue;
      if (!this.inZone()) {
        this.hud.hintPepsin('stomach.pepsin.acid');
        if (!seg || !this.said.has('noAcidPop')) {
          this.popText(t('stomach.pop.noAcid'), x, y - 30, '#ffd6a8');
          this.said.add('noAcidPop');
          this.time.delayedCall(1500, () => this.said.delete('noAcidPop'));
        }
        this.once('noAcidSay', 'pepsin', 'happy', t('stomach.say.noAcid'));
        return false;
      }
      this.cutChain(c, mx, my);
      return true;
    }
    if (seg) return false;
    // Finished pieces stay intact; other protein bonds teach the four-unit target.
    for (const c of this.chains) {
      if (c.gone || c.falling || !c.pts.some((p) => near(p.x, p.y, BEAD * 0.7))) continue;
      this.hud.hintPepsin(c.peptide >= 0 ? 'stomach.pepsin.short' : 'stomach.pepsin.four');
      return false;
    }
    const molecule = this.molecules.find((m) => !m.gone && !m.falling && near(m.img.x, m.img.y, m.img.displayWidth * 0.48));
    if (molecule) {
      molecule.shake = 1;
      return this.wrongCut(x, y, molecule.kind);
    }
    return false;
  }

  private wrongCut(x: number, y: number, what: Molecule['kind']): boolean {
    if (this.clock - this.stats.last < 0.25) return false; // one swipe is one mistake
    this.stats.last = this.clock;
    this.stats.wrong++;
    this.stats.combo = 0;
    this.stats.score = Math.max(0, this.stats.score - 3);
    this.hud.setScore(this.stats.score);
    this.snipAnim();
    Sound.tone(300, 180, 0.18, 0.07, 'square');
    Sound.tone(600, 900, 0.08, 0.04, 'triangle', 0.1); // boing
    this.popText(t('stomach.pop.notProtein'), x, y - 30, '#ffd6e8');
    this.hud.hintPepsin('stomach.pepsin.onlyProtein');
    if (what === 'maltose') this.once('maltose', 'amylase', 'happy', t('stomach.say.maltose'), 2800);
    return false;
  }

  private cutChain(c: Chain, x: number, y: number): void {
    if (c.gone || c.peptide >= 0 || c.beads.length !== PROTEIN_UNITS) return;
    this.snipAnim();
    Sound.tone(2200, 1400, 0.06, 0.06, 'square');
    Sound.noise(0.06, 4000, 1, 0.08);
    this.sparks.explode(8, x, y);
    this.stats.cuts++;
    this.stats.polypeptides += 2;
    const streak = this.clock - this.stats.last < STREAK_GAP;
    this.stats.combo = streak ? this.stats.combo + 1 : 1;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.stats.last = this.clock;
    this.addScore(35 + Math.min(4, this.stats.combo - 1), x, y - 30, t('stomach.pop.cut'));
    // the chain becomes two: each half keeps its beads and drifts apart
    const left = c.beads.slice(0, PEPTIDE_UNITS);
    const right = c.beads.slice(PEPTIDE_UNITS);
    for (const l of c.links) l.destroy();
    c.gone = true;
    c.joint?.destroy();
    const dir = new Phaser.Math.Vector2(Math.cos(c.angle), Math.sin(c.angle));
    for (const [part, sign] of [[left, -1], [right, 1]] as const) {
      const n = part.length;
      const cx = part.reduce((s, b) => s + b.x, 0) / n;
      const cy = part.reduce((s, b) => s + b.y, 0) / n;
      const piece: Chain = {
        ...c, beads: [...part], links: [], x: cx, y: cy, vx: c.vx + dir.x * sign * 70, vy: c.vy + dir.y * sign * 70 - 10,
        gone: false, falling: false, pts: [], shake: 0.6, spin: c.spin + sign * 0.2, peptide: PEPTIDE_SECONDS, part: sign,
        joint: undefined,
        label: this.add.text(cx, cy + 46, '', { fontSize: '22px', fontStyle: '700', color: '#ffe29a', stroke: '#13234d', strokeThickness: 4 }).setOrigin(0.5).setDepth(2800),
      };
      this.relink(piece);
      this.chains.push(piece);
    }
    this.labelPeptides();
    this.hud.showPepsin(this.stats.cuts, PROTEIN_TARGET, true, this.pepsinOvertime);
    this.once('peptide', this.buddy(), 'happy', t('stomach.say.peptide'), 2800);
    if (this.stats.cuts === PROTEIN_TARGET) {
      this.scissors.setVisible(false);
      this.input.setDefaultCursor('default');
      Sound.chime();
    }
  }

  private labelPeptides(): void {
    for (const c of this.chains) c.label?.setRTL(I18n.rtl).setStyle({ fontFamily: I18n.font }).setText(t('stomach.pepsin.polypeptide'));
  }

  private snipAnim(): void {
    this.tweens.killTweensOf(this.scissors);
    const sx = this.scissors.scaleX;
    this.tweens.add({ targets: this.scissors, scaleX: sx * 0.8, angle: { from: -16, to: 0 }, duration: 90, yoyo: true, onComplete: () => this.scissors.setScale(sx, this.scissors.scaleY) });
  }

  // ---- round 4: the pylorus ------------------------------------------------------------

  private pyloruStep(dt: number): void {
    this.pressure += dt / (1.35 / this.skill);
    if (this.pressure > 1.3) {
      this.pressure = 0; // missed it: it closes again
      this.once('pylorusHint', 'stomach', 'happy', t('stomach.say.pylorus'));
    }
    const open = this.pressure >= 0.75;
    this.ring.setAlpha(0.35 + 0.65 * Math.min(1, this.pressure)).setTint(open ? 0x7cf08a : 0xffd36b);
    this.ring.setDisplaySize(130 + 80 * Math.min(1, this.pressure), 130 + 80 * Math.min(1, this.pressure));
  }

  private squirt(): void {
    if (this.squirts >= 5) return;
    if (this.pressure < 0.75) {
      this.popText(t('stomach.pop.tooSoon'), this.layout.pylorus.x + 140, this.layout.pylorus.y - 60, '#ffd6a8');
      this.pressure = 0;
      this.stats.combo = 0;
      Sound.tone(260, 200, 0.12, 0.05, 'square');
      return;
    }
    const perfect = this.pressure < 1.05;
    this.pressure = 0;
    this.squirts++;
    const { pylorus } = this.layout;
    Sound.tone(300, 120, 0.4, 0.09, 'sine');
    Sound.noise(0.3, 500, 1.2, 0.12);
    for (let i = 0; i < 3; i++) {
      const b = this.add.image(320 + i * 30, 360 + i * 25, 'st_chyme').setDisplaySize(70, 70).setDepth(2000);
      this.tweens.add({
        targets: b, x: pylorus.x - 20, y: pylorus.y + 10, scale: b.scale * 0.3, alpha: 0.2, delay: i * 90, duration: 520, ease: 'Sine.easeIn',
        onComplete: () => b.destroy(),
      });
    }
    this.chyme = Math.max(0, this.chyme - 100 / 5);
    this.addScore(perfect ? 25 : 18, pylorus.x + 150, pylorus.y - 40, t('stomach.pop.squirt'));
    if (this.squirts >= 5) {
      this.react('fox', 'cheering', t('stomach.say.squirts'));
      this.time.delayedCall(900, () => {
        if (this.phase === 'play') this.endRound();
      });
    }
  }

  // ---- input, pause, view, helpers -------------------------------------------------------

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.paused) return;
    this.scissorsAim.set(p.worldX, p.worldY);
    if (this.phase !== 'play' || this.round !== 2) return;
    if (this.pepsinSelected && this.stats.cuts < PROTEIN_TARGET) this.scissors.setVisible(!p.wasTouch || p.isDown);
    if (!p.isDown) return;
    // a swipe cuts what it crosses
    const here = new Phaser.Math.Vector2(p.worldX, p.worldY);
    if (this.lastCut.x >= 0 && Phaser.Math.Distance.BetweenPoints(here, this.lastCut) > 6) {
      this.snip(here.x, here.y, this.lastCut.clone());
      this.lastCut.copy(here);
    }
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'play' || this.paused) return;
    const x = p.worldX;
    const y = p.worldY;
    this.scissorsAim.set(x, y);
    this.lastCut.set(x, y);
    if (this.round <= 1) return this.tapChunk(x, y);
    if (this.round === 2) {
      this.scissors.setVisible(this.pepsinSelected && this.stats.cuts < PROTEIN_TARGET);
      this.scissors.setPosition(x, y);
      this.snip(x, y);
      return;
    }
    this.squirt();
  }

  private tapChunk(x: number, y: number): void {
    const c = this.chunks
      .filter((q) => !q.gone && !q.falling)
      .find((q) => Phaser.Math.Distance.Between(x, y, q.img.x, q.img.y) < CHUNK_SIZE[q.level] * 0.62);
    if (!c) return;
    if (this.inBand(c.x)) return this.crush(c);
    // the walls are relaxed here: wait for the wave
    c.squash = 0.4;
    this.stats.combo = 0;
    Sound.tone(400, 330, 0.08, 0.04, 'triangle');
    this.popText(t('stomach.pop.wait'), c.img.x, c.img.y - 50, '#fff6e3');
    this.once('wait', this.buddy(), 'thinking', t('stomach.say.wait'));
  }

  private onKey(e: KeyboardEvent): void {
    // Phaser can deliver a queued native event again when new keys arrive between frames.
    if (this.handledKeys.has(e)) return;
    this.handledKeys.add(e);
    if (e.repeat && (e.key === 'Escape' || e.key.toLowerCase() === 'p')) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') return this.togglePause();
    if (this.phase !== 'play' || this.paused) return;
    if (e.key === 'a' || e.key === 'A') return this.addAcid();
    if (this.round === 2) {
      if (e.code === 'Digit2' || e.code === 'Numpad2') return this.selectPepsin();
    }
    if (e.code !== 'Space' && e.key !== 'Enter') return;
    e.preventDefault();
    if (this.round <= 1) {
      // squeeze the chunk the wave is on
      const c = this.chunks.filter((q) => !q.gone && !q.falling && this.inBand(q.x)).sort((a, b) => Math.abs(a.x - this.waveX) - Math.abs(b.x - this.waveX))[0];
      if (c) this.crush(c);
    } else if (this.round === 2) {
      const c = this.chains.find((c) => !c.gone && !c.falling && c.peptide < 0 && c.pts.length === PROTEIN_UNITS);
      if (!c) return;
      const a = c.pts[PEPTIDE_UNITS - 1];
      const b = c.pts[PEPTIDE_UNITS];
      this.scissorsAim.set((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.snip(this.scissorsAim.x, this.scissorsAim.y);
    } else this.squirt();
  }

  private togglePause(): void {
    if (this.phase !== 'play' && !this.paused) return;
    this.paused = !this.paused;
    this.lastCut.set(-1, -1);
    this.tweens.pauseAll();
    this.time.paused = this.paused;
    if (this.paused) this.hud.pauseCard(() => this.togglePause());
    else this.tweens.resumeAll();
  }

  /** The picture covers the screen (no bars), centred. */
  private fit(): void {
    const cam = this.cameras.main;
    const [W, H] = this.layout.size;
    cam.setZoom(Math.max(cam.width / W, cam.height / H));
    cam.centerOn(W / 2, H / 2);
  }

  private addScore(points: number, x: number, y: number, label: string): void {
    this.stats.score = Math.max(0, this.stats.score + points);
    this.hud.setScore(this.stats.score);
    this.popText(`${points > 0 ? `+${points}` : points}  ${label}`, x, y, points >= 10 ? '#fff4af' : '#ffffff');
  }

  private popText(text: string, x: number, y: number, color: string): void {
    const pop = this.add
      .text(x, y, text, { fontFamily: I18n.font, fontSize: '26px', fontStyle: 'bold', color, stroke: '#66315f', strokeThickness: 6, resolution: 2 })
      .setOrigin(0.5, 1).setDepth(2600);
    this.tweens.add({ targets: pop, y: pop.y - 50, alpha: 0, duration: 950, ease: 'Sine.easeOut', onComplete: () => pop.destroy() });
  }

  private makeTextures(): void {
    if (this.textures.exists('st_link_s')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('st_dot', 16, 16);
    g.clear().fillStyle(0xffffff, 1).fillPoints([
      { x: 12, y: 0 }, { x: 15, y: 9 }, { x: 24, y: 12 }, { x: 15, y: 15 }, { x: 12, y: 24 }, { x: 9, y: 15 }, { x: 0, y: 12 }, { x: 9, y: 9 },
    ] as Phaser.Math.Vector2[], true);
    g.generateTexture('st_star', 24, 24);
    // the wave's glow: soft at its edges
    g.clear();
    for (let i = 0; i < 32; i++) {
      const a = Math.sin((i / 31) * Math.PI) ** 2;
      g.fillStyle(0xffc56b, a * 0.9).fillRect(i * 2, 0, 2, 128);
    }
    g.generateTexture('st_band', 64, 128);
    g.clear().fillStyle(0xffd76b, 1).fillTriangle(0, 34, 46, 34, 23, 0).lineStyle(3, 0xa86d12, 1).strokeTriangle(0, 34, 46, 34, 23, 0);
    g.generateTexture('st_arrow', 46, 34);
    g.clear().lineStyle(10, 0xffffff, 1).strokeCircle(64, 64, 56).lineStyle(4, 0xffffff, 0.4).strokeCircle(64, 64, 44);
    g.generateTexture('st_ring', 128, 128);
    for (const [key, base, light] of [['st_link_p', 0x2a86e8, 0x9fd8ff], ['st_link_s', 0x9a5ae0, 0xe2c6ff]] as const) {
      g.clear().fillStyle(base, 1).fillRoundedRect(0, 0, 40, 14, 7).fillStyle(light, 0.9).fillRoundedRect(6, 3, 28, 3, 2);
      g.generateTexture(key, 40, 14);
    }
    g.clear();
    for (let r = 64; r > 0; r -= 4) g.fillStyle(0xffffff, 0.06).fillEllipse(128, 64, r * 4, r * 2);
    g.generateTexture('st_pool', 256, 128);
    g.destroy();
  }

  /** The friend who is not the player. */
  private buddy(): Avatar {
    const hero = GameState.hero ?? 'walid';
    return hero === 'walid' ? 'nesma' : 'walid';
  }

  /** The kid who speaks the story's lines. */
  private storyKid(): Avatar {
    return GameState.storyLeader;
  }

  private react(who: Who, mood: Mood, text: string, ms?: number): void {
    this.hud.react(who, mood, text, ms);
  }

  /** Say something the first time it happens only. */
  private once(key: string, who: Who, mood: Mood, text: string, ms?: number): void {
    if (this.said.has(key)) return;
    if (this.hud.react(who, mood, text, ms)) this.said.add(key);
  }
}
