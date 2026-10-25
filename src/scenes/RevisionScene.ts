import { Chapter3Base } from './Chapter3Base';
import { t, type Key } from '../i18n/i18n';
import { GameState } from '../state/GameState';
import { asset } from '../assetUrl';
import { Sound } from '../audio/Sound';
import { DialogueBox } from '../ui/DialogueBox';
import { DialogueRunner } from '../dialogue/DialogueRunner';

/**
 * The Kingdom Memory Challenge (Dounia's "Enzyme Match" cards, Memory_Game_*): two memory boards of
 * six picture/name pairs, then three questions. Progress is saved after each step (chapter3.quiz:
 * 0-1 the boards, 2-4 the questions, 5 the end).
 */

/** a memory pair: Dounia's picture card, and the navy name card the game writes the name on */
type CardKind = 'protein' | 'polypeptide' | 'peptide' | 'starch' | 'maltose' | 'glucose'
  | 'fat' | 'fatPieces' | 'bile' | 'lipase' | 'amylase' | 'pepsin';
/** the pictures of the questions (c3.mol.* names) */
type QuizKind = 'starch' | 'glucose' | 'fat' | 'aminoAcid' | 'polypeptide' | 'maltose'
  | 'water' | 'minerals' | 'fibre' | 'waterVitamins' | 'fatVitamins';
interface MemoryCard { id: number; kind: CardKind; face: 'picture' | 'name' }
interface Question { prompt: Key; explanation: Key; choices: { id: string; kind?: QuizKind; label?: Key }[]; correct: string[] }

const BOARDS: readonly { title: Key; kinds: readonly CardKind[] }[] = [
  { title: 'c3.board.proteins', kinds: ['protein', 'polypeptide', 'peptide', 'starch', 'maltose', 'glucose'] },
  { title: 'c3.board.fats', kinds: ['fat', 'fatPieces', 'bile', 'lipase', 'amylase', 'pepsin'] },
];
const choices = (kinds: QuizKind[]) => kinds.map((kind) => ({ id: kind, kind }));
const QUESTIONS: readonly Question[] = [
  { prompt: 'c3.quiz.complex', explanation: 'c3.quiz.explainComplex', choices: choices(['starch', 'glucose', 'fat', 'aminoAcid', 'polypeptide', 'maltose']), correct: ['starch', 'fat', 'polypeptide', 'maltose'] },
  { prompt: 'c3.quiz.absorbable', explanation: 'c3.quiz.explainAbsorbable', choices: choices(['water', 'starch', 'aminoAcid', 'minerals', 'fibre', 'glucose', 'waterVitamins', 'fatVitamins']), correct: ['water', 'aminoAcid', 'minerals', 'glucose', 'waterVitamins', 'fatVitamins'] },
  { prompt: 'c3.quiz.cellulose', explanation: 'c3.quiz.explainFibre', choices: [{ id: 'cuts', label: 'c3.quiz.fibreCuts' }, { id: 'absorbed', label: 'c3.quiz.fibreAbsorbed' }, { id: 'moves', label: 'c3.quiz.fibreMoves' }], correct: ['moves'] },
];
/** stars for the two boards together (twelve pairs: twelve moves is a perfect memory) */
const STARS = [28, 20];
const cardName = (kind: CardKind): Key => ('c3.card.' + kind) as Key;
const img = (path: string, cls = '') => '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + asset(path) + '" alt="" draggable="false" />';
/** a question's picture on its card (fibre has no card of Dounia's: drawn on her blank one) */
const quizCard = (kind: QuizKind) => kind === 'fibre'
  ? img('revision/card_blank.webp') + img('intestine/fibre.webp', 'mg-sprite')
  : img('revision/card_' + kind + '.webp');
/** a name's size on its card, by its length (in card widths) */
const wordSize = (s: string) => s.length <= 6 ? 19 : s.length <= 8 ? 16 : s.length <= 10 ? 14 : s.length <= 16 ? 12 : 11;

