// End-to-end check of multi-character writing: each character is graded and the word gets the
// worst grade, Undo inside a word, a changed grade shown for 0.5 s, and Undo back to a completed
// card with its grade.
// Usage: node e2e/undo.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3] ?? 'test-results';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => { const m = `${e.name}: ${e.message} @ ${e.stack}`; errors.push(m); console.log('  PAGE ERROR', m); });
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });
const check = (ok, msg) => {
  console.log(ok ? '✓' : '✗', msg);
  if (!ok) process.exitCode = 1;
};
const currentSlot = () => page.locator('.word-row .slot').evaluateAll((els) => els.findIndex((e) => e.classList.contains('current')));

async function drawCurrentChar() {
  const w = page.locator('.writer[data-char]');
  await w.waitFor();
  await page.waitForTimeout(250);
  const char = await w.getAttribute('data-char');
  const box = await w.boundingBox();
  const data = await (await fetch(new URL(`data/strokes/${encodeURIComponent(char)}.json`, base))).json();
  const pad = Math.round(box.width * 0.05);
  const sc = (box.width - 2 * pad) / 1024;
  const T = ([x, y]) => [box.x + pad + x * sc, box.y + box.width - (124 * sc + pad) - y * sc];
  for (const m of data.medians) {
    const pts = m.map(T);
    await page.mouse.move(...pts[0]);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...p, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400);
}

await page.goto(base);
await page.getByText('Import my Skritter data').click();
await page.getByText('Import finished').waitFor({ timeout: 180000 });
await page.getByRole('button', { name: 'OK' }).click();
await page.waitForTimeout(500);
await page.goto(base + '#/learn');

// Go through cards until a writing review of a word with 2+ characters.
let found = false;
for (let n = 0; n < 60 && !found; n++) {
  await page.waitForTimeout(300);
  const label = (await page.locator('.part-label').textContent({ timeout: 5000 }).catch(() => '')) ?? '';
  if (process.env.DEBUG) console.log('  card:', label, await page.locator('.word-row').textContent().catch(() => ''));
  if (label === 'New word') await page.getByRole('button', { name: 'Learn it' }).click();
  else if (label.startsWith('Trace') || label === 'Write') {
    const slots = await page.locator('.word-row .slot').count();
    if (label === 'Write' && slots >= 2) {
      found = true;
      break;
    }
    for (let g = 0; g < 6 && !(await page.locator('.grades').isVisible()); g++) {
      if (!((await page.locator('.part-label').textContent().catch(() => '')) ?? '').match(/Trace|Write/)) break;
      if (await page.locator('.tap-anywhere').isVisible()) {
        await page.waitForTimeout(500);
        await page.mouse.click(195, 600);
      }
      else if (await page.locator('.feedback.ok').isVisible()) break;
      else await drawCurrentChar();
    }
    if (await page.locator('.grades').isVisible()) {
      await page.locator('.grades button.auto').click();
      await page.waitForTimeout(1200);
    } else await page.waitForTimeout(900);
  } else if (label === 'Tone') {
    await page.locator('.grades').waitFor({ state: 'detached', timeout: 100 }).catch(() => {});
    const b = await page.locator('svg.tone-pad').boundingBox();
    const syl = await page.locator('.tone-syllables .syl').count();
    for (let i = 0; i < syl; i++) {
      await page.mouse.move(b.x + 40, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width - 40, b.y + b.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    }
    await page.locator('.grades button.auto').click();
    await page.waitForTimeout(1200);
  } else if (label.startsWith('What does') || label.startsWith('How is')) {
    await page.locator('.reveal-area.tap-card').click();
    await page.locator('.grades .g3').click();
    await page.waitForTimeout(800);
  }
}
check(found, 'found a multi-character writing card');
if (!found) process.exit(1);
const nChars = await page.locator('.word-row .slot').count();
console.log('  word has', nChars, 'characters');

const lastReviewGrade = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const open = indexedDB.open('mattoskritter');
        open.onsuccess = () => {
          const cur = open.result.transaction('reviews').objectStore('reviews').openCursor(null, 'prev');
          cur.onsuccess = () => res(cur.result ? cur.result.value.grade : null);
        };
      }),
  );
