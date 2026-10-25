import { I18n, type Lang } from '../i18n/i18n';
import { Story } from 'inkjs';
import { asset } from '../assetUrl';

/** leader/buddy resolve to the chosen hero; walid/nesma name a kid directly (before the choice). */
export type Speaker = 'leader' | 'buddy' | 'walid' | 'nesma' | 'fox' | 'tooth' | 'stomach' | 'intestine';
export type Hero = 'walid' | 'nesma';

export interface Line {
  speaker: Speaker;
  mood: string;
  text: string;
  /** A sound that goes with the line (#sfx:name -> audio/name.m4a), e.g. the kids' "wow". */
  sfx?: string;
}

/** What the dialogue view must provide; the runner stays UI-agnostic. */
export interface DialogueView {
  showLine(line: Line): Promise<void>;
  showChoices(choices: string[]): Promise<number>;
  /** The language changed while a line or choices were open: show them in the new words. */
  retext?(text: string): void;
  rechoices?(choices: string[]): void;
  close(): void;
}

export interface RunResult {
  actions: string[];
  discoveries: string[];
}

const tagValue = (tags: string[], key: string) =>
  tags.find((t) => t.startsWith(key + ':'))?.slice(key.length + 1).trim();

/** A compiled story in a language (English when that language has none). */
async function fetchStory(name: string, lang: Lang): Promise<{ story: Story; lang: Lang }> {
  if (lang !== 'en') {
    // a missing file may come back as the web page itself (dev server), so check it is a story
    const res = await fetch(asset(`dialogue/${lang}/${name}.json`)).catch(() => null);
    const json = res?.ok ? (await res.text()).replace(/^\uFEFF/, '') : '';
    if (json.startsWith('{')) return { story: new Story(json), lang };
  }
  const json = (await (await fetch(asset(`dialogue/${name}.json`))).text()).replace(/^\uFEFF/, '');
  return { story: new Story(json), lang: 'en' };
}

/**
 * Plays ink knots (content/dialogue/*.ink, compiled to JSON) through a view.
 * Story state persists between knots, so variables like `met_tooth` and the
 * player's prediction survive the whole visit.
 *
 * The languages' stories have the same structure (tools/build_ink.mjs checks
 * it), so when the player switches language, the story's state - even in the
 * middle of a conversation - moves into the other language's story and the
 * next line comes in the new language.
 */
export class DialogueRunner {
  private constructor(
    private story: Story,
    private lang: Lang,
    private readonly name: string,
  ) {}

  /** The state just before the line on screen: replaying from it gives the same line (and choices) in another language. */
  private before = '';
  /** A language switch being applied while a line is open (the loop waits for it). */
  private switching: Promise<void> = Promise.resolve();

  static async load(name: string, hero: Hero): Promise<DialogueRunner> {
    const { story, lang } = await fetchStory(name, I18n.lang);
    // only stories that declare VAR leader get it (setting an undeclared variable throws)
    try {
      story.variablesState['leader'] = hero;
    } catch {
      /* not declared in this story */
    }
    return new DialogueRunner(story, lang, name);
  }

  /** Follow a language switch: carry the story's state over into the new language. */
  private async followLanguage(): Promise<void> {
    const want = I18n.lang;
    if (want === this.lang) return;
    const next = await fetchStory(this.name, want).catch(() => null);
    if (!next || next.lang === this.lang) {
      this.lang = want; // nothing to switch to: don't ask again
      return;
    }
    try {
      next.story.state.LoadJson(this.story.state.ToJson());
      this.story = next.story;
      this.lang = next.lang;
    } catch {
      this.lang = want; // not the same structure: keep the current language for this visit
    }
  }

  /** Set a story variable the ink declares (setting an undeclared one is skipped). */
  setVariable(name: string, value: string | number | boolean): void {
    try {
      this.story.variablesState[name] = value;
    } catch {
      /* not declared in this story */
    }
  }

  /**
   * The player switched language while a line (or choices) is on screen: replay
   * the last step in the other language's story and show its words instead.
   */
  private relang(view: DialogueView, choices: boolean): void {
    this.switching = this.switching.then(async () => {
      const want = I18n.lang;
      if (want === this.lang) return;
      const next = await fetchStory(this.name, want).catch(() => null);
      if (!next || next.lang === this.lang) return;
      try {
        next.story.state.LoadJson(this.before);
        view.retext?.(next.story.Continue()?.trim() ?? '');
        if (choices) {
          while (next.story.canContinue) next.story.Continue();
          view.rechoices?.(next.story.currentChoices.map((c) => c.text));
        }
        this.story = next.story;
        this.lang = next.lang;
      } catch {
        /* not the same structure: stay in the current language for this line */
      }
    });
  }

  /** Wait for what the view shows, following language switches meanwhile. */
  private async showing<T>(view: DialogueView, shown: Promise<T>, choices: boolean): Promise<T> {
    const off = I18n.onChange(() => this.relang(view, choices));
    try {
      return await shown;
    } finally {
      off();
      await this.switching;
    }
  }

  variable(name: string): unknown {
    return this.story.variablesState[name];
  }

  async run(knot: string, view: DialogueView): Promise<RunResult> {
    const result: RunResult = { actions: [], discoveries: [] };
    await this.followLanguage();
    this.story.ChoosePathString(knot);
    for (;;) {
      while (this.story.canContinue) {
        await this.followLanguage();
        const before = this.story.state.ToJson();
        const text = this.story.Continue()?.trim() ?? '';
        const tags = this.story.currentTags ?? [];
        const action = tagValue(tags, 'action');
        // a line may award several discoveries at once (#discovery:a #discovery:b)
        if (action) result.actions.push(action);
        for (const t of tags) if (t.startsWith('discovery:')) result.discoveries.push(t.slice('discovery:'.length).trim());
        if (!text) continue;
        this.before = before;
        const line = {
          speaker: (tagValue(tags, 'speaker') as Speaker) ?? 'leader',
          mood: tagValue(tags, 'mood') ?? 'happy',
          sfx: tagValue(tags, 'sfx'),
          text,
        };
        await this.showing(view, view.showLine(line), false);
      }
      const choices = this.story.currentChoices;
      if (!choices.length) break;
      const pick = await this.showing(view, view.showChoices(choices.map((c) => c.text)), true);
      this.story.ChooseChoiceIndex(pick);
    }
    view.close();
    return result;
  }
}
