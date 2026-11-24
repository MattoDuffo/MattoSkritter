// Forgot cards are repeated: after the round, the failed cards come back shuffled in a "Redo"
// round, again and again until each gets at least So-so. Usage: node e2e/redo.mjs [baseUrl] [shotDir]
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
const log = (...a) => console.log('•', ...a);
const fail = async (msg) => { await page.screenshot({ path: `${shots}/redo-failure.png` }); console.error(msg); process.exit(1); };

await page.clock.install();
await page.goto(base);
await page.getByText('Import my Skritter data').click();
await page.getByText('Import finished').waitFor({ timeout: 180000 });
await page.getByRole('button', { name: 'OK' }).click();
// two months later, plenty of cards are due
await page.clock.setSystemTime(Date.now() + 60 * 86_400_000);
await page.reload();
await page.getByText('cards due now').waitFor();
for (let k = 0; k < 60 && (await page.locator('.stepper b').textContent()) !== '5'; k++) await page.getByLabel('Fewer').click();
await page.getByRole('button', { name: 'Study', exact: true }).first().click();

// the card's prompt, read before answering, identifies it
const key = () =>
  page.locator('.session').evaluate((el) =>
    [...el.children].filter((c) => !c.classList.contains('session-top')).map((c) => c.innerText).join(' ').slice(0, 200),
  );
const seen = new Map(); // key -> times seen
const counters = [];
let redoShown = false;
for (let n = 0; n < 80; n++) {
  await page.waitForTimeout(300);
  if (await page.getByText('Session complete').isVisible().catch(() => false)) break;
  await page.locator('.part-label').waitFor({ timeout: 5000 });
  const counter = (await page.locator('.session-top .small.muted').textContent()) ?? '';
  counters.push(counter);
  if (counter.startsWith('Redo')) redoShown = true;
  const label = await page.locator('.part-label').textContent();
  const k = await key();
  const times = (seen.get(k) ?? 0) + 1;
  seen.set(k, times);
  // fail every card twice (first round and first redo round), then pass it
  const g = times <= 2 ? 1 : 3;
  if (label === 'Write') {
    // scribble until each character is drawn for us; grade every character but the last the same
    for (let i = 0; i < 800; i++) {
      if (await page.locator('.grades').isVisible()) {
        const last = await page.locator('.word-row .slot').evaluateAll((els) => els.every((e) => e.textContent));
        if (last) break;
        await page.locator(`.grades .g${g}`).click();
        await page.waitForTimeout(800);
        continue;
      }
      const w = await page.locator('.writer[data-char]').boundingBox();
      await page.mouse.move(w.x + 10, w.y + w.height - 10);
      await page.mouse.down();
      await page.mouse.move(w.x + 40, w.y + w.height - 12, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(80);
    }
  } else if (label === 'Tone') {
    const pad = page.locator('svg.tone-pad');
    for (let i = 0; i < 8 && !(await page.locator('.grades').isVisible()); i++) {
      const p = await pad.boundingBox();
      await page.mouse.move(p.x + p.width * 0.2, p.y + p.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(p.x + p.width * 0.8, p.y + p.height * 0.5, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(120);
    }
  } else {
    await page.locator('.reveal-area.tap-card').click();
  }
  await page.locator('.grades').waitFor();
  const forgot = await page.locator('.grades .g1 small').textContent();
  if (forgot !== 'this session') await fail(`Forgot shows "${forgot}"`);
  if (n === 0) await page.screenshot({ path: `${shots}/redo-grades.png` });
  await page.locator(`.grades .g${g}`).click();
  await page.waitForTimeout(800);
}
if (!(await page.getByText('Session complete').isVisible())) await fail('session did not complete');
await page.screenshot({ path: `${shots}/redo-complete.png` });
log('counters:', counters.join(' '));
log('times each card was seen:', [...seen.values()].join(','));
log('summary:', await page.locator('.reveal-area p').textContent());
if (!redoShown) await fail('no Redo round');
if ([...seen.values()].some((t) => t !== 3)) await fail('every card should be seen exactly 3 times');
log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
