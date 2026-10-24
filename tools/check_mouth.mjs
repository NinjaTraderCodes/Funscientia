// Browser regression for the Mouth mission, including its required amylase task.
// Run with a dev server: node tools/check_mouth.mjs [http://localhost:5173/]
// Online saves are intercepted; this never changes the team's database.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5173/';
const quick = process.argv.includes('--quick');
const out = mkdtempSync(join(tmpdir(), 'funscientia-mouth-'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
console.log(`Screenshots: ${out}`);

async function play(lang, mobile) {
  const name = mobile ? 'phone-ar' : 'desktop-en';
  const viewport = mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 };
  const context = await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await context.route('https://rhttjhqssvzxvdcrkkrv.supabase.co/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: route.request().url().endsWith('create_save') ? '"TEST-2345"' : 'true',
  }));
  await context.addInitScript((lang) => {
    localStorage.setItem('funscientia.lang', lang);
    localStorage.setItem('funscientia.save.v1', JSON.stringify({ hero: 'nesma', playerName: '', discoveries: [], predictions: { saliva: 'wet' } }));
  }, lang);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${name}: ${r.status()} ${r.url()}`); });
  const state = () => page.evaluate(() => {
    const s = window.game.scene.getScene('Mouth');
    return { phase: s.phase, round: s.round, time: s.timeLeft, saliva: s.saliva, paused: s.paused, ...s.stats };
  });
  const shot = (label) => page.screenshot({ path: join(out, `${name}-${label}.png`) });
  const tap = async (x, y) => {
    const [sx, sy] = await page.evaluate(([x, y]) => {
      const c = window.game.scene.getScene('Mouth').cameras.main;
      const dpr = Math.min(devicePixelRatio, 2);
      return [(x - c.worldView.x) * c.zoom / dpr, (y - c.worldView.y) * c.zoom / dpr];
    }, [x, y]);
    if (mobile) await page.touchscreen.tap(sx, sy);
    else await page.mouse.click(sx, sy);
  };
  const talk = async () => {
    await page.waitForSelector('.dialogue:not([hidden])', { timeout: 30000 });
    for (let i = 0; i < 100 && await page.locator('.dialogue:not([hidden])').count(); i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(130);
    }
    assert.equal(await page.locator('.dialogue:not([hidden])').count(), 0, 'dialogue finishes');
  };
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.game?.scene.getScene('Overlook')?.party, null, { timeout: 60000 });
    await page.evaluate(() => {
      document.getElementById('start-screen').hidden = true;
      document.getElementById('loading-screen').hidden = true;
      document.getElementById('intro').hidden = true;
      window.game.scene.getScene('Overlook').scene.start('Mouth');
    });
    await talk();
    for (let round = 0; round < 3; round++) {
      await page.waitForFunction((r) => {
        const s = window.game.scene.getScene('Mouth');
        return s.round === r && s.phase === 'play';
      }, round, { timeout: 30000 });
      // Mobile covers an idle timeout; desktop always plays the full moistening round.
      if (((mobile || quick) && round < 2) || (mobile && round === 2)) {
        await page.evaluate(() => { window.game.scene.getScene('Mouth').timeLeft = 0.05; });
      }
      if (round === 2 && mobile) break;
      let guard = 0;
      let moistChews = 0;
      while ((await state()).phase === 'play') {
        assert.ok(guard++ < 160, 'round makes progress');
        const target = await page.evaluate(() => {
          const s = window.game.scene.getScene('Mouth');
          const f = s.foods.find((f) => f.state === 'up' && f.kind && (s.round !== 2 || f.kind.startsWith('bread')));
          if (!f) return null;
          if (s.tongueState !== 'home' && Math.hypot(s.tongue.x - f.img.x, s.tongue.y - (f.img.y - f.img.displayHeight * 0.5)) < 100) return null;
          return { x: f.img.x, y: f.img.y - f.img.displayHeight * 0.45 };
        });
        if (round === 2 && (await state()).saliva < 60) await page.keyboard.press('s');
        const beforeHit = await state();
        if (target) {
          await tap(target.x, target.y);
          const afterHit = await state();
          if (round === 2 && beforeHit.time > 1 && afterHit.chewed > beforeHit.chewed) {
            moistChews++;
            assert.equal(afterHit.phase, 'play', 'a moist bread hit must not interrupt the timed round');
            assert.equal(await page.locator('.mh-digest').isVisible(), false, 'starch task waits for the timer');
          }
        }
        await page.waitForTimeout(280);
      }
      if (round === 2) assert.ok(moistChews > 0, 'chewed moist bread during the full timed round');
      console.log(`${name} round ${round + 1}: ${JSON.stringify(await state())}`);
    }
    await page.waitForFunction(() => window.game.scene.getScene('Mouth').phase === 'bread');
    const sites = await page.evaluate(() => window.game.scene.getScene('Mouth').starchTask.chains.map((c) => ({ x: c.root.x, y: c.root.y })));
    const revealed = () => page.evaluate(() => window.game.scene.getScene('Mouth').starchTask.chains.filter((c) => c.revealed).length);
    assert.equal(sites.length, 5, 'separate task contains five breads');
    assert.equal(await revealed(), 0, 'starts with five unconverted breads');
    assert.equal((await state()).time, 0, 'moistening timer finished before the separate task');
    assert.equal(await page.locator('.mh-amylase').isVisible(), false, 'scissors stay hidden until all breads are revealed');
    assert.equal(await page.locator('.mh-spray').evaluate((el) => el.classList.contains('hidden')), true, 'moistening is complete');
    await shot('breads');
    await page.keyboard.press('p');
    await page.keyboard.press('Space');
    assert.equal((await state()).paused, true);
    assert.equal(await revealed(), 0, 'bread hits wait while paused');
    await page.click('.mh-paused .avatar-continue');
    for (const [i, index] of [3, 0, 4, 1, 2].entries()) {
      if (!mobile && i === 3) await page.keyboard.press('Space');
      else await tap(sites[index].x, sites[index].y);
      await page.waitForFunction((n) => window.game.scene.getScene('Mouth').starchTask.chains.filter((c) => c.revealed).length === n, i + 1, { timeout: 3000 });
      assert.equal(await revealed(), i + 1, 'each hit reveals exactly one persistent chain');
      if (i < 4) {
        assert.equal((await state()).phase, 'bread', 'all five breads are required before cutting');
        assert.equal(await page.locator('.mh-amylase').isVisible(), false);
        assert.match(await page.locator('.mh-digest strong').textContent(), new RegExp(`${i + 1}/5`));
      }
      if (i === 0) {
        const score = (await state()).score;
        await tap(sites[index].x, sites[index].y);
        await page.keyboard.press('2');
        assert.equal(await revealed(), 1, 'repeated hits cannot count the same bread twice');
        assert.equal((await state()).score, score, 'repeated hits do not award points');
        assert.equal((await state()).maltose, 0, 'cutting cannot start after just one bread');
        await page.waitForTimeout(350);
        await shot('first-chain');
      }
    }
    await page.waitForFunction(() => window.game.scene.getScene('Mouth').phase === 'starch');
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('Mouth').foods.every((f) => !f.img.visible)), true, 'ordinary foods are cleared from the separate task');
    assert.equal(await page.evaluate(() => window.game.scene.getScene('Mouth').starchTask.chains.every((c) => !c.bread.visible && c.molecule.visible)), true, 'all five breads become visible chains');
    assert.match(await page.locator('.mh-digest strong').textContent(), /0\/15/);
    const before = await state();
    await tap(sites[0].x - 66, sites[0].y);
    assert.equal((await state()).maltose, 0, 'must select scissors explicitly');
    await page.waitForTimeout(500);
    assert.equal((await state()).time, before.time, 'round timer freezes during the task');
    await shot('starch');
    await page.click('#lang-btn');
    assert.equal(await page.locator('html').getAttribute('lang'), lang === 'en' ? 'ar' : 'en');
    await page.click('#lang-btn');
    await page.evaluate(() => document.fonts.ready);
    await page.click('.mh-pause');
    await page.keyboard.press('2');
    assert.equal(await page.locator('.mh-amylase').getAttribute('aria-pressed'), 'false', 'tool selection waits while paused');
    await page.click('.mh-paused .avatar-continue');
    await page.click('.mh-amylase');
    await tap(sites[0].x - 132, sites[0].y);
    assert.equal((await state()).maltose, 0, 'cannot split a maltose pair into singles');
    await tap(sites[0].x - 66, sites[0].y);
    assert.equal((await state()).maltose, 1, 'first cut creates one pair');
    if (mobile) {
      const points = await page.evaluate((site) => {
        const c = window.game.scene.getScene('Mouth').cameras.main;
        const dpr = Math.min(devicePixelRatio, 2);
        return [site.y - 35, site.y + 35].map((y) => ({ x: (site.x + 66 - c.worldView.x) * c.zoom / dpr, y: (y - c.worldView.y) * c.zoom / dpr }));
      }, sites[0]);
      const touch = await context.newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[1]] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    } else await page.keyboard.press('Space');
    assert.equal((await state()).maltose, 3, 'second cut creates the remaining two pairs');
    const score = (await state()).score;
    await tap(sites[0].x - 66, sites[0].y);
    assert.equal((await state()).score, score, 'completed chains cannot award points again');
    for (let i = 1; i < 5; i++) {
      if (mobile) await tap(sites[i].x - 66, sites[i].y);
      else await page.keyboard.press('Space');
      if (i === 4) {
        assert.equal((await state()).maltose, 13);
        await page.waitForTimeout(1700);
        assert.equal((await state()).phase, 'starch', 'swallowing waits for the last chain to be fully cut');
      }
      if (mobile) await tap(sites[i].x + 66, sites[i].y);
      else await page.keyboard.press('Space');
      assert.equal((await state()).maltose, (i + 1) * 3);
    }
    assert.match(await page.locator('.mh-digest strong').textContent(), /15\/15/);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('Mouth').starchTask.chains.every((c) => c.pairs.every((p) => p.complete && p.product.visible))), true, 'all five chains yield fifteen maltose pairs');
    await page.waitForTimeout(450);
    await shot('maltose');
    await page.waitForFunction(() => window.game.scene.getScene('Mouth').phase === 'swallow', null, { timeout: 15000 });
    await page.keyboard.press('Space');
    await talk();
    await page.waitForSelector('.mh-results');
    await shot('results');
    await page.click('.mh-results .avatar-continue');
    await talk();
    await page.waitForFunction(() => window.game.scene.isActive('Chapter'), null, { timeout: 20000 });
    await page.waitForTimeout(1700);
    const chapter = await page.evaluate(() => window.game.scene.getScene('Chapter').children.list.find((c) => c.type === 'Image')?.texture.key);
    assert.equal(chapter, 'chapter_esophagus', 'finishes on the illustrated esophagus card');
    await shot('chapter');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('funscientia.save.v1')));
    assert.ok(save.discoveries.includes('saliva_amylase'), 'learning discovery is saved');
    console.log(`${name}: PASS; ${JSON.stringify(await state())}`);
  } finally {
    await context.close();
  }
}

try {
  await Promise.all([play('en', false), play('ar', true)]);
  assert.deepEqual(errors, [], 'no page exceptions or missing assets');
  console.log('PASS: Full moistening round, five bread reveals, all five chains, tools, valid cuts, pause, localization, rewards, and chapter transition.');
} finally {
  await browser.close();
}
