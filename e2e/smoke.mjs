// End-to-end smoke test on an emulated iPhone: import, study writing/tone/reveal cards, add a word,
// search, settings, dark mode. Usage: node e2e/smoke.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3] ?? 'test-results';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });
const log = (...a) => console.log('•', ...a);
process.on('unhandledRejection', async (e) => { console.error(e); try { await shot('99-failure'); } catch {} process.exit(1); });

async function drawChar(charEl) {
  // between characters of a word the app waits for a tap
  if (await page.locator('.next-char-hint').isVisible().catch(() => false)) {
    await page.locator('.next-char-hint').click();
    await page.waitForTimeout(300);
  }
  const char = await charEl.getAttribute('data-char');
  const box = await charEl.boundingBox();
  const size = box.width;
  const data = await (await fetch(new URL(`data/strokes/${encodeURIComponent(char)}.json`, base))).json();
  const pad = Math.round(size * 0.05);
  const scale = (size - 2 * pad) / 1024;
  const toScreen = ([x, y]) => [box.x + pad + x * scale, box.y + size - (124 * scale + pad) - y * scale];
  for (const median of data.medians) {
    const pts = median.map(toScreen);
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  return char;
}

async function drawTone(tone) {
  const pad = page.locator('svg.tone-pad');
  const b = await pad.boundingBox();
  const P = (fx, fy) => [b.x + b.width * fx, b.y + b.height * fy];
  const paths = {
    1: [P(0.2, 0.5), P(0.5, 0.5), P(0.8, 0.5)],
    2: [P(0.2, 0.8), P(0.5, 0.5), P(0.8, 0.2)],
    3: [P(0.2, 0.3), P(0.5, 0.8), P(0.8, 0.3)],
    4: [P(0.2, 0.2), P(0.5, 0.5), P(0.8, 0.8)],
    5: [P(0.5, 0.5), P(0.505, 0.5)],
  }[tone];
  await page.mouse.move(...paths[0]);
  await page.mouse.down();
  for (const p of paths.slice(1)) await page.mouse.move(...p, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
}

await page.goto(base);
await page.getByText('Import my Skritter data').click();
await page.getByText('Import finished').waitFor({ timeout: 180000 });
await shot('01-import-report');
log('import:', (await page.locator('.menu-sheet p').first().textContent()).trim());
await page.getByRole('button', { name: 'OK' }).click();
await page.getByText('cards due now').waitFor();
await shot('02-home');
log('home:', (await page.locator('.hero-num').textContent()), 'due;', (await page.locator('.card p.small').first().textContent()));

// Session size is remembered (M1)
await page.getByLabel('More').click();
await page.waitForTimeout(400);
await page.reload();
await page.getByText('cards due now').waitFor();
log('session size after reload:', await page.locator('.stepper b').textContent());

await page.getByRole('button', { name: 'Study', exact: true }).first().click();
const counts = { write: 0, tone: 0, reveal: 0, intro: 0, trace: 0 };
for (let n = 0; n < 40; n++) {
  await page.waitForTimeout(250);
  if (await page.getByText('Session complete').isVisible().catch(() => false)) break;
  const label = (await page.locator('.part-label').textContent({ timeout: 5000 }).catch(() => '')) ?? '';
  if (label === 'New word') {
    counts.intro++;
    if (counts.intro === 1) await shot('04-intro');
    await page.getByRole('button', { name: 'Learn it' }).click();
  } else if (label.startsWith('Trace')) {
    counts.trace++;
    for (let guard = 0; guard < 6; guard++) {
      const w = page.locator('.writer[data-char]');
      if (!(await w.isVisible().catch(() => false))) break;
      if (!((await page.locator('.part-label').textContent().catch(() => '')) ?? '').startsWith('Trace')) break;
      if (await page.locator('.feedback.ok').isVisible().catch(() => false)) break;
      await page.waitForTimeout(300);
      await drawChar(w);
      await page.waitForTimeout(500);
    }
    if (counts.trace === 1) await shot('04b-trace');
    await page.waitForTimeout(900);
  } else if (label === 'Write') {
    counts.write++;
    if (counts.write === 2) {
      // wrong strokes: scribble in a corner until every stroke is drawn for us
      const b = await page.locator('.writer[data-char]').boundingBox();
      for (let k = 0; k < 120 && !(await page.locator('.grades').isVisible()); k++) {
        await page.mouse.move(b.x + 10, b.y + b.height - 10);
        await page.mouse.down();
        await page.mouse.move(b.x + 40, b.y + b.height - 12, { steps: 4 });
        await page.mouse.up();
        await page.waitForTimeout(120);
      }
      await shot('05b-writing-wrong');
      log('wrong-strokes card auto-grade:', await page.locator('.grades button.auto').textContent(), '|', await page.locator('.feedback').first().textContent());
      await page.locator('.grades button.auto').click();
      await page.waitForTimeout(300);
      continue;
    }
    for (let guard = 0; guard < 6 && !(await page.locator('.grades').isVisible()); guard++) {
      const w = page.locator('.writer[data-char]');
      await w.waitFor();
      await page.waitForTimeout(250);
      await drawChar(w);
      await page.waitForTimeout(450);
    }
    if (counts.write === 1) await shot('05-writing-done');
    const auto = await page.locator('.grades button.auto').textContent();
    if (counts.write === 1) log('first writing card auto-grade:', auto);
    await page.waitForTimeout(1300); // auto-advance on Got it
    if (await page.locator('.grades').isVisible()) await page.locator('.grades button.auto, .grades .g3').first().click();
    await page.waitForTimeout(700);
  } else if (label === 'Tone') {
    counts.tone++;
    // read the correct tones from the database via the word page data is hard; draw tone 4, then accept
    const syl = await page.locator('.tone-syllables .syl').count();
    for (let i = 0; i < syl; i++) await drawTone(4);
    if (counts.tone === 1) await shot('06-tone');
    await page.locator('.grades .g3').click();
    await page.waitForTimeout(700); // a changed grade is shown for 0.5 s
  } else if (label.startsWith('What does') || label.startsWith('How is')) {
    counts.reveal++;
    if (counts.reveal === 1) await shot('07a-reveal-before');
    // tap the card itself (not the button) to reveal
    await page.locator('.reveal-area.tap-card').click();
    if (counts.reveal === 1) await shot('07-reveal');
    await page.locator('.grades .g3').click();
    await page.waitForTimeout(700); // a changed grade is shown for 0.5 s
  } else {
    await shot('99-unknown');
    throw new Error('Unknown card: ' + label);
  }
}
log('cards seen:', JSON.stringify(counts));
await page.locator('.session-top .icon-btn').first().click();

// Add a word (M4)
await page.goto(base + '#/add');
await page.locator('input.han').fill('熊猫');
await page.waitForTimeout(1500);
log('add word autofill:', await page.locator('input[placeholder="zhun3bei4"]').inputValue(), '|', (await page.locator('textarea').first().inputValue()).slice(0, 40));
await shot('08-add-word');

// Search
await page.goto(base + '#/search?q=zhunbei');
await page.waitForTimeout(2500);
log('search zhunbei first result:', await page.locator('.list-item .han').first().textContent());
await page.goto(base + '#/search?q=dumpling');
await page.waitForTimeout(1500);
log('search dumpling first result:', await page.locator('.list-item .han').first().textContent());

// Stats + settings + dark mode
await page.goto(base + '#/stats');
await page.waitForTimeout(800);
await shot('09-stats');
await page.goto(base + '#/settings');
await page.getByRole('button', { name: 'Dark' }).click();
await page.waitForTimeout(300);
await shot('10-settings-dark');
await page.goto(base + '#/');
await page.waitForTimeout(800);
await shot('11-home-dark');
await page.getByRole('button', { name: 'Study', exact: true }).first().click();
await page.waitForTimeout(1500);
await shot('12-session-dark');

log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
