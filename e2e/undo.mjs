// End-to-end check of multi-character writing: tap between characters, Undo inside a word,
// a changed grade shown for 0.5 s, and Undo back to a completed card with its grade.
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
page.on('pageerror', (e) => errors.push(String(e)));
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
await page.goto(base + '#/session?new=5');

// Go through cards until a writing review of a word with 2+ characters.
let found = false;
for (let n = 0; n < 60 && !found; n++) {
  await page.waitForTimeout(300);
  if (await page.getByText('Session complete').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Add 5 new words now' }).click();
    continue;
  }
  const label = (await page.locator('.part-label').textContent({ timeout: 5000 }).catch(() => '')) ?? '';
  if (label === 'New word') await page.getByRole('button', { name: 'Learn it' }).click();
  else if (label.startsWith('Trace') || label === 'Write') {
    const slots = await page.locator('.word-row .slot').count();
    if (label === 'Write' && slots >= 2) {
      found = true;
      break;
    }
    for (let g = 0; g < 6 && !(await page.locator('.grades').isVisible()); g++) {
      if (!((await page.locator('.part-label').textContent().catch(() => '')) ?? '').match(/Trace|Write/)) break;
      if (await page.locator('.next-char-hint').isVisible()) await page.locator('.next-char-hint').click();
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

// 1. no auto-advance after the first character
await drawCurrentChar();
await shot('u0-after-first');
check(await page.locator('.next-char-hint').isVisible(), 'after the 1st character: "tap to move to the next character" shown');
await page.waitForTimeout(1500);
check(await page.locator('.next-char-hint').isVisible(), 'still waiting after 1.5 s (no auto-advance)');
await shot('u1-tap-to-continue');
await page.locator('.canvas-wrap').click(); // tapping the drawing area moves on too
await page.waitForTimeout(300);
check((await currentSlot()) === 1, 'tapping the drawing area moved to the 2nd character');

// 3b. Undo on the 2nd character goes back to the 1st character of the same word
await page.getByRole('button', { name: 'Undo / back' }).click();
await page.waitForTimeout(400);
check((await currentSlot()) === 0, 'Undo on the 2nd character → back to the 1st character');
check(await page.locator('.part-label').textContent() === 'Write', 'still on the same card');

// write the whole word
for (let c = 0; c < nChars; c++) {
  await drawCurrentChar();
  if (c < nChars - 1) {
    await page.locator('.next-char-hint').click();
    await page.waitForTimeout(300);
  }
}
await page.locator('.grades').waitFor();
const autoLabel = (await page.locator('.grades button.auto').textContent()).replace(/\d.*$/, '');
const pick = autoLabel.startsWith('So-so') ? 'Forgot' : 'So-so';
const before = await page.locator('.word-row').textContent();

// 2. a changed grade is shown for 0.5 s before moving on
await page.locator('.grades button', { hasText: pick }).click();
await page.waitForTimeout(200);
const hl = await page.locator('.grades button.auto').textContent().catch(() => '');
check(hl.startsWith(pick), `changed grade (${autoLabel} → ${pick}) is highlighted`);
check(await page.locator('.grades').isVisible(), 'still visible 0.2 s after the tap');
await shot('u2-changed-grade');
await page.waitForTimeout(900);
check((await page.locator('.word-row').textContent().catch(() => '')) !== before || !(await page.locator('.grades').isVisible()), 'moved on after ~0.5 s');

// 3a. Undo → back to that card, completed, with the chosen grade visible
await page.getByRole('button', { name: 'Undo / back' }).click();
await page.waitForTimeout(1200);
check(await page.locator('.grades').isVisible(), 'Undo → previous card shown completed (grade buttons visible)');
const restoredHl = await page.locator('.grades button.auto').textContent().catch(() => '');
check(restoredHl.startsWith(pick), `the chosen grade (${pick}) is shown`);
check((await page.locator('.word-row').textContent()) === before, 'all characters shown');
await shot('u3-restored');
await page.waitForTimeout(1500);
check(await page.locator('.grades').isVisible(), 'restored card does not auto-advance');

// Undo again on a completed multi-character word → reopen its last character
await page.getByRole('button', { name: 'Undo / back' }).click();
await page.waitForTimeout(500);
check(!(await page.locator('.grades').isVisible()) && (await currentSlot()) === nChars - 1, 'Undo again → last character reopened');

check(errors.length === 0, `no page errors ${errors.join(' ')}`);
await browser.close();
