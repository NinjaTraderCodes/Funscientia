import Phaser from 'phaser';

/** The ground area characters may stand on, as a polygon in world units. */
export class Walkable {
  private readonly polygon: Phaser.Geom.Polygon;
  private readonly points: Phaser.Math.Vector2[];

  constructor(points: [number, number][]) {
    this.points = points.map(([x, y]) => new Phaser.Math.Vector2(x, y));
    this.polygon = new Phaser.Geom.Polygon(points.flat());
  }

  contains(x: number, y: number): boolean {
    return Phaser.Geom.Polygon.Contains(this.polygon, x, y);
  }

  /** The point itself if walkable, otherwise the nearest point on the boundary. */
  clamp(x: number, y: number, out = new Phaser.Math.Vector2()): Phaser.Math.Vector2 {
    if (this.contains(x, y)) return out.set(x, y);
    let best = Infinity;
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const t = Phaser.Math.Clamp(((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) {
        best = d;
        out.set(px, py);
      }
    }
    // nudge slightly inside so the next contains() check passes
    const c = this.centroid();
    return out.set(out.x + (c.x - out.x) * 0.01, out.y + (c.y - out.y) * 0.01);
  }

  centroid(): Phaser.Math.Vector2 {
    const c = new Phaser.Math.Vector2();
    for (const p of this.points) c.add(p);
    return c.scale(1 / this.points.length);
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(1.5, 0x00ffff, 0.9);
    g.strokePoints(this.points, true);
  }
}
