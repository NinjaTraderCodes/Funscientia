import { I18n, t } from '../i18n/i18n';
import Phaser from 'phaser';
import { asset } from '../assetUrl';
import { Sound } from '../audio/Sound';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { DialogueBox } from '../ui/DialogueBox';
import { MouthHud, type Mood, type Who } from '../ui/MouthHud';
import { toast } from '../ui/Toast';
import { GameState, type Avatar } from '../state/GameState';
import { discoveryText } from '../state/discoveries';

/** mouth.json (tools/pipeline/pack_mouth.py), in pixels of the 1280x853 background. */
interface MouthLayout {
  size: [number, number];
  holes: { x: number; y: number; w: number }[];
  throat: { x: number; y: number };
  ring: { x: number; y: number };
}

type FoodKind = 'bread' | 'bread_b' | 'bread_c' | 'brownie' | 'cheese' | 'broccoli' | 'carrot';
/** bites to chew it up, points, whether it is starchy (saliva turns it sweet), crumb colour */
const FOODS: Record<FoodKind, { bites: number; points: number; starch: boolean; crumbs: number }> = {
  bread: { bites: 1, points: 10, starch: true, crumbs: 0xefb36b },
  bread_b: { bites: 2, points: 12, starch: true, crumbs: 0xe8ae65 },
  bread_c: { bites: 1, points: 10, starch: true, crumbs: 0xebaf67 },
  brownie: { bites: 1, points: 10, starch: true, crumbs: 0x8a4a22 },
  cheese: { bites: 2, points: 12, starch: false, crumbs: 0xffe56c },
  broccoli: { bites: 2, points: 14, starch: false, crumbs: 0x83ca48 },
  carrot: { bites: 3, points: 18, starch: false, crumbs: 0xfa8e2b },
};
/** Which foods each round serves (harder ones as the rounds go on). */
const MENU: FoodKind[][] = [
  ['bread', 'bread', 'bread_c', 'brownie', 'bread_b', 'cheese'],
  ['bread', 'bread_b', 'bread_c', 'cheese', 'broccoli', 'carrot', 'brownie'],
  ['bread', 'bread_b', 'bread_c', 'cheese', 'broccoli', 'carrot', 'brownie', 'bread'],
  // round 4: starchy foods only - each one holds a starch chain
  ['bread', 'bread_b', 'bread_c', 'brownie', 'bread', 'bread_c'],
];
const ROUND_SECONDS = [20, 20, 25, 30];
// round 4: starch chains of six units; salivary amylase cuts them into pairs (maltose)
const STARCH_UNITS = 6;
const BEAD = 46;
const BEAD_GAP = 41;
const STARS = [600, 1500]; // points for two and for three stars (everyone who finishes gets one); tuned with paced test players
const STREAK_GAP = 1.5; // seconds between chews that still count as one crunch streak

interface Food {
  hole: number;
  kind: FoodKind | null;
  img: Phaser.GameObjects.Image;
  /** 0 hidden ... 1 fully up */
  pop: number;
  state: 'empty' | 'rising' | 'up' | 'sinking';
  timer: number;
  bites: number;
  /** the tongue mixed it: a bonus if it is chewed soon */
  mixedUntil: number;
  squash: number;
}

type Phase = 'intro' | 'banner' | 'play' | 'swallow' | 'done';

/** Round 4: a starch chain freed from a bread (or, once cut, a maltose pair). */
interface Chain {
  beads: Phaser.GameObjects.Image[];
  links: Phaser.GameObjects.Image[];
  /** gold rings where amylase may cut */
  notches: Phaser.GameObjects.Image[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  wobble: number;
  /** seconds before an uncut chain sinks back (a pair: before it slides down the throat) */
  life: number;
  shake: number;
  gone: boolean;
  pts: Phaser.Math.Vector2[];
}

/**
 * The Mouth mini-game (after Dounia's "Mouth Hammer" prototype): the child is
 * the mouth. Three rounds introduce its jobs one at a time - 1 Chew (tap the
 * foods with the tooth-hammer), 2 Mix (the tongue joins: it mixes food for a
 * bonus, but don't bite it), 3 Moisten (keep the saliva up; moist bread turns
 * sweet - amylase) - then the food ball is swallowed and the gate's prediction
 * is explained. The friends react as it goes; the difficulty follows the player.
 */
export class MouthScene extends Phaser.Scene {
  private layout!: MouthLayout;
  private hud!: MouthHud;
  private box!: DialogueBox;
  private phase: Phase = 'intro';
  private round = 0;
  private timeLeft = 0;
  private foods: Food[] = [];
  private hammer!: Phaser.GameObjects.Image;
  private hammerAim = new Phaser.Math.Vector2(640, 500);
  private kbHole = 5;
  private tongue!: Phaser.GameObjects.Image;
  private tongueState: 'home' | 'out' | 'mixing' | 'back' | 'ouch' = 'home';
  private tongueIn = 3;
  private saliva = 85;
  private sprayIdle = 0;
  private skill = 1;
  private paused = false;
  private emitters = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();
  private sugar!: Phaser.GameObjects.Particles.ParticleEmitter;
  private drops!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stats = { score: 0, chewed: 0, combo: 0, bestCombo: 0, bites: 0, sweets: 0, maltose: 0, lastChew: -9 };
  /** round 4: the starch chains, and whether amylase's scissors are in hand */
  private chains: Chain[] = [];
  private scissorsOn = false;
  private scissors!: Phaser.GameObjects.Image;
  private lastCut = new Phaser.Math.Vector2(-1, -1);
  private noChainsFor = 0;
  private said = new Set<string>();
  private clock = 0;

  constructor() {
    super('Mouth');
  }

