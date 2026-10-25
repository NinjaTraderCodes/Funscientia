import { I18n, t, type Lang } from '../i18n/i18n';
import type { CharacterName } from '../data/types';
import type { Hero } from '../dialogue/DialogueRunner';

const KEY = 'funscientia.save.v1';

/** Who the child plays: one of the kids, or the fennec. */
export type Avatar = 'walid' | 'nesma' | 'fox';

export interface Chapter3Progress { lesson: number; quiz: number; score: number; mistakes: number }
const chapter3Progress = (value: unknown): Chapter3Progress => {
  const p = value && typeof value === 'object' ? value as Partial<Chapter3Progress> : {};
  const number = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
  return { lesson: number(p.lesson, 4), quiz: number(p.quiz, 5), score: number(p.score, 100000), mistakes: number(p.mistakes, 10000) };
};

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
  chapter3: Chapter3Progress;
  hero: Avatar | null;
  /** The name the child typed for their avatar ('' = the character's own name). */
  playerName: string;
  discoveries: string[];
  predictions: Record<string, string>;
  /** Where to continue: a place of the world (road, road2, esophagus), a mini-game (mouth, stomach), or the overlook. */
  place: string;
}

/**
 * The progress as it is saved online (backend/README.md): version 1. The backend only
 * checks that it is an object with a version; the game reads it back with `restore`.
 */
export interface OnlineData {
  /** Optional for older saves; checkpoints are between lessons, never half-cut molecules. */
  chapter3?: Chapter3Progress;
  version: 1;
  hero: Avatar | null;
  playerName: string;
  lang: Lang;
  place: string;
  discoveries: string[];
  predictions: Record<string, string>;
  savedAt: string;
  /** A starting point (e.g. a jury code): whoever loads it gets their own new save, it is never changed. */
  template?: boolean;
}

const AVATARS: readonly Avatar[] = ['walid', 'nesma', 'fox'];
const fresh = (): SaveData => ({ hero: null, playerName: '', discoveries: [], predictions: {}, place: '', chapter3: chapter3Progress(null) });

const load = (): SaveData => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const saved = { ...fresh(), ...parsed, chapter3: chapter3Progress(parsed.chapter3) };
      if (!parsed.chapter3 && saved.place === 'stomach' && saved.discoveries.includes('chyme')) saved.place = 'intestine-road';
      return saved;
    }
  } catch {
    /* storage blocked: play without saving */
  }
  return fresh();
};

const data = load();
const listeners = new Set<() => void>();
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
};

const SPRITE: Record<Avatar, CharacterName> = { walid: 'boy', nesma: 'girl', fox: 'fox' };

/** Progress that outlives a scene: chosen avatar and name, discoveries, predictions. */
export const GameState = {
  get chapter3(): Chapter3Progress { return { ...data.chapter3 }; },
  checkpointChapter3(update: Partial<Chapter3Progress>): void {
    data.chapter3 = chapter3Progress({ ...data.chapter3, ...update });
    persist();
  },
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
  /** Where the player is (saved as they arrive, to continue from there). */
  get place(): string {
    return data.place;
  },
  set place(p: string) {
    if (p === data.place) return;
    data.place = p;
    persist();
  },
  /** Called after every change (the online save follows). */
  onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** The progress for the online save. */
  snapshot(): OnlineData {
    return {
      version: 1, hero: data.hero, playerName: data.playerName, lang: I18n.lang, place: data.place,
      discoveries: [...data.discoveries], predictions: { ...data.predictions }, savedAt: new Date().toISOString(),
      chapter3: { ...data.chapter3 },
    };
  },
  /** Take over a progress loaded from an online save (checked: it came from the internet). */
  restore(d: Partial<OnlineData>): void {
    data.chapter3 = chapter3Progress(d.chapter3);
    data.hero = AVATARS.includes(d.hero as Avatar) ? (d.hero as Avatar) : null;
    data.playerName = typeof d.playerName === 'string' ? d.playerName.slice(0, 20) : '';
    data.place = typeof d.place === 'string' ? d.place : '';
    data.discoveries = Array.isArray(d.discoveries) ? d.discoveries.filter((x): x is string => typeof x === 'string') : [];
    if (!d.chapter3 && data.place === 'stomach' && data.discoveries.includes('chyme')) data.place = 'intestine-road';
    data.predictions = {};
    for (const [q, a] of Object.entries(d.predictions ?? {})) if (typeof a === 'string') data.predictions[q] = a;
    if (d.lang === 'en' || d.lang === 'ar') I18n.set(d.lang);
    persist();
  },
};
