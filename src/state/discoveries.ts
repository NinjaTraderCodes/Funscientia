import { t, type Key } from '../i18n/i18n';

/** What a discovery says, in the current language (phrasebook keys disc.<id>). */
export function discoveryText(id: string): string {
  const key = `disc.${id}` as Key;
  const s = t(key);
  return s === key ? id : s;
}
