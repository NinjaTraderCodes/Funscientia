/** Shapes of the JSON manifests written by tools/pipeline/pack_assets.py. */

export type CharacterName = 'boy' | 'girl' | 'fox';
export type AnimState = 'idle_back' | 'walk_back';

export interface LoopAnimDef {
  prefix: string;
  count: number;
  fps: number;
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

export interface CharacterDef {
  atlas: string;
  animations: { walk_back: LoopAnimDef; idle_back: StillAnimDef };
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
  plate: Rect & { image: string };
  videoFrame: { w: number; h: number };
  /** Where the intro video's last frame sits in world units. */
  endFrameRect: Rect;
  /** The trio is scaled about `pivot` by `scale` in the video's last frame (camera dolly). */
  endFrameParty: { pivot: [number, number]; scale: number };
  overviewRect: Rect;
  walkable: [number, number][];
  horizonY: number;
}