export function sameAnswers(selected: ReadonlySet<string>, correct: readonly string[]): boolean {
  return selected.size === correct.length && correct.every((id) => selected.has(id));
}

export class RevisionScene extends Chapter3Base {
  private step = 0;
  private cards: MemoryCard[] = [];
  private matched = new Set<number>();
  private open: number[] = [];
  /** the two cards of a wrong pair, while they shake */
  private missed: number[] = [];
  private moves = 0;
  /** moves on both boards in this sitting (for the stars; unknown after a reload) */
  private totalMoves = 0;
  private boardsPlayed = 0;
  private locked = false;
  private selected = new Set<string>();
  private checked = false;
  private box!: DialogueBox;
  private talking = false;
  private feedback: { key: Key; vars?: Record<string, string | number>; explanation?: Key } = { key: 'c3.quiz.hint' };
  constructor() { super('Revision', 'revision/hall.webp'); }
  init(data: { replay?: boolean } = {}): void {
    if (data.replay) GameState.checkpointChapter3({ quiz: 0 });
    this.totalMoves = 0;
    this.boardsPlayed = 0;
  }
  create(): void {
    this.step = GameState.chapter3.quiz;
    GameState.place = this.step >= 5 ? 'complete' : 'revision';
    this.prepareStep();
    this.mount();
    this.root.classList.add('revision-game');
    this.redraw();
    this.box = new DialogueBox(GameState.storyLeader);
    this.events.once('shutdown', () => this.box.destroy());
    if (this.step === 0) void this.intro();
  }
  private async intro(): Promise<void> {
    this.talking = true; this.main.inert = true; this.footer.inert = true;
    const runner = await DialogueRunner.load('revision', GameState.storyLeader);
    await runner.run('intro', this.box);
    if (!this.sys.isActive()) return;
    this.talking = false; this.main.inert = this.paused; this.footer.inert = this.paused;
  }
  private prepareStep(): void {
    this.matched = new Set(); this.open = []; this.missed = []; this.moves = 0; this.locked = false;
    this.selected = new Set(); this.checked = false;
    this.feedback = { key: this.step < 2 ? 'c3.quiz.hint' : 'c3.quiz.choose' };
    if (this.step < 2) {
      this.cards = BOARDS[this.step].kinds.flatMap((kind, i) => [{ id: i * 2, kind, face: 'picture' as const }, { id: i * 2 + 1, kind, face: 'name' as const }]);
      for (let i = this.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
      }
    }
  }
  protected redraw(keyboard = false): void {
    if (this.feedback.key === 'c3.quiz.feedbackWrong' && this.step >= 2 && this.step < 5) this.feedback.vars = { why: t(QUESTIONS[this.step - 2].explanation) };
    this.root.dataset.step = String(this.step);
    this.heading.textContent = t(this.step >= 5 ? 'c3.end.title' : 'c3.quiz.title');
    this.footer.hidden = this.step >= 5;
    if (this.step < 2) this.renderMemory(keyboard);
    else if (this.step < 5) this.renderQuestion(keyboard);
    else this.renderEnding(keyboard);
  }