  preload(): void {
    this.load.json('mouth', asset('mouth/mouth.json'));
    this.load.image('mouth_bg', asset('mouth/background.webp'));
    for (const k of [...Object.keys(FOODS), 'hammer', 'tongue', 'tongue_ouch', 'bolus', 'amylase_scissors']) this.load.image(`m_${k}`, asset(`mouth/${k}.webp`));
    // the purple starch units (Dounia's, from the Stomach's art)
    for (let i = 0; i < 7; i++) this.load.image(`st_starch_${i}`, asset(`stomach/starch_${String(i).padStart(2, '0')}.webp`));
  }

  create(): void {
    this.layout = this.cache.json.get('mouth') as MouthLayout;
    GameState.place = 'mouth'; // continue from here (online save)
    const [W, H] = this.layout.size;
    Object.assign(this, { phase: 'intro', round: 0, saliva: 85, skill: 1, paused: false, tongueState: 'home', foods: [], clock: 0 });
    this.stats = { score: 0, chewed: 0, combo: 0, bestCombo: 0, bites: 0, sweets: 0, maltose: 0, lastChew: -9 };
    this.chains = [];
    this.scissorsOn = false;
    this.noChainsFor = 0;
    this.said = new Set();
    this.emitters = new Map();

    this.add.image(0, 0, 'mouth_bg').setOrigin(0, 0).setDisplaySize(W, H).setDepth(-10);
    this.makeTextures();
    for (const [i, h] of this.layout.holes.entries()) {
      const img = this.add.image(h.x, h.y, 'm_bread').setOrigin(0.5, 1).setVisible(false).setDepth(h.y);
      this.foods.push({ hole: i, kind: null, img, pop: 0, state: 'empty', timer: 0.4 + i * 0.25, bites: 0, mixedUntil: 0, squash: 0 });
    }
    this.tongue = this.add.image(this.layout.ring.x, this.layout.ring.y, 'm_tongue').setVisible(false).setDepth(2000);
    this.hammer = this.add.image(640, 500, 'm_hammer').setOrigin(0.72, 0.42).setDepth(3000).setVisible(false);
    this.hammer.setDisplaySize(150, 150 * (this.hammer.height / this.hammer.width));
    this.scissors = this.add.image(640, 500, 'm_amylase_scissors').setOrigin(0.35, 0.3).setDepth(3000).setVisible(false);
    this.scissors.setDisplaySize(110, 110 * (this.scissors.height / this.scissors.width));
    this.sugar = this.add.particles(0, 0, 'm_star', {
      speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, lifespan: 900, gravityY: 120,
      scale: { start: 0.9, end: 0 }, rotate: { start: 0, end: 180 }, tint: [0xffe29a, 0xfff6e3, 0xffd36b],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(2500);
    this.drops = this.add.particles(0, 0, 'm_dot', {
      speed: { min: 120, max: 320 }, angle: { min: 200, max: 340 }, lifespan: 800, gravityY: 600,
      scale: { start: 0.7, end: 0.2 }, tint: [0x8cefff, 0xbcffff, 0x49d9ff], alpha: { start: 0.95, end: 0 }, emitting: false,
    }).setDepth(2500);

    this.hud = new MouthHud(() => this.togglePause(), () => this.spray(), () => this.toggleScissors());
    this.box = new DialogueBox(GameState.storyLeader);
    this.fit();
    this.scale.on('resize', this.fit, this);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.lastCut.set(p.worldX, p.worldY);
      if (this.scissorsOn) return this.snip(p.worldX, p.worldY);
      this.strike(p.worldX, p.worldY, true);
    });
    this.input.on('pointerup', () => this.lastCut.set(-1, -1));
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    const onHide = () => {
      if (document.hidden && this.phase === 'play' && !this.paused) this.togglePause();
    };
    document.addEventListener('visibilitychange', onHide);
    // the profile badge and the walking hint do not belong in here
    const badge = document.getElementById('profile-btn');
    const hint = document.getElementById('hud');
    const badgeWas = badge?.hidden ?? true;
    if (badge) badge.hidden = true;
    if (hint) hint.hidden = true;
    Sound.duck(0.08, 1.2); // the birds outside fade far away
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.fit, this);
      document.removeEventListener('visibilitychange', onHide);
      this.hud.destroy();
      this.box.destroy();
      if (badge) badge.hidden = badgeWas;
    });
    this.cameras.main.fadeIn(700, 11, 21, 51);
    this.time.delayedCall(800, () => void this.run());
  }

  /** The whole visit: intro, three rounds, swallow, results, explanation. */
  private async run(): Promise<void> {
    await this.talk('intro');
    const rounds = [
      { title: () => t('mouth.round1.title'), text: () => t('mouth.round1.text') },
      { title: () => t('mouth.round2.title'), text: () => t('mouth.round2.text') },
      { title: () => t('mouth.round3.title'), text: () => t('mouth.round3.text') },
      { title: () => t('mouth.round4.title'), text: () => t('mouth.round4.text') },
    ];
    for (let r = 0; r < 4; r++) {
      this.round = r;
      this.hud.setRound(r);
      this.phase = 'banner';
      this.clearFoods();
      if (r === 2) {
        this.hud.showSaliva(true);
        this.hud.setSaliva(this.saliva, false);
      }
      if (r === 3) {
        // the food is moist now: the saliva's enzyme gets to work
        this.hud.showSaliva(false);
        this.tongueHome(true);
        this.hud.showAmylase(true, false);
      }
      await this.hud.banner(r, rounds[r].title(), rounds[r].text());
      if (r === 1) this.react(this.storyKid(), 'surprised', t('mouth.say.tongueComes'));
      if (r === 3) this.react('amylase', 'happy', t('mouth.say.amylaseHi'), 3200);
      await this.playRound(ROUND_SECONDS[r]);
    }
    this.hud.setRound(4);
    this.hud.showAmylase(false, false);
    this.setScissors(false);
    this.meltChains();
    await this.swallow();
    await this.talk('swallow_fact');
    const stars = 1 + (this.stats.score >= STARS[0] ? 1 : 0) + (this.stats.score >= STARS[1] ? 1 : 0);
    if (stars === 3) Sound.tone(523, 1046, 0.5, 0.08, 'triangle');
    await this.hud.results({ stars, ...this.stats });
    const runner = await DialogueRunner.load('mouth', GameState.storyLeader);
    runner.setVariable('predict_saliva', GameState.prediction('saliva'));
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
        // the bolus goes down the esophagus - and the trio follows it
        this.scene.start('Chapter', {
          title: t('chapter.2'),
          subtitle: t('chapter.esophagus'),
          artwork: 'esophagus',
          next: { scene: 'World', data: { place: 'esophagus' } },
        });
      });
    });
  }

  private async talk(knot: string): Promise<void> {
    const runner = await DialogueRunner.load('mouth', GameState.storyLeader);
    await runner.run(knot, this.box);
  }

  private playRound(seconds: number): Promise<void> {
    this.timeLeft = seconds;
    this.hud.setTime(seconds);
    this.phase = 'play';
    this.hammer.setVisible(true);
    this.tongueIn = 1.6;
    return new Promise((resolve) => {
      const check = () => {
        if (this.phase === 'play') this.time.delayedCall(100, check);
        else resolve();
      };
      check();
    });
  }

  update(_t: number, deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt;
    // the hammer follows the pointer (or the keyboard's hole)
    this.hammer.x += (this.hammerAim.x - this.hammer.x) * Math.min(1, dt * 18);
    this.hammer.y += (this.hammerAim.y - this.hammer.y) * Math.min(1, dt * 18);
    for (const f of this.foods) this.drawFood(f, dt);
    for (const c of this.chains) this.moveChain(c, dt);
    this.chains = this.chains.filter((c) => !c.gone);
    this.scissors.x += (this.hammerAim.x - this.scissors.x) * Math.min(1, dt * 20);
    this.scissors.y += (this.hammerAim.y - this.scissors.y) * Math.min(1, dt * 20);
    if (this.phase !== 'play') return;

    this.timeLeft -= dt;
    this.hud.setTime(this.timeLeft);
    if (this.timeLeft <= 0) {
      this.phase = 'banner';
      this.hammer.setVisible(false);
      this.setScissors(false);
      this.tongueHome(true);
      Sound.tone(660, 990, 0.25, 0.07, 'triangle');
      return;
    }
    this.serveFood(dt);
    if (this.round === 1 || this.round === 2) this.tongueStep(dt);
    if (this.round === 2) this.salivaStep(dt);
    if (this.round === 3) this.scissorsStep(dt);
  }

  // ---- food -------------------------------------------------------------------

  private serveFood(dt: number): void {
    const up = this.foods.filter((f) => f.state !== 'empty').length;
    const most = 2 + this.round + (this.skill > 1.2 ? 1 : 0);
    for (const f of this.foods) {
      f.timer -= dt;
      if (f.state === 'empty' && f.timer <= 0 && up < most) {
        const menu = MENU[this.round];
        f.kind = menu[Math.floor(Math.random() * menu.length)];
        f.img.setTexture(`m_${f.kind}`).setVisible(true);
        f.bites = 0;
        f.state = 'rising';
        f.mixedUntil = 0;
        Sound.tone(500, 820, 0.09, 0.035);
        if (f.kind.startsWith('bread') && !this.said.has('bread')) this.once('bread', 'fox', 'happy', t('mouth.say.bread'));
        return; // one new food at a time
      }
      if (f.state === 'up' && f.timer <= 0) {
        f.state = 'sinking';
        if (f.bites === 0) this.skill = Math.max(0.85, this.skill - 0.04); // missed: slow down a little
      }
    }
  }

  private drawFood(f: Food, dt: number): void {
    if (f.state === 'empty' || !f.kind) return;
    const h = this.layout.holes[f.hole];
    if (f.state === 'rising') {
      f.pop = Math.min(1, f.pop + dt / 0.22);
      if (f.pop >= 1) {
        f.state = 'up';
        f.timer = (2.1 - this.round * 0.15) / this.skill + Math.random() * 0.6;
      }
    } else if (f.state === 'sinking') {
      f.pop = Math.max(0, f.pop - dt / 0.24);
      if (f.pop <= 0) {
        f.state = 'empty';
        f.kind = null;
        f.img.setVisible(false);
        f.timer = (0.5 + Math.random() * 1.1) / this.skill;
        return;
      }
    }
    f.squash = Math.max(0, f.squash - dt * 5);
    // smaller with every bite; it rises out of its hole (the part below the rim is hidden)
    const left = 1 - (f.bites / FOODS[f.kind].bites) * 0.35;
    const w = h.w * 0.84 * left;
    const img = f.img;
    const s = w / img.width;
    const fullH = img.height * s;
    const rim = h.y + h.w * 0.05; // the front edge of the hole
    const bottom = rim + fullH * (1 - f.pop) * 0.95;
    const wobble = Math.sin(this.clock * 3 + f.hole) * 2;
    img.setPosition(h.x + wobble, bottom).setScale(s * (1 + f.squash * 0.12), s * (1 - f.squash * 0.18));
    const visible = Phaser.Math.Clamp((rim - (bottom - fullH)) / fullH, 0, 1);
    img.setCrop(0, 0, img.width, img.height * visible);
    // dry food looks dusty; food the tongue just mixed glows
    if (this.round >= 2 && this.saliva < 30) img.setTint(0xd9c9a9);
    else if (f.mixedUntil > this.clock) img.setTint(0xfff3c8);
    else img.clearTint();
  }

  /** Top of a food that is up (where the hammer lands on it). */
  private foodTop(f: Food): Phaser.Math.Vector2 {
    const img = f.img;
    return new Phaser.Math.Vector2(img.x, img.y - img.displayHeight * 0.55);
  }

  private strike(x: number, y: number, fromPointer: boolean): void {
    if (this.phase === 'swallow') return this.tapThroat(x, y);
    if (this.phase !== 'play' || this.paused) return;
    if (fromPointer) this.hammerAim.set(x, y);
    this.hammer.setPosition(x, y);
    this.tweens.add({ targets: this.hammer, angle: { from: -38, to: 0 }, duration: 140, ease: 'Back.easeOut' });

    // the tongue? (it is quick - and it does not like being bitten)
    if ((this.tongueState === 'out' || this.tongueState === 'mixing') && Phaser.Math.Distance.Between(x, y, this.tongue.x, this.tongue.y) < 70) {
      return this.biteTongue();
    }
    const f = this.foods
      .filter((q) => (q.state === 'up' || q.state === 'rising') && q.pop > 0.5 && q.kind)
      .find((q) => {
        const t = this.foodTop(q);
        return Math.abs(x - q.img.x) < q.img.displayWidth * 0.62 && y > t.y - q.img.displayHeight * 0.55 && y < q.img.y + 12;
      });
    Sound.noise(0.05, 300, 1, 0.08);
    if (!f || !f.kind) return;
    const def = FOODS[f.kind];
    if (this.round === 3) return this.freeStarch(f);
    const dry = this.round >= 2 && this.saliva < 30;
    f.bites++;
    f.squash = 1;
    this.crumbs(f, dry ? 6 : 10, dry);
    Sound.noise(0.09, dry ? 2400 : 900, 0.9, 0.22);
    Sound.tone(180, 90, 0.08, 0.06, 'triangle');
    if (this.round >= 2) this.saliva = Math.max(0, this.saliva - 2.5);
    if (f.bites < def.bites) {
      this.addScore(1, f, `${def.bites - f.bites} more!`);
      return;
    }
    // chewed up!
    f.state = 'sinking';
    this.crumbs(f, 22, dry);
    this.stats.chewed++;
    this.skill = Math.min(1.45, this.skill + 0.03);
    const streak = this.clock - this.stats.lastChew < STREAK_GAP;
    this.stats.combo = streak ? this.stats.combo + 1 : 1;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.stats.lastChew = this.clock;
    let points = dry ? Math.round(def.points / 2) : def.points;
    let label = dry ? t('mouth.pop.dry') : t('mouth.pop.crunch');
    if (this.stats.combo >= 2) {
      points += 2 * Math.min(4, this.stats.combo - 1); // a streak bonus, capped at x5
      label = t('mouth.pop.streak', { n: this.stats.combo });
      Sound.tone(500 + this.stats.combo * 80, 900 + this.stats.combo * 80, 0.12, 0.05, 'triangle');
      this.cameras.main.shake(90, 0.002 * Math.min(4, this.stats.combo));
    }
    if (f.mixedUntil > this.clock) {
      points += 5;
      label = t('mouth.pop.assist');
    }
    if (this.round === 2 && def.starch && this.saliva >= 50) {
      points += 3;
      this.stats.sweets++;
      this.sugar.explode(14, f.img.x, f.img.y - f.img.displayHeight * 0.5);
      Sound.tone(1320, 1760, 0.18, 0.045);
      label = t('mouth.pop.sweet');
      this.once('sweet', this.storyKid(), 'surprised', t('mouth.say.sweet'));
    }
    this.addScore(points, f, label);
    if (this.stats.chewed === 1) this.once('first', this.buddy(), 'happy', t('mouth.say.firstChew'));
    if (this.stats.combo === 4) this.react(GameState.hero ?? 'walid', 'cheering', t('mouth.say.machine'));
  }

  private addScore(points: number, f: Food, label: string): void {
    this.stats.score = Math.max(0, this.stats.score + points);
    this.hud.setScore(this.stats.score);
    const pop = this.add
      .text(f.img.x, f.img.y - f.img.displayHeight - 10, `${points > 0 ? `+${points}` : points}  ${label}`, {
        fontFamily: I18n.font, fontSize: '26px', fontStyle: 'bold',
        color: points >= 10 ? '#fff4af' : '#ffffff', stroke: '#66315f', strokeThickness: 6, resolution: 2,
      })
      .setOrigin(0.5, 1).setDepth(2600);
    this.tweens.add({ targets: pop, y: pop.y - 50, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: () => pop.destroy() });
  }

  private crumbs(f: Food, n: number, dry: boolean): void {
    const color = dry ? 0xd9c9a9 : FOODS[f.kind!].crumbs;
    let e = this.emitters.get(color);
    if (!e) {
      e = this.add.particles(0, 0, 'm_dot', {
        speed: { min: 90, max: 280 }, angle: { min: 190, max: 350 }, lifespan: { min: 350, max: 800 }, gravityY: 700,
        scale: { min: 0.25, max: 0.6 }, tint: color, alpha: { start: 1, end: 0.2 }, emitting: false,
      }).setDepth(2400);
      this.emitters.set(color, e);
    }
    e.explode(n, f.img.x, f.img.y - f.img.displayHeight * 0.45);
  }

  private clearFoods(): void {
    for (const f of this.foods) if (f.state !== 'empty') f.state = 'sinking';
  }

  // ---- the tongue -------------------------------------------------------------

  private tongueStep(dt: number): void {
    if (this.tongueState !== 'home') return;
    this.tongueIn -= dt;
    if (this.tongueIn > 0) return;
    const ready = this.foods.filter((f) => f.state === 'up' && f.kind && f.mixedUntil < this.clock);
    if (!ready.length) {
      this.tongueIn = 0.4;
      return;
    }
    const f = ready[Math.floor(Math.random() * ready.length)];
    this.tongueState = 'out';
    const { ring } = this.layout;
    const to = this.foodTop(f);
    this.tongue.setTexture('m_tongue').setPosition(ring.x, ring.y).setVisible(true).setAlpha(1).setAngle(0);
    this.tongue.setDisplaySize(120, 120 * (this.tongue.height / this.tongue.width)).setFlipX(true);
    Sound.tone(300, 900, 0.3, 0.05, 'sine');
    this.tweens.add({
      targets: this.tongue, x: to.x + 40, y: to.y - 20, duration: 380, ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.tongueState !== 'out') return;
        this.tongueState = 'mixing';
        if (f.state === 'up') {
          f.mixedUntil = this.clock + 2.6;
          f.timer += 0.8; // it stays up a little longer: go get it
          this.tweens.add({ targets: f.img, angle: { from: -12, to: 12 }, duration: 110, yoyo: true, repeat: 3, onComplete: () => f.img.setAngle(0) });
          this.sugar.explode(5, f.img.x, f.img.y - f.img.displayHeight * 0.6);
          this.once('mix', 'tooth', 'happy', t('mouth.say.mix'));
        }
        this.tweens.add({ targets: this.tongue, angle: { from: -10, to: 10 }, duration: 120, yoyo: true, repeat: 2, onComplete: () => this.tongueHome() });
      },
    });
  }

  private tongueHome(fast = false): void {
    if (this.tongueState === 'home') return;
    this.tongueState = 'back';
    const { ring } = this.layout;
    this.tweens.killTweensOf(this.tongue);
    this.tweens.add({
      targets: this.tongue, x: ring.x, y: ring.y, alpha: 0.2, duration: fast ? 220 : 320, ease: 'Sine.easeIn',
      onComplete: () => {
        this.tongue.setVisible(false);
        this.tongueState = 'home';
        this.tongueIn = (2.4 + Math.random() * 2.2) / this.skill;
      },
    });
  }

  private biteTongue(): void {
    this.tongueState = 'ouch';
    this.stats.bites++;
    this.stats.combo = 0;
    this.tweens.killTweensOf(this.tongue);
    this.tongue.setTexture('m_tongue_ouch');
    this.tongue.setDisplaySize(130, 130 * (this.tongue.height / this.tongue.width));
    this.cameras.main.shake(160, 0.006);
    Sound.tone(880, 220, 0.35, 0.09, 'sawtooth');
    Sound.tone(440, 300, 0.25, 0.05, 'triangle', 0.12);
    this.stats.score = Math.max(0, this.stats.score - 5);
    this.hud.setScore(this.stats.score);
    const pop = this.add.text(this.tongue.x, this.tongue.y - 70, t('mouth.pop.ouch'), {
      fontFamily: I18n.font, fontSize: '32px', fontStyle: 'bold', color: '#ffd6e8', stroke: '#7a1f45', strokeThickness: 7, resolution: 2,
    }).setOrigin(0.5).setDepth(2600);
    this.tweens.add({ targets: pop, y: pop.y - 40, alpha: 0, duration: 1000, onComplete: () => pop.destroy() });
    const lines: [Who, Mood, string][] = [
      ['fox', 'surprised', t('mouth.say.poorTongue')],
      [this.buddy(), 'surprised', t('mouth.say.careful', { name: GameState.nameOf(GameState.hero ?? 'walid') })],
      ['tooth', 'thinking', t('mouth.say.everyone')],
    ];
    const [who, mood, text] = lines[(this.stats.bites - 1) % lines.length];
    this.react(who, mood, text);
    this.tweens.add({ targets: this.tongue, angle: { from: -14, to: 14 }, duration: 70, yoyo: true, repeat: 4, onComplete: () => this.tongueHome() });
  }

  // ---- saliva -----------------------------------------------------------------

  private salivaStep(dt: number): void {
    this.saliva = Math.max(0, this.saliva - dt * 3.2);
    this.sprayIdle += dt;
    const glow = this.saliva < 40 || this.sprayIdle > 6;
    this.hud.setSaliva(this.saliva, glow);
    if (this.saliva < 30) this.once('dry', this.buddy(), 'thinking', t('mouth.say.dry'));
  }

  private spray(): void {
    if (this.phase !== 'play' || this.round < 2 || this.paused) return;
    this.saliva = Math.min(100, this.saliva + 45);
    this.sprayIdle = 0;
    this.hud.setSaliva(this.saliva, false);
    const [W, H] = this.layout.size;
    for (let i = 0; i < 3; i++) this.drops.explode(10, W * (0.3 + i * 0.2), H * 0.5);
    Sound.noise(0.35, 5000, 0.6, 0.1);
    Sound.tone(700, 1100, 0.17, 0.04);
    this.once('spray', this.storyKid(), 'happy', t('mouth.say.spray'));
  }

  // ---- round 4: starch, and salivary amylase's scissors -------------------------------

  /** A hit on moist bread: its starch shows - a long purple chain rises out of it. */
  private freeStarch(f: Food): void {
    f.state = 'sinking';
    f.squash = 1;
    this.crumbs(f, 16, false);
    Sound.noise(0.1, 900, 0.9, 0.2);
    Sound.tone(500, 900, 0.18, 0.05, 'triangle');
    this.stats.chewed++;
    const x = Phaser.Math.Clamp(f.img.x, 250, 1030);
    const y = f.img.y - f.img.displayHeight * 0.5;
    const beads = Array.from({ length: STARCH_UNITS }, () => this.add.image(x, y, `st_starch_${Phaser.Math.Between(0, 6)}`).setDisplaySize(BEAD, BEAD).setScale(0));
    const c: Chain = {
      beads, links: [], notches: [], x, y, vx: Phaser.Math.FloatBetween(-25, 25), vy: -45,
      angle: Phaser.Math.FloatBetween(-0.2, 0.2), wobble: Math.random() * 6, life: 9, shake: 0, gone: false, pts: [],
    };
    this.relink(c);
    this.chains.push(c);
    this.tweens.add({ targets: beads, scale: BEAD / beads[0].width, duration: 380, ease: 'Back.easeOut' });
    this.addScore(6, f, t('mouth.pop.starch'));
    this.once('starchChain', 'fox', 'surprised', t('mouth.say.starchChain'));
    this.hud.showAmylase(true, this.scissorsOn, this.chains.length > 0);
  }

  /** Where amylase may cut: between pairs (link i joins beads i and i + 1). */
  private cutsAt(c: Chain): number[] {
    const at: number[] = [];
    for (let i = 1; i < c.beads.length - 1; i += 2) at.push(i);
    return at;
  }

  private relink(c: Chain): void {
    for (const o of [...c.links, ...c.notches]) o.destroy();
    c.links = [];
    for (let i = 0; i < c.beads.length - 1; i++) c.links.push(this.add.image(0, 0, 'm_link_s'));
    const at = this.cutsAt(c);
    for (const i of at) c.links[i].setTint(0xffe29a);
    c.notches = at.map(() => this.add.image(0, 0, 'm_ring').setTint(0xffd36b).setBlendMode(Phaser.BlendModes.ADD));
  }

  private moveChain(c: Chain, dt: number): void {
    if (c.gone) return;
    const pair = c.beads.length === 2;
    if (this.phase === 'play' || pair) c.life -= dt;
    if (c.life <= 0) {
      c.gone = true;
      for (const n of c.notches) n.destroy();
      if (pair) {
        // a maltose pair slides down the throat
        const { throat } = this.layout;
        this.tweens.add({ targets: [...c.beads, ...c.links], x: throat.x, y: throat.y, scale: 0.1, alpha: 0.3, duration: 650, ease: 'Sine.easeIn', onComplete: () => [...c.beads, ...c.links].forEach((o) => o.destroy()) });
      } else {
        // not cut in time: it sinks back into the food
        this.tweens.add({ targets: [...c.beads, ...c.links], y: '+=90', alpha: 0, duration: 500, ease: 'Sine.easeIn', onComplete: () => [...c.beads, ...c.links].forEach((o) => o.destroy()) });
      }
      return;
    }
    // it floats up a little, then hovers over the teeth
    c.wobble += dt;
    c.vy += (-c.vy * 1.6 + Math.sin(c.wobble * 1.1) * 12) * dt;
    c.vx += (Math.sin(c.wobble * 0.8) * 14 - c.vx * 0.3) * dt;
    c.x = Phaser.Math.Clamp(c.x + c.vx * dt, 200 + (c.beads.length * BEAD_GAP) / 2, 1080 - (c.beads.length * BEAD_GAP) / 2);
    c.y = Phaser.Math.Clamp(c.y + c.vy * dt, 350, 540);
    c.shake = Math.max(0, c.shake - dt * 3);
    const n = c.beads.length;
    const sway = c.angle + Math.sin(this.clock * 0.6 + c.wobble) * 0.25;
    const dir = new Phaser.Math.Vector2(Math.cos(sway), Math.sin(sway));
    const nrm = new Phaser.Math.Vector2(-dir.y, dir.x);
    c.pts = [];
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * BEAD_GAP;
      const wave = Math.sin(this.clock * 2.4 + i * 0.9 + c.wobble) * 6 + Math.sin(this.clock * 40) * c.shake * 5;
      c.pts.push(new Phaser.Math.Vector2(c.x + dir.x * along + nrm.x * wave, c.y + dir.y * along + nrm.y * wave));
    }
    c.pts.forEach((p, i) => c.beads[i].setPosition(p.x, p.y).setDepth(2300).setAngle(Math.sin(this.clock * 1.5 + i) * 8));
    c.links.forEach((l, i) => {
      const a = c.pts[i];
      const b = c.pts[i + 1];
      l.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2).setRotation(Math.atan2(b.y - a.y, b.x - a.x)).setDepth(2299);
      l.setDisplaySize(Math.max(8, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) - BEAD * 0.55), 12);
    });
    this.cutsAt(c).forEach((i, k) => {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 6 + k);
      c.notches[k]?.setPosition(c.links[i].x, c.links[i].y).setDepth(2301).setDisplaySize(30 + 9 * pulse, 30 + 9 * pulse)
        .setAlpha(this.scissorsOn ? 0.55 + 0.45 * pulse : 0.3);
    });
    if (pair) {
      const shine = 0.5 + 0.5 * Math.sin(this.clock * 10);
      for (const b of c.beads) b.setTint(Phaser.Display.Color.GetColor(255, 220 + 35 * shine, 255));
    }
  }

  /** Amylase's scissors in hand, or the hammer again. */
  private setScissors(on: boolean): void {
    this.scissorsOn = on;
    this.scissors.setVisible(on && this.phase === 'play');
    this.hammer.setVisible(!on && this.phase === 'play');
    this.hud.showAmylase(this.round === 3 && this.phase === 'play', on, this.chains.length > 0);
  }

  private toggleScissors(): void {
    if (this.phase !== 'play' || this.round !== 3 || this.paused) return;
    this.setScissors(!this.scissorsOn);
    Sound.tone(this.scissorsOn ? 900 : 600, this.scissorsOn ? 1500 : 400, 0.12, 0.05, 'triangle');
  }

  /** With nothing left to cut, the hammer comes back by itself. */
  private scissorsStep(dt: number): void {
    const cuttable = this.chains.some((c) => !c.gone && c.beads.length > 2);
    this.noChainsFor = cuttable ? 0 : this.noChainsFor + dt;
    if (this.scissorsOn && this.noChainsFor > 0.9) this.setScissors(false);
    this.hud.showAmylase(true, this.scissorsOn, cuttable);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    this.hammerAim.set(p.worldX, p.worldY);
    if (!this.scissorsOn || !p.isDown || this.lastCut.x < 0) return;
    // a swipe cuts what it crosses
    const here = new Phaser.Math.Vector2(p.worldX, p.worldY);
    if (Phaser.Math.Distance.BetweenPoints(here, this.lastCut) > 6) {
      this.snip(here.x, here.y, this.lastCut.clone());
      this.lastCut.copy(here);
    }
  }

  /** A snip at a point (or along a swipe): the chain's nearest glowing bond is cut. */
  private snip(x: number, y: number, from?: Phaser.Math.Vector2): void {
    if (this.phase !== 'play' || this.paused) return;
    const seg = from ? new Phaser.Geom.Line(from.x, from.y, x, y) : null;
    let best: { c: Chain; i: number; d: number } | null = null;
    for (const c of this.chains) {
      if (c.gone || c.beads.length <= 2) continue;
      for (let i = 0; i < c.pts.length - 1; i++) {
        const mx = (c.pts[i].x + c.pts[i + 1].x) / 2;
        const my = (c.pts[i].y + c.pts[i + 1].y) / 2;
        const d = Phaser.Math.Distance.Between(x, y, mx, my);
        const hit = seg ? Phaser.Geom.Intersects.LineToCircle(seg, new Phaser.Geom.Circle(mx, my, 20)) : d < 44;
        if (hit && (!best || d < best.d)) best = { c, i, d };
      }
    }
    if (!best) {
      if (!seg && !this.chains.some((c) => c.beads.length > 2)) this.setScissors(false);
      return;
    }
    const { c } = best;
    const at = this.cutsAt(c);
    const i = at.reduce((b, k) => (Math.abs(k - best!.i) < Math.abs(b - best!.i) ? k : b), at[0]);
    this.cutChain(c, i);
  }

  private cutChain(c: Chain, i: number): void {
    const mx = (c.pts[i].x + c.pts[i + 1].x) / 2;
    const my = (c.pts[i].y + c.pts[i + 1].y) / 2;
    this.tweens.killTweensOf(this.scissors);
    const sx = this.scissors.scaleX;
    this.tweens.add({ targets: this.scissors, scaleX: sx * 0.8, angle: { from: -16, to: 0 }, duration: 90, yoyo: true, onComplete: () => this.scissors.setScale(sx, this.scissors.scaleY) });
    Sound.tone(2200, 1400, 0.06, 0.06, 'square');
    Sound.noise(0.06, 4000, 1, 0.08);
    this.sugar.explode(8, mx, my);
    const streak = this.clock - this.stats.lastChew < STREAK_GAP;
    this.stats.combo = streak ? this.stats.combo + 1 : 1;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.stats.lastChew = this.clock;
    // the chain becomes two; pairs are maltose (one pop for the whole cut)
    const pairs = [i + 1, c.beads.length - i - 1].filter((n) => n === 2).length;
    const points = 5 + Math.min(3, this.stats.combo - 1) + 4 * pairs;
    this.popAt(points, mx, my - 30, pairs ? t('mouth.pop.maltose') : t('mouth.pop.snip'));
    for (const o of [...c.links, ...c.notches]) o.destroy();
    c.gone = true;
    const dir = new Phaser.Math.Vector2(Math.cos(c.angle), Math.sin(c.angle));
    for (const [part, sign] of [[c.beads.slice(0, i + 1), -1], [c.beads.slice(i + 1), 1]] as const) {
      const n = part.length;
      const piece: Chain = {
        ...c, beads: [...part], links: [], notches: [], pts: [], gone: false, shake: 0.6,
        x: part.reduce((s, b) => s + b.x, 0) / n, y: part.reduce((s, b) => s + b.y, 0) / n,
        vx: c.vx + dir.x * sign * 60, vy: c.vy - 20, life: n === 2 ? 1.6 : c.life + 2,
      };
      this.relink(piece);
      this.chains.push(piece);
      if (n === 2) this.maltose(piece);
    }
  }

  /** A pair: maltose - two sugar units, it tastes sweet. */
  private maltose(c: Chain): void {
    this.stats.maltose++;
    this.sugar.explode(14, c.x, c.y);
    Sound.tone(1320, 1760, 0.18, 0.045);
    if (this.stats.maltose === 2) this.react(this.storyKid(), 'surprised', t('mouth.say.maltose'), 3000);
  }

  /** The round is over: what is left melts away. */
  private meltChains(): void {
    for (const c of this.chains) {
      c.gone = true;
      for (const n of c.notches) n.destroy();
      this.tweens.add({ targets: [...c.beads, ...c.links], alpha: 0, scale: 0.2, duration: 400, onComplete: () => [...c.beads, ...c.links].forEach((o) => o.destroy()) });
    }
    this.chains = [];
  }

  private popAt(points: number, x: number, y: number, label: string): void {
    this.stats.score = Math.max(0, this.stats.score + points);
    this.hud.setScore(this.stats.score);
    const pop = this.add
      .text(x, y, `+${points}  ${label}`, { fontFamily: I18n.font, fontSize: '26px', fontStyle: 'bold', color: '#fff4af', stroke: '#66315f', strokeThickness: 6, resolution: 2 })
      .setOrigin(0.5, 1).setDepth(2600);
    this.tweens.add({ targets: pop, y: pop.y - 50, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: () => pop.destroy() });
  }

  // ---- swallow ------------------------------------------------------------------

  private bolus?: Phaser.GameObjects.Image;

  private async swallow(): Promise<void> {
    this.phase = 'banner';
    this.clearFoods();
    this.hud.showSaliva(false);
    await new Promise((r) => this.time.delayedCall(500, r));
    const [W] = this.layout.size;
    const start = { x: W * 0.55, y: 470 };
    const size = Phaser.Math.Clamp(110 + this.stats.chewed * 4, 120, 230);
    // the chewed food gathers into one soft ball
    for (const h of this.layout.holes) this.drops.explode(4, h.x, h.y - 20);
    const b = this.add.image(start.x, start.y, 'm_bolus').setDepth(2700).setScale(0);
    const s = size / b.width;
    this.bolus = b;
    Sound.tone(220, 440, 0.3, 0.06, 'triangle');
    this.tweens.add({ targets: b, scale: s, duration: 600, ease: 'Back.easeOut' });
    await this.hud.say(t('mouth.swallow.title'), t('mouth.swallow.text'), 2600);
    this.phase = 'swallow';
    // a pulsing ring shows where the throat is
    const { throat } = this.layout;
    const ring = this.add.circle(throat.x, throat.y, 70).setStrokeStyle(6, 0xffe29a, 0.9).setDepth(2650);
    this.tweens.add({ targets: ring, scale: 1.25, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    b.setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(b);
    b.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => b.setPosition(x, y));
    await new Promise<void>((resolve) => {
      this.swallowed = resolve;
      b.on('dragend', () => {
        if (Phaser.Math.Distance.Between(b.x, b.y, throat.x, throat.y) < 150) this.gulp();
        else this.tweens.add({ targets: b, x: start.x, y: start.y, duration: 350, ease: 'Back.easeOut' });
      });
    });
    ring.destroy();
  }

  private swallowed?: () => void;

  private tapThroat(x: number, y: number): void {
    const { throat } = this.layout;
    if (Phaser.Math.Distance.Between(x, y, throat.x, throat.y) < 130) this.gulp();
  }

  private gulp(): void {
    if (this.phase !== 'swallow' || !this.bolus) return;
    this.phase = 'banner';
    const b = this.bolus;
    b.disableInteractive();
    const { throat } = this.layout;
    this.tweens.add({
      targets: b, x: throat.x, y: throat.y + 10, scale: b.scale * 0.2, alpha: 0.3, duration: 700, ease: 'Sine.easeIn',
      onComplete: () => {
        b.destroy();
        Sound.tone(260, 60, 0.6, 0.12, 'sine');
        Sound.noise(0.3, 220, 1.5, 0.12, 0.1);
        this.cameras.main.shake(260, 0.004);
        const pop = this.add.text(throat.x, throat.y - 60, t('mouth.pop.gloop'), {
          fontFamily: I18n.display, fontSize: '60px', fontStyle: 'bold', color: '#fff4af', stroke: '#66315f', strokeThickness: 10, resolution: 2,
        }).setOrigin(0.5).setDepth(2800);
        this.tweens.add({ targets: pop, scale: { from: 0.6, to: 1.2 }, alpha: { from: 1, to: 0 }, duration: 1300, onComplete: () => pop.destroy() });
        this.time.delayedCall(900, () => this.swallowed?.());
      },
    });
  }

  // ---- input, pause, view, helpers ------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') return this.togglePause();
    if (this.phase === 'swallow' && (e.code === 'Space' || e.key === 'Enter')) return this.gulp();
    if (this.phase !== 'play' || this.paused) return;
    if (e.key === 's' || e.key === 'S') return this.spray();
    if (e.key === '2') return this.toggleScissors();
    if (this.scissorsOn && (e.code === 'Space' || e.key === 'Enter')) {
      e.preventDefault();
      const c = this.chains.filter((q) => !q.gone && q.beads.length > 2).sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, this.hammerAim.x, this.hammerAim.y) - Phaser.Math.Distance.Between(b.x, b.y, this.hammerAim.x, this.hammerAim.y))[0];
      if (c) this.cutChain(c, this.cutsAt(c)[0]);
      return;
    }
    const holes = this.layout.holes;
    const here = holes[this.kbHole];
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (dir) {
      e.preventDefault();
      // the nearest hole in that direction
      let best = this.kbHole;
      let bestD = Infinity;
      holes.forEach((h, i) => {
        const dx = h.x - here.x;
        const dy = (h.y - here.y) * 3;
        if (i === this.kbHole || dx * dir[0] + dy * dir[1] <= 0) return;
        const d = Math.hypot(dx, dy);
        if (d < bestD) [best, bestD] = [i, d];
      });
      this.kbHole = best;
      const h = holes[best];
      this.hammerAim.set(h.x, h.y - h.w * 0.35);
      return;
    }
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      const f = this.foods[this.kbHole];
      const at = f.state !== 'empty' ? this.foodTop(f) : new Phaser.Math.Vector2(holes[this.kbHole].x, holes[this.kbHole].y - 30);
      this.strike(at.x, at.y + 10, false);
    }
  }

  private togglePause(): void {
    if (this.phase !== 'play' && !this.paused) return;
    this.paused = !this.paused;
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

  private makeTextures(): void {
    if (this.textures.exists('m_ring')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('m_dot', 16, 16);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillPoints([
      { x: 12, y: 0 }, { x: 15, y: 9 }, { x: 24, y: 12 }, { x: 15, y: 15 }, { x: 12, y: 24 }, { x: 9, y: 15 }, { x: 0, y: 12 }, { x: 9, y: 9 },
    ] as Phaser.Math.Vector2[], true);
    g.generateTexture('m_star', 24, 24);
    g.clear().fillStyle(0x9a5ae0, 1).fillRoundedRect(0, 0, 40, 12, 6).fillStyle(0xe2c6ff, 0.9).fillRoundedRect(6, 3, 28, 3, 2);
    g.generateTexture('m_link_s', 40, 12);
    g.clear().lineStyle(8, 0xffffff, 1).strokeCircle(32, 32, 27);
    g.generateTexture('m_ring', 64, 64);
    g.destroy();
  }

  /** The friend who is not the player (the other kid; when the player is a kid, that kid's buddy). */
  private buddy(): Avatar {
    const hero = GameState.hero ?? 'walid';
    return hero === 'walid' ? 'nesma' : 'walid';
  }

  /** The kid who speaks the story's lines (Walid or Nesma; Walid when the fennec leads). */
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
