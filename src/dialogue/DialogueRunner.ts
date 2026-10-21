import { Story } from 'inkjs';
import { asset } from '../assetUrl';

/** leader/buddy resolve to the chosen hero; walid/nesma name a kid directly (before the choice). */
export type Speaker = 'leader' | 'buddy' | 'walid' | 'nesma' | 'fox' | 'tooth';
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
  close(): void;
}

export interface RunResult {
  actions: string[];
  discoveries: string[];
}

const tagValue = (tags: string[], key: string) =>
  tags.find((t) => t.startsWith(key + ':'))?.slice(key.length + 1).trim();

/**
 * Plays ink knots (content/dialogue/*.ink, compiled to JSON) through a view.
 * Story state persists between knots, so variables like `met_tooth` and the
 * player's prediction survive the whole visit.
 */
export class DialogueRunner {
  private constructor(private readonly story: Story) {}

  static async load(name: string, hero: Hero): Promise<DialogueRunner> {
    const json = await (await fetch(asset(`dialogue/${name}.json`))).text();
    const story = new Story(json.replace(/^﻿/, ''));
    // only stories that declare VAR leader get it (setting an undeclared variable throws)
    if (json.includes('"leader"')) story.variablesState['leader'] = hero;
    return new DialogueRunner(story);
  }

  variable(name: string): unknown {
    return this.story.variablesState[name];
  }

  async run(knot: string, view: DialogueView): Promise<RunResult> {
    const result: RunResult = { actions: [], discoveries: [] };
    this.story.ChoosePathString(knot);
    for (;;) {
      while (this.story.canContinue) {
        const text = this.story.Continue()?.trim() ?? '';
        const tags = this.story.currentTags ?? [];
        const action = tagValue(tags, 'action');
        const discovery = tagValue(tags, 'discovery');
        if (action) result.actions.push(action);
        if (discovery) result.discoveries.push(discovery);
        if (!text) continue;
        await view.showLine({
          speaker: (tagValue(tags, 'speaker') as Speaker) ?? 'leader',
          mood: tagValue(tags, 'mood') ?? 'happy',
          sfx: tagValue(tags, 'sfx'),
          text,
        });
      }
      const choices = this.story.currentChoices;
      if (!choices.length) break;
      this.story.ChooseChoiceIndex(await view.showChoices(choices.map((c) => c.text)));
    }
    view.close();
    return result;
  }
}