const slotClass = (i) => page.locator('.word-row .slot').nth(i).getAttribute('class');
const hasIntervals = async () => (await page.locator('.grades button small').count()) > 0;

// 1. the first character gets its own grade bar, without intervals (not the word's grade yet)
await drawCurrentChar();
await page.locator('.grades').waitFor();
await shot('u0-first-char-graded');
check((await page.locator('.feedback').textContent()).includes(`(1/${nChars})`), 'grade bar for character 1');
check(!(await hasIntervals()), 'no intervals on a character that is not the last');
check((await page.locator('.grades button.auto').textContent()).startsWith('Got it'), 'well-written character suggested Got it');
await page.locator('.grades .g2').click(); // So-so
await page.waitForTimeout(900);
check((await currentSlot()) === 1, 'after grading, on to character 2');
check((await slotClass(0)).includes('g2'), 'character 1 coloured with its grade (So-so)');

// 2. Undo on the 2nd character → back to the 1st character's grade, shown written
await page.getByRole('button', { name: 'Undo / back' }).click();
await page.waitForTimeout(600);
check(await page.locator('.grades').isVisible(), 'Undo on character 2 → character 1 graded again');
check((await page.locator('.grades button.auto').textContent()).startsWith('So-so'), 'its grade (So-so) is shown');
await page.waitForTimeout(1300);
check(await page.locator('.grades').isVisible(), 'no auto-advance when coming back');
// Undo again → rewrite character 1
await page.getByRole('button', { name: 'Undo / back' }).click();
await page.waitForTimeout(400);
check(!(await page.locator('.grades').isVisible()) && (await currentSlot()) === 0, 'Undo again → character 1 cleared to write again');

// 3. write the word: So-so on character 1, Got it on the rest → the word gets So-so
for (let c = 0; c < nChars; c++) {
  await drawCurrentChar();
  await page.locator('.grades').waitFor();
  if (c < nChars - 1) {
    await page.locator(c === 0 ? '.grades .g2' : '.grades .g3').click();
    await page.waitForTimeout(800);
  }
}
check(await hasIntervals(), 'the last character shows the word intervals');
const soso = await page.locator('.grades .g2 small').textContent();
const gotit = await page.locator('.grades .g3 small').textContent();
const easy = await page.locator('.grades .g4 small').textContent();
check(soso === gotit && gotit === easy, `Got it / Too easy show the So-so interval, capped by character 1 (${soso}, ${gotit}, ${easy})`);
await shot('u1-last-char');
const before = await page.locator('.word-row').textContent();

// 4. a changed grade is shown for 0.5 s before moving on
const pick = 'Too easy';
await page.locator('.grades button', { hasText: pick }).click();
await page.waitForTimeout(200);
check((await page.locator('.grades button.auto').textContent().catch(() => '')).startsWith(pick), `changed grade (${pick}) is highlighted`);
await page.waitForTimeout(900);
check(!(await page.locator('.grades').isVisible()) || (await page.locator('.word-row').textContent().catch(() => '')) !== before, 'moved on after ~0.5 s');
check((await lastReviewGrade()) === 2, 'the word was graded So-so, its worst character');

// 5. Undo → back to that card, completed, with the last character's grade
await page.getByRole('button', { name: 'Undo / back' }).click();
await page.waitForTimeout(1200);
check(await page.locator('.grades').isVisible(), 'Undo → previous card shown completed (grade buttons visible)');
check((await page.locator('.grades button.auto').textContent().catch(() => '')).startsWith(pick), `the last character's grade (${pick}) is shown`);
check((await page.locator('.word-row').textContent()) === before, 'all characters shown');
check((await slotClass(0)).includes('g2'), 'character 1 still coloured So-so');
await shot('u3-restored');
await page.waitForTimeout(1500);
check(await page.locator('.grades').isVisible(), 'restored card does not auto-advance');

// Undo again → reopen the last character
await page.getByRole('button', { name: 'Undo / back' }).click();
await page.waitForTimeout(500);
check(!(await page.locator('.grades').isVisible()) && (await currentSlot()) === nChars - 1, 'Undo again → last character reopened');

check(errors.length === 0, `no page errors ${errors.join(' ')}`);
await browser.close();
