import Phaser from 'phaser';
import type { Character } from './Character';
import type { Walkable } from './Walkable';

/** Where a follower stands relative to the leader, in the leader's body heights. */
interface Slot {
  /** Sideways distance from the leader, across the direction of travel. */
  spread: number;
  /** How far it may hang back along the direction of travel (a touch, so the leader still leads). */
  back: number;
}

interface Follower {
  who: Character;
  slot: Slot;
  /** Which side of the leader it walks on: +1 = the leader's right, -1 = left. */
  side: number;
  /** Walking over to its place while the leader stands still. */
  settling: boolean;
  /** Which place it is using: 0 its own, 1 on the other side, 2 behind (see placeFor). */
  place: number;
  /** 0 = right beside the leader, 1 = further out, beyond the other friend on the same side. */
  lane: number;
  /** Seconds of standing about before it does something by itself (the fennec sniffs or sits). */
  idleIn: number;
}

/** A few seconds, varied, before the fennec does something by itself again. */
const idleDelay = () => 3.5 + Math.random() * 5;

/** Where each kind of friend walks beside the leader: a kid a little further out than the fennec. */
const KID_SLOT: Slot = { spread: 0.55, back: 0.06 };
const FOX_SLOT: Slot = { spread: 0.42, back: 0.04 };
const STOP_GAP = 0.025;
const LEAD_TIME = 0.18; // s: aim where the leader is about to be, so they keep pace instead of trailing
const SWAP_MARGIN = 0.25; // body heights: sides are only swapped when clearly crossed (no shuffling)
/**
 * Side-by-side across the screen's depth (walking left or right) is drawn a bit
 * deeper than true foreshortening, so the three stay readable instead of hiding
 * behind each other.
 */
const DEPTH_SPREAD = 0.5;
const SIDE_STAGGER = 0.24; // body heights
const MAX_AHEAD = 1.2; // body heights: a friend further ahead than this stands and waits for the leader
const SAME_SIDE_COST = 0.3; // body heights: one friend on each side is preferred, unless someone would have to cross
const CROSS_COST = 1.0; // body heights: cutting across the leader's path counts as this much extra walking
const PERSONAL_SPACE = 0.45; // body heights: closer than this to the leader or each other, a friend eases away
const MAX_TURN = 1; // tan of the largest angle off the walking direction while the leader walks (45 degrees)
const DRIFT = 0.75; // sideways gaps close at most this steeply (tan of the angle) while walking forward

/**
 * Walking together: the player steers the leader and the others come up level
 * with them, one on each side, turning as the leader turns. They keep the side
 * they are on (no crossing in front of the leader) and hurry when left behind.
 */
export class Party {
  readonly leader: Character;
  private readonly followers: Follower[];
  private readonly walkable: Walkable;
  /** Direction of travel (screen space, unit). Kept while the leader stands still. */
  private readonly heading = new Phaser.Math.Vector2(0, -1);
  /** Followers hold the starting formation until the leader first moves. */
  private engaged = false;
  /** When true, followers may leave the walkable area (scripted exits). */
  unbounded = false;
  /** Members released from the formation (scripted moves); they still animate. */
  private readonly released = new Set<Character>();
  private readonly tmp = new Phaser.Math.Vector2();
  private readonly tmp2 = new Phaser.Math.Vector2();

  constructor(leader: Character, followers: Character[], walkable: Walkable) {
    this.leader = leader;
    this.walkable = walkable;
    this.followers = followers.map((who, i) => ({ who, slot: who.name === 'fox' ? FOX_SLOT : KID_SLOT, side: i === 0 ? -1 : 1, settling: false, place: 0, lane: 0, idleIn: idleDelay() }));
    this.assignSides(true);
  }

  get members(): Character[] {
    return [this.leader, ...this.followers.map((f) => f.who)];
  }

  /** Take a member out of the formation (it keeps any walk you give it), or put it back. */
  release(who: Character, released = true): void {
    if (released) this.released.add(who);
    else this.released.delete(who);
  }

  moveLeaderTo(x: number, y: number): Phaser.Math.Vector2 {
    const p = this.walkable.clamp(x, y);
    this.leader.walkTo(p.x, p.y);
    return p;
  }

