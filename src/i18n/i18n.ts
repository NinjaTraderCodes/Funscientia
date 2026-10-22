import '@fontsource/baloo-bhaijaan-2/arabic-500.css';
import '@fontsource/baloo-bhaijaan-2/arabic-700.css';
import '@fontsource/baloo-bhaijaan-2/arabic-800.css';
import { en, type Key } from './en';
import { ar } from './ar';

/**
 * English / Arabic. Every text the player sees comes from the phrasebooks
 * (en.ts, ar.ts) or from the dialogue files of the language
 * (content/dialogue/*.ink and content/dialogue/ar/*.ink).
 */
export type Lang = 'en' | 'ar';
const KEY = 'funscientia.lang';
const BOOKS: Record<Lang, Record<Key, string>> = { en, ar };

const saved = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();
let current: Lang = saved === 'ar' || saved === 'en' ? saved : navigator.language?.startsWith('ar') ? 'ar' : 'en';
const listeners = new Set<(l: Lang) => void>();

/** A text in the current language; {name} placeholders are filled from `vars`. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const s = BOOKS[current][key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export const I18n = {
  get lang(): Lang {
    return current;
  },
  get rtl(): boolean {
    return current === 'ar';
  },
  /** Font family for texts drawn by the game itself (Phaser). */
  get font(): string {
    return current === 'ar' ? "'Baloo Bhaijaan 2', Tahoma, sans-serif" : "'Trebuchet MS', 'Segoe UI', sans-serif";
  },
  /** Font family for titles and labels drawn by the game (a storybook serif in English). */
  get display(): string {
    return current === 'ar' ? "'Baloo Bhaijaan 2', Tahoma, sans-serif" : 'Georgia, serif';
  },
  /** Style extras for game-drawn text in this language (right-to-left for Arabic). */
  get textStyle(): { rtl: boolean } {
    return { rtl: current === 'ar' };
  },
  set(lang: Lang): void {
    if (lang === current) return;
    current = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
    applyPage();
    for (const fn of listeners) fn(lang);
  },
  /** Called whenever the language changes (to redraw texts that are on screen). */
  onChange(fn: (l: Lang) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** The page's fixed texts (data-i18n="key", data-i18n-aria="key") and its language. */
export function applyPage(root: ParentNode = document): void {
  document.documentElement.lang = current;
  if (current === 'ar') loadArabicFont();
  document.documentElement.classList.toggle('lang-ar', current === 'ar');
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as Key));
  });
}

/**
 * The game draws its own texts on a canvas, which cannot wait for a web font:
 * fetch the Arabic font as soon as Arabic is chosen, so it is ready to draw with.
 */
let arabicFont: Promise<unknown> | undefined;
function loadArabicFont(): void {
  arabicFont ??= Promise.all(['500', '700', '800'].map((w) => document.fonts?.load(`${w} 20px 'Baloo Bhaijaan 2'`, 'عربي'))).catch(() => {});
}

export type { Key };