  /** The board is built once; flipping only changes classes, so the cards turn over (CSS 3D). */
  private renderMemory(keyboard: boolean): void {
    const complete = this.matched.size === this.cards.length;
    let grid = this.main.querySelector<HTMLElement>('.mg-grid');
    if (!grid || grid.dataset.board !== String(this.step)) {
      this.replaceMain('<section class="mg-board"><h2 class="mg-title"><span></span></h2><div class="mg-grid" data-board="' + this.step + '">' + this.cards.map((card, i) =>
        '<button type="button" class="mg-card" data-action="flip" data-card="' + card.id + '" data-focus="card-' + card.id + '" style="--i:' + i + '"><span class="mg-inner">' +
        '<span class="mg-face mg-back">' + img('revision/card_back.webp') + '</span>' +
        '<span class="mg-face mg-front">' + (card.face === 'picture' ? img('revision/card_' + card.kind + '.webp') : img('revision/card_name.webp') + '<b class="mg-word"></b>') + '</span>' +
        '</span></button>').join('') + '</div></section>', keyboard);
      grid = this.main.querySelector<HTMLElement>('.mg-grid')!;
    }
    this.main.querySelector('.mg-title span')!.textContent = t(BOARDS[this.step].title);
    grid.querySelectorAll<HTMLButtonElement>('.mg-card').forEach((b, i) => {
      const card = this.cards[i];
      const found = this.matched.has(card.id);
      const up = found || this.open.includes(card.id);
      const name = t(cardName(card.kind));
      b.classList.toggle('flipped', up);
      b.classList.toggle('matched', found);
      b.classList.toggle('miss', this.missed.includes(card.id));
      b.disabled = found;
      b.setAttribute('aria-pressed', String(up));
      b.setAttribute('aria-label', up ? name : t('c3.quiz.hidden', { n: i + 1 }));
      const word = b.querySelector<HTMLElement>('.mg-word');
      if (word) { word.textContent = name; word.style.setProperty('--fs', String(wordSize(name))); }
    });
    this.sharedHud.setScore(this.matched.size / 2);
    this.feedbackReaction(complete && !this.locked ? t('c3.quiz.boardDone') : t(this.feedback.key, this.feedback.vars) + (this.feedback.explanation ? ' ' + t(this.feedback.explanation) : ''));
    this.footer.innerHTML = complete ? this.primary(t('c3.continue'), 'next', this.locked) : '';
  }
  private renderQuestion(keyboard: boolean): void {
    const q = QUESTIONS[this.step - 2];
    const single = this.step === 4;
    const tick = (on: boolean) => '<b class="mg-tick' + (on ? ' on' : '') + '" aria-hidden="true">' + (on ? '✓' : '') + '</b>';
    this.replaceMain('<section class="mg-quiz' + (single ? ' single' : '') + '"><h2 class="mg-title"><span>' + t(q.prompt) + '</span></h2>' +
      (single ? '<div class="mg-example">' + quizCard('fibre') + '</div>' : '') +
      '<div class="mg-choices n' + q.choices.length + '">' + q.choices.map((choice) => {
        const on = this.selected.has(choice.id);
        const right = this.checked && q.correct.includes(choice.id);
        return '<button type="button" class="mg-choice' + (choice.kind ? '' : ' text') + (on ? ' on' : '') + (right ? ' right' : '') + '" data-action="choose" data-choice="' + choice.id + '" data-focus="choice-' + choice.id + '" aria-pressed="' + on + '"' + (this.checked ? ' disabled' : '') + '>' +
          (choice.kind ? '<span class="mg-pic">' + quizCard(choice.kind) + '</span>' : '') +
          '<span class="mg-label">' + t(choice.label ?? (('c3.mol.' + choice.kind) as Key)) + '</span>' + tick(on) + '</button>';
      }).join('') + '</div></section>', keyboard);
    this.feedbackReaction(t(this.feedback.key, this.feedback.vars) + (this.checked ? ' ' + t(q.explanation) : ''));
    this.footer.innerHTML = this.primary(t(this.checked ? 'c3.continue' : 'c3.quiz.check'), this.checked ? 'next' : 'check');
  }
  private renderEnding(keyboard: boolean): void {
    const stars = this.boardsPlayed === 2 ? 1 + STARS.filter((s) => this.totalMoves <= s).length : 3;
    this.replaceMain('<section class="mh-results-card c3-ending"><div class="c3-trio">' + ['nesma', 'fox', 'walid'].map((who) => img('portraits/' + who + '_cheering.webp')).join('') +
      '</div><div class="c3-stars">' + [0, 1, 2].map((i) => '<img class="' + (i < stars ? 'won' : '') + '" src="' + asset('mouth/ui_star.webp') + '" alt="" />').join('') +
      '</div><h2>' + t('c3.end.title') + '</h2><p>' + t('c3.end.text') + '</p><div class="c3-ending-actions">' + this.primary(t('c3.end.replayQuiz'), 'replayQuiz') + this.primary(t('c3.end.replayMission'), 'replayMission') +
      '<button type="button" class="c3-secondary" data-action="road">' + t('c3.end.road') + '</button></div></section>', keyboard);
  }
  protected action(button: HTMLElement, keyboard: boolean): void {
    if (this.talking) return;
    const action = button.dataset.action;
    if (action === 'flip' && this.step < 2) { this.flip(Number(button.dataset.card), keyboard); return; }
    if (action === 'choose' && this.step >= 2 && this.step < 5 && !this.checked) {
      const id = button.dataset.choice!;
      if (this.step === 4) this.selected.clear();
      if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
      if (this.selected.has(id)) Sound.tone(600, 760, 0.07, 0.03); else Sound.tone(520, 400, 0.07, 0.03);
      this.feedback = { key: 'c3.quiz.choose' };
      this.redraw(keyboard); return;
    }
    if (action === 'check' && this.step >= 2 && this.step < 5 && !this.checked) {
      const q = QUESTIONS[this.step - 2];
      if (!this.selected.size) this.feedback = { key: 'c3.quiz.selectFirst' };
      else if (sameAnswers(this.selected, q.correct)) {
        this.checked = true; this.feedback = { key: 'c3.quiz.correct' }; Sound.chime();
      } else {
        this.feedback = { key: 'c3.quiz.feedbackWrong', vars: { why: t(q.explanation) } };
        Sound.tone(280, 220, 0.12, 0.035);
      }
      this.redraw(keyboard); return;
    }
    if (action === 'next' && !this.locked && (this.step < 2 ? this.matched.size === 12 : this.step < 5 && this.checked)) {
      if (this.step < 2) { this.totalMoves += this.moves; this.boardsPlayed++; }
      this.step++;
      GameState.checkpointChapter3({ quiz: this.step });
      if (this.step === 5) { GameState.discover('kingdom_complete'); GameState.place = 'complete'; Sound.chime(); }
      this.prepareStep(); this.redraw(keyboard);
      if (keyboard) this.main.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (this.step >= 5) {
      if (action === 'replayQuiz') this.scene.restart({ replay: true });
      if (action === 'replayMission') this.scene.start('SmallIntestine', { replay: true });
      if (action === 'road') this.scene.start('World', { place: 'intestine-road' });
    }
  }
  private flip(id: number, keyboard: boolean): void {
    if (this.locked || this.matched.has(id) || this.open.includes(id) || !this.cards.some((c) => c.id === id)) return;
    this.open.push(id);
    Sound.tone(700, 900, 0.05, 0.025);
    if (this.open.length === 2) {
      this.moves++; this.locked = true;
      const [a, b] = this.open.map((i) => this.cards.find((c) => c.id === i)!);
      const match = a.kind === b.kind && a.face !== b.face;
      if (match) {
        this.open.forEach((i) => this.matched.add(i));
        this.time.delayedCall(380, () => Sound.chime());
        this.feedback = { key: 'c3.quiz.match', vars: { name: t(cardName(a.kind)) }, explanation: ('c3.why.' + a.kind) as Key };
      } else {
        this.missed = [...this.open];
        this.feedback = { key: 'c3.quiz.miss' };
        this.time.delayedCall(520, () => Sound.tone(300, 220, 0.16, 0.03));
      }
      this.time.delayedCall(match ? 1100 : 1500, () => {
        this.open = []; this.missed = []; this.locked = false; this.redraw(keyboard);
        if (keyboard) (this.main.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? this.footer.querySelector<HTMLButtonElement>('button'))?.focus();
      });
    }
    this.redraw(keyboard);
  }
}
