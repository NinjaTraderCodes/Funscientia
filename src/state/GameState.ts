import { t } from '../i18n/i18n';
import type { CharacterName } from '../data/types';
import type { Hero } from '../dialogue/DialogueRunner';

const KEY = 'funscientia.save.v1';

/** Who the child plays: one of the kids, or the fennec. */
export type Avatar = 'walid' | 'nesma' | 'fox';

/** The characters' own names, in the current language (the player's typed name replaces their avatar's). */
export const DEFAULT_NAMES: Record<Avatar, string> = {
  get walid() {
    return t('name.walid');
  },
  get nesma() {
    return t('name.nesma');
  },
  get fox() {
    return t('name.fox');
  },
};

interface SaveData {
  hero: Avatar | null;
  /** The name the child typed for their avatar ('' = the character's own name). */
  playerName: string;
  discoveries: string[];
  predictions: Record<string, string>;
}

const fresh = (): SaveData => ({ hero: null, playerName: '', discoveries: [], predictions: {} });

const load = (): SaveData => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* storage blocked: play without saving */
  }
  return fresh();
};

const data = load();
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
};

const SPRITE: Record<Avatar, CharacterName> = { walid: 'boy', nesma: 'girl', fox: 'fox' };

/** Progress that outlives a scene: chosen avatar and name, discoveries, predictions. */
export const GameState = {
  get hero(): Avatar | null {
    return data.hero;
  },
  set hero(h: Avatar | null) {
    data.hero = h;
    persist();
  },
  get playerName(): string {
    return data.playerName;
  },
  set playerName(name: string) {
    data.playerName = name;
    persist();
  },
  /** A character's name as shown in the game: the player's own name for their avatar. */
  nameOf(who: Avatar): string {
    return who === data.hero && data.playerName ? data.playerName : DEFAULT_NAMES[who];
  },
  /** Character sprites: the avatar leads, the others follow (the other kid first, then the fennec). */
  get leaderName(): CharacterName {
    return SPRITE[data.hero ?? 'walid'];
  },
  get followerNames(): CharacterName[] {
    const lead = this.leaderName;
    return (['boy', 'girl', 'fox'] as CharacterName[]).filter((n) => n !== lead).sort((a, b) => (a === 'fox' ? 1 : b === 'fox' ? -1 : 0));
  },
  /**
   * The kid who speaks the story's "leader" lines (the other speaks "buddy").
   * When the fennec leads, the kids still do the talking: Walid as leader, Nesma as buddy.
   */
  get storyLeader(): Hero {
    return data.hero === 'nesma' ? 'nesma' : 'walid';
  },
  discover(id: string): boolean {
    if (data.discoveries.includes(id)) return false;
    data.discoveries.push(id);
    persist();
    return true;
  },
  get discoveries(): readonly string[] {
    return data.discoveries;
  },
  /** The child's answer to a prediction question ('' if not asked yet). */
  prediction(question: string): string {
    return data.predictions[question] ?? '';
  },
  predict(question: string, answer: string): void {
    data.predictions[question] = answer;
    persist();
  },
};
