// Stomach regression: five proteins, pepsin selection, four-unit pieces, and the full mission handoff.
// Run against a dev server: npm run test:stomach -- http://localhost:5173/ [--quick]
// Online saves are intercepted; tests never write to the team's database.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5173/';
const quick = process.argv.includes('--quick');
const small = process.argv.includes('--small');
const out = mkdtempSync(join(tmpdir(), 'funscientia-stomach-'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
console.log(`Screenshots: ${out}`);

async function play(lang, mobile) {
  const name = mobile ? 'phone-ar' : 'desktop-en';
  const viewport = mobile ? small ? { width: 740, height: 360 } : { width: 844, height: 390 } : { width: 1280, height: 720 };
  const context = await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await context.route('https://rhttjhqssvzxvdcrkkrv.supabase.co/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: route.request().url().endsWith('create_save') ? '"TEST-2345"' : 'true',
  }));
  await context.addInitScript((lang) => {
    localStorage.setItem('funscientia.lang', lang);
    localStorage.setItem('funscientia.save.v1', JSON.stringify({ hero: 'nesma', playerName: '', discoveries: [], predictions: { pepsin: 'starch' } }));
  }, lang);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${name}: ${r.status()} ${r.url()}`); });
  const shot = (label) => page.screenshot({ path: join(out, `${name}-${label}.png`) });
  const state = () => page.evaluate(() => {
    const s = window.game.scene.getScene('Stomach');
    return { phase: s.phase, round: s.round, time: s.timeLeft, acid: s.acid, paused: s.paused, selected: s.pepsinSelected, spawned: s.spawned, squirts: s.squirts, ...s.stats };
  });
  const screenPoint = (x, y) => page.evaluate(([x, y]) => {
    const c = window.game.scene.getScene('Stomach').cameras.main;
    const dpr = Math.min(devicePixelRatio, 2);
    return { x: (x - c.worldView.x) * c.zoom / dpr, y: (y - c.worldView.y) * c.zoom / dpr };
  }, [x, y]);
  const tap = async (x, y) => {
    const p = await screenPoint(x, y);
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(50);
  };
  const proteinPoint = (bond = 3, peptide = false) => page.evaluate(({ bond, peptide }) => {
    const s = window.game.scene.getScene('Stomach');
    const c = s.chains.find((c) => !c.gone && !c.falling && (peptide ? c.peptide >= 0 : c.peptide < 0) && c.pts.length > bond + 1);
    if (!c) return null;
    return { x: (c.pts[bond].x + c.pts[bond + 1].x) / 2, y: (c.pts[bond].y + c.pts[bond + 1].y) / 2 };
  }, { bond, peptide });
  const maintainAcid = async () => {
    for (let i = 0; i < 8 && (await state()).acid < 0.74; i++) await page.keyboard.press('a');
  };
  const talk = async () => {
    await page.waitForSelector('.dialogue:not([hidden])', { timeout: 30000 });
    for (let i = 0; i < 110 && await page.locator('.dialogue:not([hidden])').count(); i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(130);
    }
    assert.equal(await page.locator('.dialogue:not([hidden])').count(), 0, 'dialogue finishes');
  };
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.game?.scene.getScene('Overlook')?.party, null, { timeout: 60000 });
    await page.evaluate(() => {
      for (const id of ['start-screen', 'loading-screen', 'intro']) document.getElementById(id).hidden = true;
      window.game.scene.getScene('Overlook').scene.start('Stomach');
    });
    if (quick) {
      await page.waitForFunction(() => window.game.scene.getScene('Stomach').hud);
      await page.evaluate(() => { window.game.scene.getScene('Stomach').hud.banner = async () => {}; });
    }
    await talk();
    for (let round = 0; round < 2; round++) {
      await page.waitForFunction((r) => {
        const s = window.game.scene.getScene('Stomach');
        return s.round === r && s.phase === 'play';
      }, round, { timeout: 30000 });
      if (mobile || quick) await page.evaluate(() => { window.game.scene.getScene('Stomach').timeLeft = 0.05; });
      let guard = 0;
      while (await page.evaluate((r) => {
        const s = window.game.scene.getScene('Stomach');
        return s.round === r && s.phase === 'play';
      }, round)) {
        assert.ok(guard++ < 250, 'churning/acidity round advances');
        if (round === 1) await maintainAcid();
        await page.keyboard.press('Space');
        await page.waitForTimeout(180);
      }
    }
    if (!mobile && !quick) {
      assert.ok((await state()).churned > 0, 'mechanical digestion still works');
      assert.ok((await state()).germs > 0, 'acidity still stops germs');
    }
    await page.waitForFunction(() => {
      const s = window.game.scene.getScene('Stomach');
      return s.round === 2 && s.phase === 'play' && s.chains.filter((c) => !c.gone && !c.falling && c.peptide < 0).length === 2;
    }, null, { timeout: 30000 });
    assert.equal((await state()).selected, false, 'scissors require explicit selection');
    assert.equal(await page.locator('.sh-pepsin').isVisible(), true);
    await page.waitForTimeout(2200);
    assert.equal((await state()).spawned, 2, 'at most two proteins on screen at once');
    assert.deepEqual(await page.evaluate(() => window.game.scene.getScene('Stomach').chains.map((c) => c.beads.length)), [8, 8]);
    assert.deepEqual(await page.evaluate(() => window.game.scene.getScene('Stomach').molecules.map((m) => m.kind).sort()), ['fat', 'maltose']);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('Stomach').germs.length), 0, 'the previous acid lesson is cleared before protein cutting');
    await shot('proteins');
    let p = await proteinPoint();
    await tap(p.x, p.y);
    await page.keyboard.press('Space');
    assert.equal((await state()).cuts, 0, 'cannot cut before selecting pepsin');
    await page.keyboard.press('p');
    await page.waitForFunction(() => window.game.scene.getScene('Stomach').paused);
    await page.keyboard.press('2');
    await page.keyboard.press('Space');
    assert.equal((await state()).paused, true);
    assert.equal((await state()).selected, false, 'selection is blocked while paused');
    assert.equal((await state()).cuts, 0, 'cuts are blocked while paused');
    await page.click('.mh-paused .avatar-continue');
    if (mobile) await page.locator('.sh-pepsin').tap();
    else await page.click('.sh-pepsin');
    assert.equal((await state()).selected, true);
    await page.evaluate(() => { window.game.scene.getScene('Stomach').acid = 0.3; });
    p = await proteinPoint();
    await tap(p.x, p.y);
    assert.equal((await state()).cuts, 0, 'pepsin cannot cut with the wrong acidity');
    await maintainAcid();
    p = await proteinPoint(0);
    await tap(p.x, p.y);
    assert.equal((await state()).cuts, 0, 'other bonds cannot produce one- or three-unit fragments');
    for (const kind of ['maltose', 'fat']) {
      const molecule = await page.evaluate((kind) => {
        const m = window.game.scene.getScene('Stomach').molecules.find((m) => m.kind === kind);
        return { x: m.img.x, y: m.img.y, texture: m.img.texture.key };
      }, kind);
      await tap(molecule.x, molecule.y);
      assert.equal((await state()).cuts, 0, `pepsin cannot cut ${kind}`);
      assert.equal(await page.evaluate((kind) => window.game.scene.getScene('Stomach').molecules.find((m) => m.kind === kind).gone, kind), false);
      await page.waitForTimeout(300);
    }
    if (mobile) {
      await page.evaluate(() => { window.game.scene.getScene('Stomach').timeLeft = 0.05; });
      await page.waitForTimeout(350);
      assert.equal((await state()).time, 0);
      assert.equal((await state()).round, 2, 'deadline cannot skip an unfinished mission');
      assert.equal((await state()).phase, 'play');
    }
    await maintainAcid();
    p = await proteinPoint();
    await tap(p.x, p.y);
    assert.equal((await state()).cuts, 1);
    assert.equal((await state()).polypeptides, 2);
    if (mobile) assert.equal(await page.evaluate(() => window.game.scene.getScene('Stomach').scissors.visible), false, 'touch release leaves the four-unit pieces unobstructed');
    assert.deepEqual(await page.evaluate(() => window.game.scene.getScene('Stomach').chains.filter((c) => !c.gone && c.peptide >= 0).map((c) => c.beads.length)), [4, 4]);
    p = await proteinPoint(1, true);
    await tap(p.x, p.y);
    assert.equal((await state()).cuts, 1, 'four-unit products cannot be cut again');
    // Pause the short product display while the browser loads the other language's font.
    await page.keyboard.press('p');
    await page.waitForFunction(() => window.game.scene.getScene('Stomach').paused);
    await page.click('#lang-btn');
    await page.evaluate(() => document.fonts.ready);
    const labels = await page.evaluate(() => window.game.scene.getScene('Stomach').chains.filter((c) => !c.gone && c.label).map((c) => c.label.text));
    assert.ok(labels.length === 2 && labels.every((label) => label === (lang === 'en' ? 'متعدد البيبتيد' : 'Polypeptide')), 'piece labels follow live language changes');
    await page.click('#lang-btn');
    await page.evaluate(() => document.fonts.ready);
    await page.click('.mh-paused .avatar-continue');
    await page.waitForTimeout(300);
    await shot('four-plus-four');
    while ((await state()).cuts < 5) {
      await page.waitForFunction(() => window.game.scene.getScene('Stomach').chains.some((c) => !c.gone && !c.falling && c.peptide < 0 && c.pts.length === 8), null, { timeout: 10000 });
      await maintainAcid();
      const before = (await state()).cuts;
      if (before === 4) {
        await page.evaluate(() => { window.game.scene.getScene('Stomach').timeLeft = 0.05; });
        await page.waitForTimeout(350);
        assert.equal((await state()).round, 2, 'all five proteins are required before chyme');
        assert.equal((await state()).phase, 'play');
        await maintainAcid();
      }
      if (mobile) {
        p = await proteinPoint();
        if (before === 1) {
          const from = await screenPoint(p.x, p.y - 45);
          const to = await screenPoint(p.x, p.y + 45);
          const touch = await context.newCDPSession(page);
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await touch.detach();
        } else await tap(p.x, p.y);
      } else {
        await page.keyboard.press('2');
        await page.keyboard.press('Space');
      }
      await page.waitForFunction((cuts) => window.game.scene.getScene('Stomach').stats.cuts === cuts, before + 1, { timeout: 3000 });
      assert.equal((await state()).polypeptides, (before + 1) * 2);
      assert.equal(await page.evaluate(() => window.game.scene.getScene('Stomach').chains.every((c) => c.gone || c.beads.length === (c.peptide >= 0 ? 4 : 8))), true);
    }
    assert.equal((await state()).spawned, 5, 'all five proteins arrive despite unchanged maltose and fat');
    assert.equal(await page.locator('.sh-pepsin').isDisabled(), true);
    await page.keyboard.press('Space');
    assert.equal((await state()).cuts, 5, 'completion cannot award extra cuts');
    await page.waitForTimeout(750);
    assert.equal((await state()).round, 2, 'final four-unit pieces remain visible before advancing');
    await shot('complete');
    await page.waitForFunction(() => {
      const s = window.game.scene.getScene('Stomach');
      return s.round === 3 && s.phase === 'play';
    }, null, { timeout: 20000 });
    assert.equal(await page.locator('.sh-task').isVisible(), false);
    assert.equal(await page.locator('.sh-pepsin').isVisible(), false);
    await page.evaluate(() => {
      const s = window.game.scene.getScene('Stomach');
      window.exitTrace = [];
      const key = s.onKey;
      s.onKey = function (e) { window.exitTrace.push(['key', e.type, e.key, e.timeStamp, this.pressure, this.squirts, document.activeElement?.className]); key.call(this, e); };
      const down = s.onDown;
      s.onDown = function (p) { window.exitTrace.push(['pointer', p.event?.type, this.pressure, this.squirts]); down.call(this, p); };
      const squirt = s.squirt;
      s.squirt = function () { window.exitTrace.push(['squirt', this.pressure, this.squirts]); squirt.call(this); };
    });
    // Follow the actual successful squirts: under load an input can miss a short green window.
    // Each attempt waits for a fresh window, just as a player would after a missed tap.
    for (let attempt = 0; (await state()).squirts < 5; attempt++) {
      assert.ok(attempt < 14, 'five chyme squirts complete within the round');
      await page.waitForFunction(() => {
        const s = window.game.scene.getScene('Stomach');
        return s.phase === 'play' && s.pressure >= 0.78 && s.pressure <= 1.0;
      }, null, { timeout: 4000 });
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
    }
    await page.waitForSelector('.mh-results', { timeout: 8000 });
    assert.equal((await state()).polypeptides, 10);
    assert.match(await page.locator('.mh-results-card ul').textContent(), /10/);
    await shot('results');
    await page.click('.mh-results .avatar-continue');
    await talk();
    await page.waitForFunction(() => window.game.scene.isActive('Chapter'), null, { timeout: 20000 });
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('funscientia.save.v1')));
    assert.ok(save.discoveries.includes('pepsin_protein') && save.discoveries.includes('enzyme_specific'), 'discoveries are saved');
    await page.click('#lang-btn');
    await page.waitForTimeout(300);
    console.log(`${name}: PASS; ${JSON.stringify(await state())}`);
  } catch (error) {
    await shot('failure');
    console.error(`${name}: ${JSON.stringify(await state())}`);
    console.error(await page.evaluate(() => window.exitTrace));
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await Promise.all([play('en', false), play('ar', true)]);
  assert.deepEqual(errors, [], 'no page exceptions or missing assets');
  console.log('PASS: Churn, acidity, five proteins, pepsin selection, four-unit products, unchanged maltose/fat, overtime, pause, language changes, chyme, rewards and chapter handoff.');
} finally {
  await browser.close();
}