  update(dt: number, keys: { x: number; y: number } | null): void {
    if (keys && (keys.x !== 0 || keys.y !== 0)) {
      const len = Math.hypot(keys.x, keys.y);
      this.leader.nudge(keys.x / len, keys.y / len, dt, (v) => this.walkable.clamp(v.x, v.y, v));
    }
    this.leader.update(dt);

    const v = this.leader.velocity;
    const speed = v.length();
    const moving = speed > this.leader.kidHeight * 0.05;
    if (moving) {
      this.engaged = true;
      this.heading.set(v.x / speed, v.y / speed);
      this.assignSides(false);
    }

    for (const f of this.followers) {
      if (this.released.has(f.who)) {
        f.who.update(dt);
        continue;
      }
      // standing about (also before the leader's first step), the fennec may sniff or sit
      if (moving) f.idleIn = idleDelay();
      else this.maybeIdle(f, dt);
      if (!this.engaged) {
        f.who.update(dt);
        continue;
      }
      if (moving) this.walkAlong(f);
      else this.standBy(f);
      // standing in place, a friend looks the same way as the group, not wherever its last step pointed
      if (!f.who.isMoving && !f.who.idling) this.faceHeading(f.who);
      f.who.update(dt);
    }
  }

  /**
   * The leader is walking: move with them, towards the place beside them.
   * - Never walk back against the leader: a friend who is ahead walks on the
   *   same way, slower, until the leader comes level.
   * - Close sideways gaps while walking forward (a gentle drift), not by
   *   side-stepping across the screen (which would face the camera).
   */
  private walkAlong(f: Follower): void {
    f.settling = false;
    const who = f.who;
    const h = who.bodyHeight;
    const slot = this.placeFor(f, true, this.tmp);
    const hx = this.heading.x;
    const hy = this.heading.y;
    const dx = slot.x - who.pos.x;
    const dy = slot.y - who.pos.y;
    const along = dx * hx + dy * hy;
    let latX = dx - along * hx;
    let latY = dy - along * hy;
    const lat = Math.hypot(latX, latY);
    const dist = Math.hypot(dx, dy) / h;
    let fwd: number;
    let pace: number;
    if (along < 0) {
      // ahead of their place: walk on the same way, slower, and let the leader catch up
      // (never back towards the leader, and never standing in their path)
      const ahead = -along / h;
      if (ahead > MAX_AHEAD) {
        if (who.isMoving) who.stop();
        return;
      }
      fwd = h * 0.25;
      pace = Phaser.Math.Clamp(0.95 - ahead * 1.5, 0.35, 0.95);
      // the leader is about to walk into them: trot on a little faster, on a
      // diagonal out of the way (personal space, below), and let them pass beside
      const L = this.leader.pos;
      if (Math.hypot(who.pos.x - L.x, (who.pos.y - L.y) / DEPTH_SPREAD) < h * 0.6) pace = 1.5;
    } else {
      // walk at the leader's pace, hurry to catch up
      fwd = along;
      pace = Phaser.Math.Clamp(1 + (dist - 0.05) / 0.3, 0.9, 1.9);
    }
    // close sideways gaps while walking forward, at most this steeply
    const maxLat = fwd * DRIFT;
    if (lat > maxLat) {
      latX *= maxLat / lat;
      latY *= maxLat / lat;
    }
    let mx = fwd * hx + latX;
    let my = fwd * hy + latY;
    // personal space: keep clear of the leader and the other friend by moving aside
    // (only sideways: pushed forwards, they would end up herded along in front of the leader)
    const sep = this.separation(who, h);
    const push = sep.x * hx + sep.y * hy;
    sep.set(sep.x - push * hx, sep.y - push * hy);
    if (sep.lengthSq() < 1e-6 && Math.hypot(who.pos.x - this.leader.pos.x, (who.pos.y - this.leader.pos.y) / DEPTH_SPREAD) < h * PERSONAL_SPACE) {
      // straight ahead of the leader: step out to its own side
      const r = this.right(new Phaser.Math.Vector2());
      sep.set(r.x * f.side * h * 0.5, r.y * f.side * h * 0.5 * DEPTH_SPREAD);
    }
    // never more than 45 degrees off the walking direction (a three-quarter view at
    // most - no side-stepping straight at the camera)
    // (angles measured as on the ground: up/down the screen is foreshortened, which
    // is also how a character picks which way it faces)
    let sx = latX + sep.x;
    let sy = latY + sep.y;
    const side = Math.hypot(sx, sy * 2);
    const ahead = fwd * Math.hypot(hx, hy * 2) * MAX_TURN;
    if (side > ahead) {
      sx *= ahead / side;
      sy *= ahead / side;
    }
    mx = fwd * hx + sx;
    my = fwd * hy + sy;
    // aim a little further along the same line, so a small correction is a smooth walk, not a stutter
    const len = Math.hypot(mx, my);
    if (len < 1e-3) return;
    const k = Math.max(1, (h * 0.25) / len);
    mx *= k;
    my *= k;
    who.walkTo(who.pos.x + mx, who.pos.y + my, pace);
  }

