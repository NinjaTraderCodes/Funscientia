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
import { StarchTask } from '../world/StarchTask';

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
];
const ROUND_SECONDS = [20, 20, 25];
const STARS = [400, 1100]; // points for two and for three stars (everyone who finishes gets one); tuned with paced test players
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

type Phase = 'intro' | 'banner' | 'play' | 'bread' | 'starch' | 'swallow' | 'done';

/**
 * The Mouth mini-game (after Dounia's "Mouth Hammer" prototype): the child is
 * the mouth. Three rounds introduce its jobs one at a time - 1 Chew (tap the
 * foods with the tooth-hammer), 2 Mix (the tongue joins: it mixes food for a
 * bonus, but don't bite it), 3 Moisten and digest (reveal starch in moist bread,
 * select amylase and cut it into maltose pairs) - then the food ball is swallowed and the gate's prediction
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
  private stats = { score: 0, chewed: 0, combo: 0, bestCombo: 0, bites: 0, maltose: 0, lastChew: -9 };
  private starchTask?: StarchTask;
  private lastStarchCut?: Phaser.Math.Vector2;
  private said = new Set<string>();
  private clock = 0;

  constructor() {
    super('Mouth');
  }

  preload(): void {
    this.load.json('mouth', asset('mouth/mouth.json'));
    this.load.image('mouth_bg', asset('mouth/background.webp'));
    for (const k of [...Object.keys(FOODS), 'hammer', 'tongue', 'tongue_ouch', 'bolus']) this.load.image(`m_${k}`, asset(`mouth/${k}.webp`));
    this.load.image('m_amylase_scissors', asset('mouth/amylase-scissors.webp'));
    this.load.image('m_maltose', asset('mouth/maltose.webp'));
    for (let i = 0; i < 2; i++) this.load.image(`m_starch_${i}`, asset(`mouth/starch_${i}.webp`));
  }

  create(): void {
    this.layout = this.cache.json.get('mouth') as MouthLayout;
    GameState.place = 'mouth'; // continue from here (online save)
    const [W, H] = this.layout.size;
    Object.assign(this, { phase: 'intro', round: 0, saliva: 85, skill: 1, paused: false, tongueState: 'home', foods: [], clock: 0 });
    this.stats = { score: 0, chewed: 0, combo: 0, bestCombo: 0, bites: 0, maltose: 0, lastChew: -9 };
    this.starchTask = undefined;
    this.lastStarchCut = undefined;
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
    this.sugar = this.add.particles(0, 0, 'm_star', {
      speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, lifespan: 900, gravityY: 120,
      scale: { start: 0.9, end: 0 }, rotate: { start: 0, end: 180 }, tint: [0xffe29a, 0xfff6e3, 0xffd36b],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(2500);
    this.drops = this.add.particles(0, 0, 'm_dot', {
      speed: { min: 120, max: 320 }, angle: { min: 200, max: 340 }, lifespan: 800, gravityY: 600,
      scale: { start: 0.7, end: 0.2 }, tint: [0x8cefff, 0xbcffff, 0x49d9ff], alpha: { start: 0.95, end: 0 }, emitting: false,
    }).setDepth(2500);

    this.hud = new MouthHud(() => this.togglePause(), () => this.spray(), () => this.selectAmylase());
    this.box = new DialogueBox(GameState.storyLeader);
    this.fit();
    this.scale.on('resize', this.fit, this);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.paused) return;
      if (this.phase === 'starch') {
        this.starchTask?.aimAt(p.worldX, p.worldY);
        if (p.isDown) this.starchTask?.snip(p.worldX, p.worldY, this.lastStarchCut);
        this.lastStarchCut = new Phaser.Math.Vector2(p.worldX, p.worldY);
      } else this.hammerAim.set(p.worldX, p.worldY);
    });
    this.input.on('pointerup', () => { this.lastStarchCut = undefined; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.strike(p.worldX, p.worldY, true));
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    const onHide = () => {
      if (document.hidden && ['play', 'bread', 'starch'].includes(this.phase) && !this.paused) this.togglePause();
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
      this.starchTask?.destroy();
      this.starchTask = undefined;
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
    ];
    for (let r = 0; r < 3; r++) {
      this.round = r;
      this.hud.setRound(r);
      this.phase = 'banner';
      this.clearFoods();
      if (r === 2) {
        this.hud.showSaliva(true);
        this.hud.setSaliva(this.saliva, false);
      }
      await this.hud.banner(r, rounds[r].title(), rounds[r].text());
      if (r === 1) this.react(this.storyKid(), 'surprised', t('mouth.say.tongueComes'));
      await this.playRound(ROUND_SECONDS[r]);
    }
    this.hud.setRound(3);
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
        if (['play', 'bread', 'starch'].includes(this.phase)) this.time.delayedCall(100, check);
        else resolve();
      };
      check();
    });
  }

  update(_t: number, deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.phase === 'starch') {
      this.starchTask?.update(dt);
      return;
    }
    this.clock += dt;
    // the hammer follows the pointer (or the keyboard's hole)
    this.hammer.x += (this.hammerAim.x - this.hammer.x) * Math.min(1, dt * 18);
    this.hammer.y += (this.hammerAim.y - this.hammer.y) * Math.min(1, dt * 18);
    for (const f of this.foods) this.drawFood(f, dt);
    if (this.phase === 'bread') {
      this.salivaStep(dt);
      return;
    }
    if (this.phase !== 'play') return;

    this.timeLeft -= dt;
    this.hud.setTime(this.timeLeft);
    if (this.timeLeft <= 0) {
      if (this.round === 2) {
        this.prepareStarchBread();
        return;
      }
      this.phase = 'banner';
      this.hammer.setVisible(false);
      this.tongueHome(true);
      Sound.tone(660, 990, 0.25, 0.07, 'triangle');
      return;
    }
    this.serveFood(dt);
    if (this.round >= 1) this.tongueStep(dt);
    if (this.round >= 2) this.salivaStep(dt);
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
    if (this.paused) return;
    if (this.phase === 'starch') {
      this.lastStarchCut = new Phaser.Math.Vector2(x, y);
      this.starchTask?.snip(x, y);
      return;
    }
    if (this.phase !== 'play' && this.phase !== 'bread') return;
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
    if (this.phase === 'bread' && this.saliva < 50) {
      this.hud.hintDigest('mouth.digest.bread');
      this.hud.setSaliva(this.saliva, true);
      return;
    }
    const def = FOODS[f.kind];
    const revealStarch = this.round === 2 && f.kind.startsWith('bread') && this.saliva >= 50;
    const starchOrigin = this.foodTop(f);
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
    this.addScore(points, f, label);
    if (revealStarch) this.beginStarch(starchOrigin);
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

  private clearFoods(immediate = false): void {
    for (const f of this.foods) {
      if (immediate) {
        f.state = 'empty';
        f.kind = null;
        f.pop = 0;
        f.img.setVisible(false);
      } else if (f.state !== 'empty') f.state = 'sinking';
    }
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
    if ((this.phase !== 'play' && this.phase !== 'bread') || this.round < 2 || this.paused) return;
    this.saliva = Math.min(100, this.saliva + 45);
    this.sprayIdle = 0;
    this.hud.setSaliva(this.saliva, false);
    const [W, H] = this.layout.size;
    for (let i = 0; i < 3; i++) this.drops.explode(10, W * (0.3 + i * 0.2), H * 0.5);
    Sound.noise(0.35, 5000, 0.6, 0.1);
    Sound.tone(700, 1100, 0.17, 0.04);
    this.once('spray', this.storyKid(), 'happy', t('mouth.say.spray'));
  }

  // ---- swallow ------------------------------------------------------------------

  /** A missed timer still leaves a focused, required bread task. */
  private prepareStarchBread(): void {
    this.clearFoods();
    this.tongueHome(true);
    this.phase = 'bread';
    const f = this.foods[6];
    f.kind = 'bread';
    f.state = 'up';
    f.pop = 1;
    f.bites = 0;
    f.timer = Infinity;
    f.img.setTexture('m_bread').setVisible(true);
    this.kbHole = 6;
    this.drawFood(f, 0);
    const at = this.foodTop(f);
    this.hammerAim.set(at.x, at.y);
    this.hud.showDigest('bread');
    this.hud.showSaliva(true);
    this.hud.setSaliva(this.saliva, this.saliva < 50);
  }

  private beginStarch(origin: { x: number; y: number }): void {
    this.phase = 'starch';
    this.clearFoods(true);
    this.tongueHome(true);
    this.hammer.setVisible(false);
    this.hud.showSaliva(false);
    this.hud.showDigest('select');
    this.lastStarchCut = undefined;
    this.starchTask = new StarchTask(this, origin, (pairs) => {
      this.stats.score += (pairs - this.stats.maltose) * 35;
      this.stats.maltose = pairs;
      this.hud.setScore(this.stats.score);
      this.hud.showDigest(pairs === 3 ? 'done' : 'cut', pairs);
    }, (hint) => {
      this.hud.hintDigest(hint === 'select' ? 'mouth.digest.select' : 'mouth.digest.pairs');
    }, () => {
      this.starchTask?.destroy();
      this.starchTask = undefined;
      this.hud.hideDigest();
      this.phase = 'banner'; // all pairs made: mission 3 is complete, so swallowing may begin
    });
  }

  private selectAmylase(): void {
    if (this.phase !== 'starch' || this.paused || this.stats.maltose === 3) return;
    this.starchTask?.select();
    this.hud.showDigest('cut', this.stats.maltose);
  }

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
    if (this.paused) return;
    if (this.phase === 'starch') {
      if (e.code === 'Digit2' || e.code === 'Numpad2') this.selectAmylase();
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        this.starchTask?.cutNext();
      }
      return;
    }
    if (this.phase !== 'play' && this.phase !== 'bread') return;
    if (e.key === 's' || e.key === 'S') return this.spray();
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
    if (!['play', 'bread', 'starch'].includes(this.phase) && !this.paused) return;
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
    if (this.textures.exists('m_dot')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('m_dot', 16, 16);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillPoints([
      { x: 12, y: 0 }, { x: 15, y: 9 }, { x: 24, y: 12 }, { x: 15, y: 15 }, { x: 12, y: 24 }, { x: 9, y: 15 }, { x: 0, y: 12 }, { x: 9, y: 9 },
    ] as Phaser.Math.Vector2[], true);
    g.generateTexture('m_star', 24, 24);
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

  private react(who: Who, mood: Mood, text: string): void {
    this.hud.react(who, mood, text);
  }

  /** Say something the first time it happens only. */
  private once(key: string, who: Who, mood: Mood, text: string): void {
    if (this.said.has(key)) return;
    if (this.hud.react(who, mood, text)) this.said.add(key);
  }
}
