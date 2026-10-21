// Record a gameplay demo: hero page -> end of the intro -> overlook -> Choose Your Avatar ->
// the two shots of the road -> enter the Mouth. Plays like a person: reads each dialogue line,
// taps the ground to walk, types a name, answers the prediction, and stands still once so the
// fennec can sniff about.
// Frames come from the browser's screencast (JPEG + timestamps); tools/encode_demo turns them into an MP4.
//
// Usage: node tools/record_demo.mjs [url] [outDir] [avatar walid|nesma|fox] [name]
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || '.tools/work/demo';
const avatar = process.argv[4] || 'walid';
const playerName = process.argv[5] ?? 'Adam';
const W = 1280, H = 720, DPR = 1.5; // 1920x1080 frames
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'frames'), { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => document.getElementById('hero-video').currentTime > 0.3 && window.game?.scene.getScene('Overlook')?.party, null, { timeout: 90000 });

// ---- recording -------------------------------------------------------------
const cdp = await page.context().newCDPSession(page);
const index = [];
let n = 0;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = `f_${String(n++).padStart(6, '0')}.jpg`;
  writeFileSync(join(out, 'frames', file), Buffer.from(data, 'base64'));
  index.push({ file, t: metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* closing */ }
});

// ---- helpers -----------------------------------------------------------------
const scene = (k) => page.evaluate((k) => window.game.scene.isActive(k), k);
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const dialogueOpen = () => page.evaluate(() => { const d = document.querySelector('.dialogue:not([hidden])'); return !!d; });

/** Read every line like a child would, then continue; answer choices with `pick`. */
async function readDialogue(pick = 0) {
  for (let i = 0; i < 2000; i++) { // steps include waiting for the typewriter, so long talks need many
    const st = await page.evaluate(() => {
      const d = document.querySelector('.dialogue:not([hidden])');
      if (!d) return null;
      return { text: d.querySelector('.dlg-text').textContent, done: !d.querySelector('.dlg-more').hidden, choices: d.querySelectorAll('.dlg-choice').length };
    });
    if (!st) return;
    if (st.choices) {
      await wait(2600); // think about the question
      await page.hover(`.dlg-choice >> nth=${pick}`);
      await wait(700);
      await page.click(`.dlg-choice >> nth=${pick}`);
      await wait(400);
      continue;
    }
    if (!st.done) { await wait(120); continue; } // let the typewriter finish
    await wait(1100 + st.text.length * 38); // reading time
    console.log('  •', st.text);
    await page.keyboard.press('Enter');
    await wait(250);
  }
}

/** Tap a world point (game coordinates) as a player would. */
async function tap(sceneKey, x, y) {
  const [sx, sy] = await page.evaluate(([k, x, y]) => {
    const c = window.game.scene.getScene(k).cameras.main;
    const d = Math.min(devicePixelRatio, 2);
    return [(x - c.worldView.x) * c.zoom / d, (y - c.worldView.y) * c.zoom / d];
  }, [sceneKey, x, y]);
  await page.mouse.move(sx, sy, { steps: 8 });
  await page.mouse.click(sx, sy);
}
const leaderStopped = (k) => until((k) => { const s = window.game.scene.getScene(k); return s.party && !s.party.leader.isMoving; }, k);

// ---- the run ---------------------------------------------------------------------
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
console.log('recording: hero page');
await wait(3200);
await page.hover('#start-btn'); await wait(900);
await page.click('#start-btn');
await page.evaluate(() => { const s = document.getElementById('skip-btn'); s.style.display = 'none'; });
await until(() => document.getElementById('intro').currentTime > 0.2);
// the intro's last stretch: the garden of roses, the kids' "wow", then the cut to the overlook
await page.evaluate(() => { document.getElementById('intro').currentTime = 64.8; });
console.log('intro tail');

await until(() => document.querySelector('.dialogue:not([hidden])'));
console.log('overlook exchange');
await readDialogue();

await page.waitForSelector('.avatar-select');
await wait(1600);
for (const a of ['fox', 'nesma', 'walid']) { await page.hover(`.avatar-card[data-avatar="${a}"]`); await wait(600); }
await page.click(`.avatar-card[data-avatar="${avatar}"]`); await wait(700);
if (playerName) {
  await page.click('.avatar-name input'); await wait(300);
  await page.keyboard.type(playerName, { delay: 160 }); await wait(700);
}
await page.hover('.avatar-continue'); await wait(500);
await page.click('.avatar-continue');
console.log(`chose ${avatar}${playerName ? ` named ${playerName}` : ''}`);
await until(() => window.game.scene.getScene('Overlook').phase === 'play');
await wait(2600); // let the hint show

await tap('Overlook', 598, 428);
await until(() => window.game.scene.isActive('World') && window.game.scene.getScene('World').party);
const hotspots = () => page.evaluate(() => Object.fromEntries(window.game.scene.getScene('World').place.hotspots.map((h) => [h.name, [h.x, h.y]])));

// shot 1: the road to the bend
console.log('road');
await until(() => document.querySelector('.dialogue:not([hidden])'));
await readDialogue();
await wait(1200);
let spots = await hotspots();
await tap('World', 900, 820); await leaderStopped('World'); await wait(400);
await tap('World', ...spots.signpost);
await until(() => document.querySelector('.dialogue:not([hidden])'));
console.log('signpost');
await readDialogue();
await wait(1200);
await tap('World', ...spots.bend);

// shot 2: after the bend, up to the Mouth Gate
await until(() => { const s = window.game.scene.getScene('World'); return s.placeName === 'road2' && s.party && s.phase !== 'cutting'; });
console.log('road, after the bend');
await until(() => document.querySelector('.dialogue:not([hidden])'));
await readDialogue();
await wait(7500); // stand about for a moment: the fennec sniffs around or sits down
spots = await hotspots();
for (const leg of [{ spot: 'fox_bush' }, { spot: 'gate', pick: 1 }]) {
  await tap('World', ...spots[leg.spot]);
  await until(() => document.querySelector('.dialogue:not([hidden])'));
  console.log(leg.spot);
  await readDialogue(leg.pick ?? 0);
  await wait(leg.spot === 'fox_bush' ? 4200 : 1500); // let the discovery card be read
}

await until(() => window.game.scene.isActive('Chapter'));
await wait(3800); // "Chapter 1 · Mouth Mission"
await cdp.send('Page.stopScreencast');
await wait(500);
writeFileSync(join(out, 'index.json'), JSON.stringify(index));
console.log(`captured ${index.length} frames over ${(index.at(-1).t - index[0].t).toFixed(1)} s`);
await browser.close();