  /**
   * The leader is standing: a friend stays where they are as long as that is a
   * comfortable place beside them (no shuffling into an exact spot). Only one
   * who is crowding the leader, too far away or left behind walks over.
   */
  private standBy(f: Follower): void {
    const who = f.who;
    const h = who.bodyHeight;
    const L = this.leader.pos;
    if (!f.settling) {
      const rx = who.pos.x - L.x;
      const ry = who.pos.y - L.y;
      const dist = Math.hypot(rx, ry / DEPTH_SPREAD) / h;
      const behind = -(rx * this.heading.x + ry * this.heading.y) / h;
      const comfortable = dist > 0.3 && dist < 1.1 && behind < 0.45;
      if (comfortable) {
        if (who.isMoving) who.stop();
        return;
      }
      f.settling = true;
    }
    const slot = this.placeFor(f, false, this.tmp);
    const dist = Phaser.Math.Distance.Between(who.pos.x, who.pos.y, slot.x, slot.y) / h;
    if (dist < STOP_GAP * 2) {
      f.settling = false;
      who.stop();
      return;
    }
    who.walkTo(slot.x, slot.y, Phaser.Math.Clamp(dist / 0.3, 0.7, 1.6));
  }

  /** A push away from anyone closer than PERSONAL_SPACE (screen units, ground-scaled depth). */
  private separation(who: Character, h: number): Phaser.Math.Vector2 {
    const out = this.tmp2.set(0, 0);
    const others = [this.leader, ...this.followers.filter((o) => o.who !== who && !this.released.has(o.who)).map((o) => o.who)];
    for (const o of others) {
      let ex = who.pos.x - o.pos.x;
      let ey = (who.pos.y - o.pos.y) / DEPTH_SPREAD;
      let d = Math.hypot(ex, ey);
      if (d >= h * PERSONAL_SPACE) continue;
      if (d < 1e-3) {
        // exactly on top: step out to the leader's right or left
        const r = this.right(new Phaser.Math.Vector2());
        const f = this.followers.find((x) => x.who === who);
        ex = r.x * (f?.side ?? 1);
        ey = (r.y * (f?.side ?? 1)) / DEPTH_SPREAD;
        d = Math.hypot(ex, ey);
      }
      const w = (1 - d / (h * PERSONAL_SPACE)) * h * 0.9;
      out.x += (ex / d) * w;
      out.y += (ey / d) * w * DEPTH_SPREAD;
    }
    return out;
  }

  /**
   * While the group stands about, a friend with idle animations (the fennec) now and
   * then does something by itself: sniffs the ground, or sits down until they move on.
   */
  private maybeIdle(f: Follower, dt: number): void {
    const who = f.who;
    const kinds = who.idleKinds;
    if (!kinds.length || who.isMoving || who.idling || who.velocity.length() > who.bodyHeight * 0.05) return;
    f.idleIn -= dt;
    if (f.idleIn > 0) return;
    f.idleIn = idleDelay();
    // sniffing is the usual thing; sitting down now and then
    const kind = kinds.includes('sit') && Math.random() < 0.35 ? 'sit' : kinds.includes('sniff') ? 'sniff' : kinds[0];
    who.playIdle(kind);
  }

  private faceHeading(who: Character): void {
    who.faceTowards(who.pos.x + this.heading.x, who.pos.y + this.heading.y);
  }

  /** Unit vector to the leader's right (screen space), across the direction of travel. */
  private right(out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return out.set(-this.heading.y, this.heading.x);
  }

  /**
   * Keep each follower on the side of the leader it is already on, so a turn
   * never makes anyone cut across.
   */
  private assignSides(initial: boolean): void {
    const active = this.followers.filter((f) => !this.released.has(f.who));
    const r = this.right(new Phaser.Math.Vector2());
    const L = this.leader.pos;
    const h = Math.max(1, this.leader.kidHeight);
    const lateral = (f: Follower) => ((f.who.pos.x - L.x) * r.x + ((f.who.pos.y - L.y) * r.y) / DEPTH_SPREAD) / h;
    if (active.length === 1) {
      const f = active[0];
      const lat = lateral(f);
      if (initial || Math.abs(lat) > SWAP_MARGIN) f.side = Math.sign(lat) || f.side;
      return;
    }
    if (active.length !== 2) return;
    const [a, b] = active;
    // Choose who walks where: one on each side, or - when both are on the same side
    // already - both on that side, three abreast (nobody has to cut across the
    // leader's path). The current choice is kept unless another is clearly better.
    type Plan = [number, number, number, number]; // a side, a lane, b side, b lane
    const plans: Plan[] = [];
    for (const s of [1, -1]) plans.push([s, 0, -s, 0], [s, 0, s, 1], [s, 1, s, 0]);
    const cost = ([as, al, bs, bl]: Plan) =>
      this.distToSlot(a, as, this.spreadOf(a, al, b)) + this.distToSlot(b, bs, this.spreadOf(b, bl, a)) + (as === bs ? SAME_SIDE_COST * h : 0);
    const now: Plan = [a.side, a.lane, b.side, b.lane];
    let best = now;
    let bestCost = cost(now) - (initial ? 0 : SWAP_MARGIN * h);
    for (const p of plans) {
      const c = cost(p);
      if (c < bestCost) {
        best = p;
        bestCost = c;
      }
    }
    [a.side, a.lane, b.side, b.lane] = best;
  }

