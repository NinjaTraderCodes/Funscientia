import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { GameState, type OnlineData } from './GameState';

/**
 * Online saves with a save code (backend/: Djihane's Supabase functions).
 *
 * The first time the player has chosen an avatar, the game creates an online save
 * and gets its code (e.g. K7QM-4FXA); after that, every change is saved there too,
 * a moment later. On another device, "Continue with my code" loads it. The browser's
 * own save stays the main one: without a connection the game plays on as before,
 * and the next change tries again.
 */
const CODE_KEY = 'funscientia.code';
const SAVE_DELAY_MS = 1500;
const TIMEOUT_MS = 8000;

/** Thrown when the server cannot be reached (no connection, server paused...). */
export class Offline extends Error {}

const stored = (() => {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
})();
let code: string | null = stored;
let timer = 0;
let busy: Promise<void> | null = null;
let again = false;
const codeListeners = new Set<(code: string, isNew: boolean) => void>();

/** Call one of the three save functions. */
async function rpc<T>(fn: 'create_save' | 'save_progress' | 'load_progress', args: object): Promise<T> {
  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: abort.signal,
    });
    if (!res.ok) throw new Offline(`${fn}: ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    throw e instanceof Offline ? e : new Offline(String(e));
  } finally {
    window.clearTimeout(timeout);
  }
}

function remember(c: string, isNew: boolean): void {
  code = c;
  try {
    localStorage.setItem(CODE_KEY, c);
  } catch {
    /* the code still works for this visit */
  }
  for (const fn of codeListeners) fn(c, isNew);
}

/** Send the current progress (creating the save first if there is none yet). */
async function push(): Promise<void> {
  const data = GameState.snapshot();
  if (!data.hero) return; // nothing worth saving before an avatar is chosen
  if (code && (await rpc<boolean>('save_progress', { p_code: code, p_data: data }))) return;
  // no save yet (or it is gone): make one
  remember(await rpc<string>('create_save', { p_data: data }), true);
}

function flush(): void {
  if (busy) {
    again = true; // save again once this one is done
    return;
  }
  busy = push()
    .catch(() => undefined) // offline: the next change tries again
    .finally(() => {
      busy = null;
      if (again) {
        again = false;
        flush();
      }
    });
}

/** "K7QM 4fxa", "k7qm4fxa"... -> "K7QM-4FXA" (null if it cannot be a code). */
export function normalizeCode(text: string): string | null {
  const c = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[2-9A-HJKMNP-Z]{8}$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4)}` : null;
}

export const OnlineSave = {
  /** This player's save code, once there is one. */
  get code(): string | null {
    return code;
  },
  /** Start saving online whenever the progress changes. */
  start(): void {
    GameState.onChange(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, SAVE_DELAY_MS);
    });
  },
  /** Save now (e.g. before the page is left). */
  saveNow(): void {
    window.clearTimeout(timer);
    flush();
  },
  /** The progress saved under a code: null if there is no such save; throws Offline. */
  async load(text: string): Promise<OnlineData | null> {
    const c = normalizeCode(text);
    if (!c) return null;
    const data = await rpc<OnlineData | null>('load_progress', { p_code: c });
    return data && typeof data === 'object' ? data : null;
  },
  /** Start a new save of their own at the next change (after loading a starting point). */
  forget(): void {
    code = null;
    try {
      localStorage.removeItem(CODE_KEY);
    } catch {
      /* ignore */
    }
  },
  /** From now on, save to this code (it was just loaded). */
  adopt(text: string): void {
    const c = normalizeCode(text);
    if (c) remember(c, false);
  },
  /** Called when the player gets a code (isNew: just created, worth telling them). */
  onCode(fn: (code: string, isNew: boolean) => void): () => void {
    codeListeners.add(fn);
    return () => codeListeners.delete(fn);
  },
};
