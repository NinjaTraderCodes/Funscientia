import { t, type Key } from '../i18n/i18n';

/** What a discovery says, in the current language (phrasebook keys disc.<id>). */
export function discoveryText(id: string): string {
  const key = `disc.${id}` as Key;
  const s = t(key);
  return s === key ? id : s;
}

/** A note of Nesma's Discovery Book: its picture, and where to look for it while it is still missing. */
export interface BookNote { id: string; art: string; where: Key }
export interface BookPage { id: string; title: Key; notes: BookNote[] }

/** The book's pages, one per part of the Kingdom of Digestion, in the order of the journey. */
export const BOOK: readonly BookPage[] = [
  {
    id: 'mouth', title: 'book.page.mouth', notes: [
      { id: 'saliva_smell', art: 'mouth/bread.webp', where: 'book.where.mouthGate' },
      { id: 'teeth_chew', art: 'mouth/ui_card_chew.webp', where: 'book.where.mouth' },
      { id: 'tongue_mix', art: 'mouth/ui_card_mix.webp', where: 'book.where.mouth' },
      { id: 'saliva_amylase', art: 'mouth/ui_card_digest.webp', where: 'book.where.mouth' },
      { id: 'bolus_swallow', art: 'mouth/bolus.webp', where: 'book.where.mouth' },
    ],
  },
  {
    id: 'esophagus', title: 'book.page.esophagus', notes: [
      { id: 'mucus_slide', art: 'chapters/esophagus.webp', where: 'book.where.esophagus' },
      { id: 'peristalsis', art: 'world/esophagus_far.webp', where: 'book.where.esophagus' },
      { id: 'sphincter', art: 'world/npc_stomach.webp', where: 'book.where.stomachGate' },
    ],
  },
  {
    id: 'stomach', title: 'book.page.stomach', notes: [
      { id: 'stomach_churn', art: 'stomach/ui_card_churn.webp', where: 'book.where.stomach' },
      { id: 'stomach_acid', art: 'stomach/ui_card_acid.webp', where: 'book.where.stomach' },
      { id: 'pepsin_protein', art: 'stomach/ui_card_pepsin.webp', where: 'book.where.stomach' },
      { id: 'enzyme_specific', art: 'portraits/pepsin_happy.webp', where: 'book.where.stomach' },
      { id: 'chyme', art: 'stomach/ui_card_chyme.webp', where: 'book.where.stomach' },
    ],
  },
  {
    id: 'intestine', title: 'book.page.intestine', notes: [
      { id: 'bile', art: 'intestine/bile.webp', where: 'book.where.junction' },
      { id: 'intestinal_fats', art: 'intestine/ui_card_fats.webp', where: 'book.where.intestine' },
      { id: 'intestinal_protein', art: 'intestine/ui_card_proteins.webp', where: 'book.where.intestine' },
      { id: 'intestinal_carbs', art: 'intestine/ui_card_carbs.webp', where: 'book.where.intestine' },
      { id: 'ready_nutrients', art: 'intestine/water.webp', where: 'book.where.intestine' },
      { id: 'absorption', art: 'intestine/ui_card_absorb.webp', where: 'book.where.intestine' },
    ],
  },
];

/** Every note of the book (the kingdom's crown, kingdom_complete, is shown on the Journey page). */
export const BOOK_NOTES: readonly string[] = BOOK.flatMap((p) => p.notes.map((n) => n.id));

/** The journey's stops: where each starts and ends in GameState.PLACE_ORDER, and the mission it scores. */
export interface JourneyStop { title: Key; from: string; to: string; result?: string }
export const JOURNEY: readonly JourneyStop[] = [
  { title: 'chapter.roadToMouth', from: 'road', to: 'road2' },
  { title: 'chapter.mouthMission', from: 'mouth', to: 'mouth', result: 'mouth' },
  { title: 'chapter.esophagus', from: 'esophagus', to: 'esophagus' },
  { title: 'chapter.stomachMission', from: 'stomach', to: 'stomach', result: 'stomach' },
  { title: 'chapter.roadToSmallIntestine', from: 'intestine-road', to: 'intestine-gate' },
  { title: 'chapter.smallIntestineMission', from: 'small-intestine', to: 'small-intestine', result: 'small-intestine' },
  { title: 'chapter.revision', from: 'revision', to: 'revision', result: 'revision' },
];

/** The kingdoms still to come (shown, locked, after the Kingdom of Digestion). */
export const COMING: readonly { title: Key; art: string }[] = [
  { title: 'book.kingdom.breathing', art: 'kingdoms/breathing.webp' },
  { title: 'book.kingdom.defenders', art: 'kingdoms/defenders.webp' },
  { title: 'book.kingdom.nerves', art: 'kingdoms/nerves.webp' },
];