  /** Sideways distance from the leader for a lane: inner, or outer (beyond the other friend). */
  private spreadOf(f: Follower, lane = f.lane, other = this.followers.find((o) => o !== f && !this.released.has(o.who))): number {
    return lane === 1 && other ? other.slot.spread + f.slot.spread + 0.05 : f.slot.spread;
  }

  private distToSlot(f: Follower, side: number, spread: number): number {
    const p = this.slotPosition(f, false, new Phaser.Math.Vector2(), side, spread);
    // reaching that side means cutting across the leader's path: count it as a long way round
    const r = this.right(new Phaser.Math.Vector2());
    const L = this.leader.pos;
    const h = Math.max(1, this.leader.kidHeight);
    const lateral = ((f.who.pos.x - L.x) * r.x + ((f.who.pos.y - L.y) * r.y) / DEPTH_SPREAD) / h;
    const crossing = lateral * side < -0.1 ? CROSS_COST * h : 0;
    return Math.hypot(p.x - f.who.pos.x, (p.y - f.who.pos.y) / DEPTH_SPREAD) + crossing;
  }

  /**
   * A follower's place, kept on the walkable ground. Beside the leader on its own
   * side if there is room; at the edge of the road, further out on the other
   * side (three abreast); only if that does not fit either, just behind.
   * Each choice is kept a little while it still fits, so it does not flicker.
   */
  private placeFor(f: Follower, moving: boolean, out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    if (this.unbounded) return this.slotPosition(f, moving, out);
    const h = this.leader.kidHeight;
    const other = this.followers.find((o) => o !== f && !this.released.has(o.who));
    const otherSide = other && other.side === -f.side; // the other friend is over there already
    const options = [
      () => this.slotPosition(f, moving, out),
      () => this.slotPosition(f, moving, out, -f.side, otherSide ? this.spreadOf(f, 1) : f.slot.spread),
      () => this.slotPosition(f, moving, out, f.side, 0, 0.45),
    ];
    for (let i = 0; i < options.length; i++) {
      options[i]();
      // the current choice may stay a bit squeezed; a better one must fit cleanly
      const squeeze = this.squeeze(out) / h;
      if (squeeze < (i === f.place ? 0.15 : 0.05) || i === options.length - 1) {
        f.place = i;
        return this.walkable.clamp(out.x, out.y, out);
      }
    }
    return out;
  }

  /** How far a point is outside the walkable ground. */
  private squeeze(p: Phaser.Math.Vector2): number {
    const c = this.walkable.clamp(p.x, p.y, this.tmp2);
    return Math.hypot(c.x - p.x, c.y - p.y);
  }

  /** Level with the leader (slightly ahead of where they are now, if walking), off to one side. */
  private slotPosition(
    f: Follower,
    moving: boolean,
    out: Phaser.Math.Vector2,
    side = f.side,
    spread = this.spreadOf(f),
    extraBack = 0,
  ): Phaser.Math.Vector2 {
    const L = this.leader.pos;
    const h = this.leader.kidHeight;
    const v = this.leader.velocity;
    const r = this.right(new Phaser.Math.Vector2());
    out.set(L.x, L.y);
    if (moving) out.add(new Phaser.Math.Vector2(v.x * LEAD_TIME, v.y * LEAD_TIME));
    // walking across the screen the three would hide one another: the friends drop
    // back a little (a small V with the leader at its tip), so nobody covers the
    // leader and the far one peeks out past them
    const back = f.slot.back + Math.abs(this.heading.x) * SIDE_STAGGER + extraBack;
    out.x += -this.heading.x * back * h + r.x * side * spread * h;
    // steps across the screen's depth are foreshortened on the ground
    out.y += -this.heading.y * back * h * 0.5 + r.y * side * spread * h * DEPTH_SPREAD;
    return out;
  }
}
