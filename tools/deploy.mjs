// Build the game and publish dist/ to the gh-pages branch (GitHub Pages serves it).
// Usage: npm run deploy
//
// Used instead of the GitHub Actions workflow while Actions is unavailable on the
// account; both publish the same build. Live site:
//   https://ninjatradercodes.github.io/Funscientia/
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
const read = (cmd) => execSync(cmd).toString().trim();

const remote = read('git remote get-url origin');
const commit = read('git rev-parse --short HEAD');
const dirty = read('git status --porcelain') !== '';

run('npm run build');
const dir = mkdtempSync(join(tmpdir(), 'funscientia-pages-'));
cpSync('dist', dir, { recursive: true });
writeFileSync(join(dir, '.nojekyll'), ''); // serve files as-is (no Jekyll processing)
run('git init -q -b gh-pages', dir);
run('git add -A', dir);
run(`git commit -q -m "Deploy ${commit}${dirty ? ' (+ local changes)' : ''}"`, dir);
run(`git push -q -f ${remote} gh-pages`, dir);
rmSync(dir, { recursive: true, force: true });
console.log('\nDeployed. Live in about a minute at https://ninjatradercodes.github.io/Funscientia/');
