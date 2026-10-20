import Phaser from 'phaser';

/**
 * A glowing marker on the ground that shows where to go next. Sizes are in
 * body heights of a character standing there, so it reads right at any depth.
 */
export class Waypoint {
  readonly x: number;
  readonly y: number;
  private readonly radius: number;
  private readonly parts: Phaser.GameObjects.GameObject[] = [];
  private readonly label: Phaser.GameObjects.Text;

  /** labelPx: label font size in world units (defaults to a tenth of a body height). */
  constructor(scene: Phaser.Scene, x: number, y: number, bodyHeight: number, text: string, labelPx?: number) {
    this.x = x;
    this.y = y;
    this.radius = bodyHeight * 0.45;
    const h = bodyHeight;

    // every glowing part is a pre-baked texture: Phaser redraws vector shapes each frame
    makeTextures(scene);
    const glow = scene.add.image(x, y, 'wp_glow').setDisplaySize(h * 0.9, h * 0.28).setAlpha(0.45)
      .setDepth(y - 1).setBlendMode(Phaser.BlendModes.ADD);
    const ring = scene.add.image(x, y, 'wp_ring').setDisplaySize(h * 0.6, h * 0.19).setDepth(y - 1);
    scene.tweens.add({ targets: glow, scaleX: glow.scaleX * 1.25, scaleY: glow.scaleY * 1.25, alpha: 0.2, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: ring, scaleX: ring.scaleX * 1.18, scaleY: ring.scaleY * 1.18, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // a soft column of light ties the ground ring to the star
    const beam = scene.add.image(x, y, 'wp_beam').setOrigin(0.5, 1).setDisplaySize(h * 0.34, h * 0.72)
      .setDepth(y - 0.5).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: beam, alpha: 0.65, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // a floating star above the spot, bobbing gently
    const star = scene.add.image(x, y - h * 0.62, 'wp_star').setDisplaySize(h * 0.24, h * 0.24).setDepth(1e5);
    scene.tweens.add({ targets: star, y: star.y - h * 0.08, angle: 18, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // rising sparkles
    const sparkles = scene.add.particles(0, 0, 'wp_spark', {
      x: { min: x - h * 0.25, max: x + h * 0.25 },
      y: { min: y - h * 0.05, max: y + h * 0.05 },
      lifespan: 1400,
      speedY: { min: -h * 0.5, max: -h * 0.25 },
      scale: { start: h * 0.0016, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffe29a, 0xfff6e3, 0xf3c35a],
      frequency: 120,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(y + 1);

    this.label = scene.add
      .text(x, y - h * 0.8, text, {
        fontFamily: 'Georgia, serif',
        fontSize: `${Math.round(labelPx ?? h * 0.1)}px`,
        color: '#fff6e3',
        stroke: '#0b1533',
        strokeThickness: Math.max(2, (labelPx ?? h * 0.1) * 0.35),
        align: 'center',
        resolution: 6,
      })
      .setOrigin(0.5, 1)
      .setDepth(1e5);

    this.parts.push(glow, ring, star, sparkles, this.label, beam);
    this.setVisible(false);
  }

  show(scene: Phaser.Scene): void {
    this.setVisible(true);
    // pop in the star and the sign
    const [, , star, , label] = this.parts as unknown as Phaser.GameObjects.Components.Transform[];
    for (const t of [star, label]) {
      const sx = t.scaleX;
      const sy = t.scaleY;
      t.setScale(sx * 0.2, sy * 0.2);
      scene.tweens.add({ targets: t, scaleX: sx, scaleY: sy, duration: 600, ease: 'Back.easeOut' });
    }
  }

  private setVisible(v: boolean): void {
    for (const p of this.parts) (p as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  reached(px: number, py: number): boolean {
    return Phaser.Math.Distance.Between(px, py, this.x, this.y) < this.radius;
  }

  hide(): void {
    this.setVisible(false);
  }
}

/** Soft textures shared by all waypoints (created once per game). */
function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('wp_spark')) {
    const g = scene.make.graphics({}, false);
    for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.12 + (0.06 * (16 - r)) / 2).fillCircle(16, 16, r);
    g.generateTexture('wp_spark', 32, 32);
    g.destroy();
  }
  if (!scene.textures.exists('wp_glow')) {
    const g = scene.make.graphics({}, false);
    // soft filled disc, squashed into an ellipse when displayed
    for (let r = 64; r > 0; r -= 4) g.fillStyle(0xffd56b, 0.07).fillCircle(64, 64, r);
    g.generateTexture('wp_glow', 128, 128);
    g.clear().lineStyle(5, 0xffe29a, 1).strokeCircle(64, 64, 60);
    g.generateTexture('wp_ring', 128, 128);
    g.clear().fillStyle(0xb9791c, 1).fillPoints(starPoints(64, 64, 60, 27), true);
    g.fillStyle(0xffe29a, 1).fillPoints(starPoints(64, 64, 52, 22), true);
    g.generateTexture('wp_star', 128, 128);
    g.destroy();
  }
  if (!scene.textures.exists('wp_beam')) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    // bright at the bottom centre, fading upward and to both sides
    const up = ctx.createLinearGradient(0, 256, 0, 0);
    up.addColorStop(0, 'rgba(255,226,154,0.85)');
    up.addColorStop(1, 'rgba(255,226,154,0)');
    ctx.fillStyle = up;
    ctx.fillRect(0, 0, 64, 256);
    ctx.globalCompositeOperation = 'destination-in';
    const across = ctx.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)');
    across.addColorStop(0.5, 'rgba(0,0,0,1)');
    across.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, 64, 256);
    scene.textures.addCanvas('wp_beam', canvas);
  }
}

function starPoints(cx: number, cy: number, outer: number, inner: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}
