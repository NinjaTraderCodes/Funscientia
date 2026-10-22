// Compile every content/dialogue/*.ink (English) and content/dialogue/ar/*.ink (Arabic) into JSON.
// Usage: node tools/build_ink.mjs   (also run by `npm run ink`)
//
// Each language's story must have the same structure as the English one (same knots,
// lines, tags and choices - only the words differ): the game moves a story's state from
// one language to the other when the player switches, even in the middle of a talk.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Compiler } from 'inkjs/full';

const LANGS = ['ar'];
let failed = false;
const compiled = {}; // `${lang}/${name}` -> json

function compile(src, out, lang) {
  if (!existsSync(src)) return;
  mkdirSync(out, { recursive: true });
  for (const file of readdirSync(src).filter((f) => f.endsWith('.ink'))) {
    const compiler = new Compiler(readFileSync(join(src, file), 'utf8'));
    const story = compiler.Compile();
    for (const w of compiler.warnings) console.warn(`${src}/${file}: ${w}`);
    if (compiler.errors.length) {
      failed = true;
      for (const e of compiler.errors) console.error(`${src}/${file}: ${e}`);
      continue;
    }
    const name = basename(file, '.ink');
    const json = story.ToJson();
    writeFileSync(join(out, name + '.json'), json);
    compiled[`${lang}/${name}`] = json;
    console.log(`compiled ${src}/${file} -> ${out}/${name}.json`);
  }
}

compile('content/dialogue', 'public/assets/dialogue', 'en');
for (const lang of LANGS) compile(`content/dialogue/${lang}`, `public/assets/dialogue/${lang}`, lang);

// the shape of a story without its words: every text ("^...") becomes "^"
const shape = (json) => JSON.stringify(JSON.parse(json), (_, v) => (typeof v === 'string' && v.startsWith('^') ? '^' : v));
for (const key of Object.keys(compiled).filter((k) => k.startsWith('en/'))) {
  const name = key.slice(3);
  for (const lang of LANGS) {
    const other = compiled[`${lang}/${name}`];
    if (!other) {
      failed = true;
      console.error(`missing content/dialogue/${lang}/${name}.ink (every dialogue needs every language)`);
    } else if (shape(other) !== shape(compiled[key])) {
      failed = true;
      console.error(`content/dialogue/${lang}/${name}.ink does not match the English story's structure (lines, tags, choices)`);
    }
  }
}
process.exit(failed ? 1 : 0);
