import type { CharacterName } from '../data/types';
import type { Hero } from '../dialogue/DialogueRunner';

const KEY = 'funscientia.save.v1';

interface SaveData {
  hero: Hero | null;
  discoveries: string[];
  predictions: Record<string, string>;
}

const load = (): SaveData => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { hero: null, discoveries: [], predictions: {}, ...JSON.parse(raw) };
  } catch {
    /* storage blocked: play without saving */
  }
  return { hero: null, discoveries: [], predictions: {} };
};

const data = load();
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
};

/** Progress that outlives a scene: chosen hero, discoveries, predictions. */
export const GameState = {
  get hero(): Hero | null {
    return data.hero;
  },
  set hero(h: Hero | null) {
    data.hero = h;
    persist();
  },
  /** Character sprite names: the chosen hero leads, the other kid and the fox follow. */
  get leaderName(): CharacterName {
    return data.hero === 'nesma' ? 'girl' : 'boy';
  },
  get buddyName(): CharacterName {
    return data.hero === 'nesma' ? 'boy' : 'girl';
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
  predict(question: string, answer: string): void {
    data.predictions[question] = answer;
    persist();
  },
};
