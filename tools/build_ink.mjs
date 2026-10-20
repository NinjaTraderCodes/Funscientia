// Compile every content/dialogue/*.ink into public/assets/dialogue/*.json.
// Usage: node tools/build_ink.mjs   (also run by `npm run ink`)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Compiler } from 'inkjs/full';

const src = 'content/dialogue';
const out = 'public/assets/dialogue';
mkdirSync(out, { recursive: true });
let failed = false;
for (const file of readdirSync(src).filter((f) => f.endsWith('.ink'))) {
  const compiler = new Compiler(readFileSync(join(src, file), 'utf8'));
  const story = compiler.Compile();
  for (const w of compiler.warnings) console.warn(`${file}: ${w}`);
  if (compiler.errors.length) {
    failed = true;
    for (const e of compiler.errors) console.error(`${file}: ${e}`);
    continue;
  }
  const json = story.ToJson();
  writeFileSync(join(out, basename(file, '.ink') + '.json'), json);
  console.log(`compiled ${file} -> ${out}/${basename(file, '.ink')}.json`);
}
process.exit(failed ? 1 : 0);
