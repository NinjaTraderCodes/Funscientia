/**
 * The player's settings on this device (not part of the save): music and sound-effect levels, and
 * "reduce motion" (no decorative animations or camera shakes; it starts on when the system asks for it).
 */
const KEY = 'funscientia.settings';
interface Values { music: number; sfx: number; reduceMotion: boolean }

const read = (): Values => {
  const base: Values = { music: 1, sfx: 1, reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Values>;
    const level = (n: unknown, d: number) => (typeof n === 'number' && n >= 0 && n <= 1 ? n : d);
    return { music: level(v.music, base.music), sfx: level(v.sfx, base.sfx), reduceMotion: typeof v.reduceMotion === 'boolean' ? v.reduceMotion : base.reduceMotion };
  } catch {
    return base;
  }
};

const values = read();
const listeners = new Set<() => void>();
const apply = () => document.documentElement.classList.toggle('reduce-motion', values.reduceMotion);
apply();

export const Settings = {
  get music(): number { return values.music; },
  get sfx(): number { return values.sfx; },
  get reduceMotion(): boolean { return values.reduceMotion; },
  set(change: Partial<Values>): void {
    Object.assign(values, change);
    try {
      localStorage.setItem(KEY, JSON.stringify(values));
    } catch {
      /* storage blocked: the settings last for this visit */
    }
    apply();
    for (const fn of listeners) fn();
  },
  onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
