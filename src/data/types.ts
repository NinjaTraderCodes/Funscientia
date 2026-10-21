/** Shapes of the JSON manifests written by tools/pipeline/pack_assets.py. */

export type CharacterName = 'boy' | 'girl' | 'fox';
export type AnimState = 'idle_back' | 'walk_back';

export interface LoopAnimDef {
  prefix: string;
  count: number;
  fps: number;
  /** Optional per-frame display time (ms); overrides fps when present. */
  durations?: number[];
  /** Full strides contained in one loop (default 1); keeps the feet locked to the ground. */
  strides?: number;
  /** Body height in texture pixels inside each frame (feet to top of head). */
  bodyPx: number;
  /** Feet position as a fraction of the frame height (sprite origin Y). */
  originY: number;
}

export interface StillAnimDef {
  frame: string;
  bodyPx: number;
  originY: number;
}

export type ViewName = 'front' | 'three-quarter-front' | 'side' | 'three-quarter-back' | 'back';
/** Screen direction a view's body points in the source image; the game mirrors for the other side. */
export type Facing = 'toward' | 'toward-left' | 'toward-right' | 'left' | 'right' | 'away-left' | 'away-right' | 'away';

export interface ViewDef extends StillAnimDef {
  facing: Facing;
}

/** Something a character does while standing about (the fennec sniffing, sitting down...). */
export interface IdleAnimDef {
  prefix: string;
  count: number;
  fps: number;
  bodyPx: number;
  originY: number;
  /**
   * Frame ranges [first, last]: `once` plays once then back to standing; `in` leads into
   * `loop`, which repeats until the character moves - then `in` plays backwards (getting up).
   */
  segments: { once?: [number, number]; in?: [number, number]; loop?: [number, number] };
}

export interface CharacterDef {
  atlas: string;
  /** walk_back / walk_front: real walk cycles; other directions use `views` + a procedural step. */
  animations: { walk_back: LoopAnimDef; walk_front?: LoopAnimDef; walk_side?: LoopAnimDef; idle_back: StillAnimDef };
  /** Standing pose per direction (turnaround sheet). Missing views fall back to the back view. */
  views?: Partial<Record<ViewName, ViewDef>>;
  /** Idle animations by kind (side view, drawn facing left like the side walk). */
  idles?: Record<string, IdleAnimDef>;
  /** Feet position and body height in world units at the start of the scene. */
  start: { x: number; y: number; bodyHeight: number };
}

export interface CharacterManifest {
  version: number;
  characters: Record<CharacterName, CharacterDef>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WorldLayout {
  version: number;
  /** far = distant scenery; near = ground the trio stands on, moves with their dolly. */
  layers: { far: Rect & { image: string }; near: Rect & { image: string } };
  videoFrame: { w: number; h: number };
  /** Where the intro video's last frame sits in world units. */
  endFrameRect: Rect;
  /** The trio is scaled about `pivot` by `scale` in the video's last frame (camera dolly). */
  endFrameParty: { pivot: [number, number]; scale: number };
  overviewRect: Rect;
  walkable: [number, number][];
  horizonY: number;
}
