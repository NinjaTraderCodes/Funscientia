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
      // Mobile covers timeout recovery; desktop normally completes rounds 1/2 in real time.
      if (((mobile || quick) && round < 2) || (mobile && round === 2)) {
        await page.evaluate(() => { window.game.scene.getScene('Mouth').timeLeft = 0.05; });
      }
      if (round === 2 && mobile) break;
      let guard = 0;
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
        if (target) await tap(target.x, target.y);
        await page.waitForTimeout(280);
      }
      console.log(`${name} round ${round + 1}: ${JSON.stringify(await state())}`);
    }
    if (mobile) {
      await page.waitForFunction(() => window.game.scene.getScene('Mouth').phase === 'bread');
      await page.evaluate(() => { window.game.scene.getScene('Mouth').saliva = 10; });
      const bread = await page.evaluate(() => {
        const f = window.game.scene.getScene('Mouth').foods[6];
        return [f.img.x, f.img.y - f.img.displayHeight * 0.45];
      });
      await tap(...bread);
      assert.equal((await state()).phase, 'bread', 'dry bread cannot bypass moistening');
      await page.locator('.mh-spray').dispatchEvent('pointerdown');
      await tap(...bread);
    }
    await page.waitForFunction(() => window.game.scene.getScene('Mouth').phase === 'starch');
    await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('Mouth').foods.every((f) => !f.img.visible)), true, 'bread is replaced by the chain');
    const before = await state();
    await tap(544, 430);
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
    await tap(448, 430);
    assert.equal((await state()).maltose, 0, 'cannot split a maltose pair into singles');
    await tap(544, 430);
    assert.equal((await state()).maltose, 1, 'first cut creates one pair');
    if (mobile) {
      const points = await page.evaluate(() => {
        const c = window.game.scene.getScene('Mouth').cameras.main;
        const dpr = Math.min(devicePixelRatio, 2);
        return [385, 475].map((y) => ({ x: (736 - c.worldView.x) * c.zoom / dpr, y: (y - c.worldView.y) * c.zoom / dpr }));
      });
      const touch = await context.newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[1]] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    } else await page.keyboard.press('Space');
    assert.equal((await state()).maltose, 3, 'second cut creates the remaining two pairs');
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
  console.log('PASS: Mouth gameplay, recovery, tools, valid cuts, pause, localization, rewards, and chapter transition.');
} finally {
  await browser.close();
}
