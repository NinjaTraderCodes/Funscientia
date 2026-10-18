import Phaser from 'phaser';
import type { Character } from './Character';
import type { Walkable } from './Walkable';

interface Follower {
  who: Character;
  /** Slot offset from the leader, in world units at the leader's start depth. */
  offset: Phaser.Math.Vector2;
}

/**
 * The trio moves together: the player steers the leader, the others keep the
 * formation they had in the intro (girl on the left, fox in between).
 */
export class Party {
  readonly leader: Character;
  private readonly followers: Follower[];
  private readonly walkable: Walkable;
  private readonly leaderStartHeight: number;
  private readonly tmp = new Phaser.Math.Vector2();

  constructor(leader: Character, followers: Character[], walkable: Walkable) {
    this.leader = leader;
    this.walkable = walkable;
    this.leaderStartHeight = leader.bodyHeight;
    this.followers = followers.map((who) => ({
      who,
      offset: new Phaser.Math.Vector2(who.pos.x - leader.pos.x, who.pos.y - leader.pos.y),
    }));
  }

  get members(): Character[] {
    return [this.leader, ...this.followers.map((f) => f.who)];
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
      this.leader.update(dt, true);
    } else {
      this.leader.update(dt);
    }

    const depth = this.leader.bodyHeight / this.leaderStartHeight;
    for (const f of this.followers) {
      const slot = this.walkable.clamp(
        this.leader.pos.x + f.offset.x * depth,
        this.leader.pos.y + f.offset.y * depth,
        this.tmp,
      );
      const dist = Phaser.Math.Distance.Between(f.who.pos.x, f.who.pos.y, slot.x, slot.y);
      // hysteresis: start walking when clearly out of place, stop when close
      const startAt = 6 * depth;
      const stopAt = 1.5 * depth;
      if (dist > startAt || (f.who.isMoving && dist > stopAt)) {
        // walk a bit faster when lagging, a bit slower when nearly there
        f.who.walkTo(slot.x, slot.y, Phaser.Math.Clamp(dist / (35 * depth), 0.85, 1.4));
      } else if (f.who.isMoving) {
        f.who.stop();
      }
      f.who.update(dt);
    }
  }
}
