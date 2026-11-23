// Headless E2E smoke test for Frontier Dynamite & Bounty.
//   pnpm dev   (one terminal)      pnpm e2e   (another)
// Env: BASE_URL (default http://localhost:5174/), CHROME_PATH (default /usr/bin/google-chrome),
//      E2E_GPU=0 for software rendering (skips the FPS assertion).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174/';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
const GPU = process.env.E2E_GPU !== '0';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', ...(GPU ? ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] : [])],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}?inspector=1&clientSeed=e2e-seed`, { waitUntil: 'load' });
await page.waitForSelector('.cell');
await sleep(800);

const state = () => page.$eval('.pill.is-active', (e) => e.textContent);
const waitState = async (want, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (want.includes(await state())) return true;
    await sleep(50);
  }
  return false;
};
const purse = () => page.$eval('.ledger__purse .figure', (e) => e.textContent);
const blurToBody = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
const setPeek = async (on) => {
  const box = await page.$('.inspector .checkbox input');
  if (box && (await box.evaluate((b) => b.checked)) !== on) await box.click();
  await sleep(100);
};
const hazards = () => page.$$eval('.cell.is-peek', (els) => els.map((e) => Number(e.dataset.cell)));
const hiddenCells = () => page.$$eval('.cell--hidden', (els) => els.map((e) => Number(e.dataset.cell)));
const clickCell = async (i) => {
  const el = await page.$(`.cell[data-cell="${i}"]`);
  const b = await el.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};
const force = async (value) => {
  await page.select('.inspector select', value);
  await blurToBody();
};
const startRound = async () => {
  await blurToBody();
  await page.keyboard.press('Space');
  return waitState(['ROUND_ACTIVE']);
};
const verify = async () => {
  await page.click('.inspector .row-actions .btn');
  await page.waitForSelector('.verdict', { timeout: 4000 }).catch(() => null);
  return page.$eval('.verdict', (e) => e.className).catch(() => '');
};

check('25 cells on the default board', (await page.$$('.cell')).length === 25);
check('initial state IDLE', (await state()) === 'IDLE');
await page.screenshot({ path: `${OUT}/01-idle.png` });

// 1. Start → CONFIGURING → ROUND_ACTIVE, stake debited.
const p0 = await purse();
check('Space stakes a claim → ROUND_ACTIVE', await startRound());
check('stake debited', (await purse()) !== p0, `${p0} → ${await purse()}`);

// 2. Rapid double-click on a safe cell: exactly one PICK accepted.
await setPeek(true);
const hz = await hazards();
check('QA peek exposes the layout (3 dynamite)', hz.length === 3, hz.join(','));
const safe = (await hiddenCells()).filter((c) => !hz.includes(c));
const s1 = safe[0];
const el = await page.$(`.cell[data-cell="${s1}"]`);
const bb = await el.boundingBox();
await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await clickCell(safe[1]);
await waitState(['ROUND_ACTIVE']);
const picks = await page.$$eval('.log tbody tr', (rows) => rows.filter((r) => r.textContent.includes('PICK')).map((r) => r.classList.contains('is-rejected')));
check('double-click + third click → 1 accepted PICK, others rejected', picks.filter((x) => !x).length === 1 && picks.filter(Boolean).length >= 2, `accepted=${picks.filter((x) => !x).length} rejected=${picks.filter(Boolean).length}`);
check('revealed cell shows bounty', (await page.$eval(`.cell[data-cell="${s1}"]`, (e) => e.dataset.view)) === 'safe');
check('ladder advanced to step 1', (await page.$eval('.ladder__step.is-current', (e) => e.dataset.step)) === '1');

// 3. Keyboard: focus a cell, arrow to a safe neighbour, Enter digs.
const target = safe.find((c) => c !== s1 && c !== safe[0]);
await page.focus(`.cell[data-cell="${s1}"]`);
const cols = 5;
const [r0, c0] = [Math.floor(s1 / cols), s1 % cols];
const [r1, c1] = [Math.floor(target / cols), target % cols];
for (let i = 0; i < Math.abs(r1 - r0); i++) await page.keyboard.press(r1 > r0 ? 'ArrowDown' : 'ArrowUp');
for (let i = 0; i < Math.abs(c1 - c0); i++) await page.keyboard.press(c1 > c0 ? 'ArrowRight' : 'ArrowLeft');
const focused = await page.evaluate(() => Number(document.activeElement?.dataset?.cell));
check('arrow keys move focus across the grid', focused === target, `focused ${focused}, wanted ${target}`);
await page.keyboard.press('Enter');
await waitState(['ROUND_ACTIVE']);
check('Enter digs the focused cell', (await page.$eval(`.cell[data-cell="${target}"]`, (e) => e.dataset.view)) === 'safe');
await page.screenshot({ path: `${OUT}/02-active.png` });

// 4. Cash out with C → ROUND_OVER_WIN, poster, fairness verifies.
await blurToBody();
await page.keyboard.press('c');
check('C cashes out → ROUND_OVER_WIN', await waitState(['ROUND_OVER_WIN']));
await sleep(900);
check('win poster shown', !!(await page.$('.banner--win')));
await page.screenshot({ path: `${OUT}/03-win.png` });
check('fair round verifies (commitment + layout)', (await verify()).includes('is-ok'));

// 5. Bust on a known dynamite cell.
await startRound();
await setPeek(true);
const hz2 = await hazards();
await clickCell(hz2[0]);
check('dynamite → ROUND_OVER_BUST', await waitState(['ROUND_OVER_BUST']));
await sleep(900);
check('blast cell + full sweep rendered', !!(await page.$('.cell--hazard-hit')) && (await page.$$('.cell--missed')).length > 0);
check('bust poster shown', !!(await page.$('.banner--bust')));
await page.screenshot({ path: `${OUT}/04-bust.png` });
check('bust round also verifies', (await verify()).includes('is-ok'));

// 6. Lost response → Retry with the same requestId → pick applied once.
await startRound();
await setPeek(true);
const hz3 = await hazards();
const safe3 = (await hiddenCells()).filter((c) => !hz3.includes(c));
await force('lostResponse');
await clickCell(safe3[0]);
await page.waitForSelector('.modal', { timeout: 5000 }).catch(() => null);
check('lost response opens the error dialog', !!(await page.$('.modal')));
const align = await page.$eval('.modal__actions', (e) => getComputedStyle(e).justifyContent);
check('modal actions right-aligned', align === 'flex-end', align);
await page.screenshot({ path: `${OUT}/05-error.png` });
await page.click('.modal .btn--primary');
check('Retry resumes the round', await waitState(['ROUND_ACTIVE']));
check('retried pick applied exactly once', (await page.$$('.cell--safe')).length === 1);

// 7. QA-forced dynamite is detected by verification.
const safe4 = (await hiddenCells()).filter((c) => !(hz3).includes(c));
await force('hazard');
await clickCell(safe4[0]);
await waitState(['ROUND_OVER_BUST']);
await sleep(600);
check('forced outcome FAILS verification (tamper detected)', (await verify()).includes('is-bad'));

// 8. Network error on open → refund → back to camp.
const p8 = await purse();
await force('networkError');
await blurToBody();
await page.keyboard.press('Space');
await page.waitForSelector('.modal', { timeout: 5000 }).catch(() => null);
check('open failure shows dialog', !!(await page.$('.modal')));
check('stake refunded on open failure', (await purse()) === p8, `${p8} vs ${await purse()}`);
await page.click('.modal .btn--primary');
check('dismiss returns to IDLE', await waitState(['IDLE']));

// 8b. Character & FX: shot → impact → flip ordering, scene beats, layered boom.
const setLatencyZero = () =>
  page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const r of document.querySelectorAll('.inspector .range-pair input')) {
      setter.call(r, '0');
      r.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
await setLatencyZero();
await startRound();
await setPeek(true);
const hz6 = await hazards();
const safe6 = (await hiddenCells()).filter((c) => !hz6.includes(c));
await clickCell(safe6[0]);
await sleep(110); // response is instant, but the muzzle flash is ~190 ms after the pick
const early = await page.$eval(`.cell[data-cell="${safe6[0]}"]`, (e) => e.dataset.view);
check('flip waits for the bullet even with zero latency', early === 'pending', `view at +110ms: ${early}`);
await waitState(['ROUND_ACTIVE']);
await sleep(300);
const ev1 = await page.$eval('[data-testid="scene-events"]', (e) => e.textContent);
check('scene logs shoot → safe for the pick', ev1.includes(`safe ${safe6[0]}`) && ev1.includes(`shoot ${safe6[0]}`), ev1);
await clickCell(hz6[0]);
await waitState(['ROUND_OVER_BUST']);
await sleep(150);
const parts = await page.$eval('[data-testid="scene-particles"]', (e) => parseInt(e.textContent, 10));
const ev2 = await page.$eval('[data-testid="scene-events"]', (e) => e.textContent);
check('dynamite triggers a layered BOOM (scene event + particle burst)', ev2.includes('BOOM') && parts > 60, `${parts} particles · ${ev2.slice(0, 60)}`);
const clipNow = await page.$eval('[data-testid="scene-clip"]', (e) => e.textContent);
check('marshal reacts with the flinch clip', clipNow.startsWith('flinch'), clipNow);
await page.evaluate(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const [a, b] = document.querySelectorAll('.inspector .range-pair input');
  setter.call(b, '320');
  b.dispatchEvent(new Event('input', { bubbles: true }));
  setter.call(a, '120');
  a.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.screenshot({ path: `${OUT}/07-boom.png` });
await sleep(1400); // FX window: fireball, smoke billows, ash
const boomPerf = await page.$eval('.perf__stats', (e) => e.textContent);
const boomFps = await page.$eval('.perf__fps', (e) => parseFloat(e.textContent));
if (GPU) check('frame rate holds through the BOOM window (≥ 50 fps)', boomFps >= 50, `${boomFps} fps · ${boomPerf}`);

// 9. Preset switch to 6×6.
await page.evaluate(() => [...document.querySelectorAll('.inspector .preset-grid .chip')].find((b) => b.textContent.includes('6×6'))?.click());
await sleep(500);
check('preset switch to 6×6 renders 36 cells', (await page.$$('.cell')).length === 36);

// 10. FPS while FX run.
await startRound();
await setPeek(true);
const hz5 = await hazards();
const safe5 = (await hiddenCells()).filter((c) => !hz5.includes(c));
for (const c of safe5.slice(0, 4)) {
  await clickCell(c);
  await waitState(['ROUND_ACTIVE']);
}
await sleep(300);
const fps = await page.$eval('.perf__fps', (e) => parseFloat(e.textContent));
const perf = await page.$eval('.perf__stats', (e) => e.textContent);
if (GPU) check('FPS during reveals ≥ 50', fps >= 50, `${fps} fps · ${perf}`);
else console.log(`SKIP  FPS (software GL): ${fps}`);

// 11. Rules drawer footer alignment.
await page.click('button[aria-label="Rules and payouts"]');
await sleep(400);
check('drawer footer right-aligned', (await page.$eval('.rules .drawer__footer', (e) => getComputedStyle(e).justifyContent)) === 'flex-end');
await page.screenshot({ path: `${OUT}/06-rules.png` });
await page.keyboard.press('Escape');

// 12. Responsive layouts.
for (const [name, vp] of [
  ['portrait-390', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['portrait-360', { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['portrait-320', { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['landscape-844', { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['tablet-820', { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['desktop-1280', { width: 1280, height: 720 }],
]) {
  await page.setViewport(vp);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.cell');
  await sleep(700);
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const prim = document.querySelector('.primary').getBoundingClientRect();
    const cells = [...document.querySelectorAll('.cell')].map((c) => c.getBoundingClientRect());
    const ledger = document.querySelector('.ledger').getBoundingClientRect();
    const boardBox = document.querySelector('.claim__board').getBoundingClientRect();
    const cellsInside = cells.every((c) => c.left >= boardBox.left - 1 && c.right <= boardBox.right + 1 && c.top >= boardBox.top - 1 && c.bottom <= boardBox.bottom + 1);
    const overlap = !(ledger.right <= boardBox.left || ledger.left >= boardBox.right || ledger.bottom <= boardBox.top || ledger.top >= boardBox.bottom);
    const minCell = Math.min(...cells.map((c) => c.width));
    const led = document.querySelector('.ledger');
    const ledgerClipped = led.scrollWidth - led.clientWidth;
    return { overflow, ledgerClipped, primaryVisible: prim.bottom <= innerHeight && prim.right <= innerWidth && prim.height > 0, cellsInside, overlap, minCell: Math.round(minCell) };
  });
  check(`${name}: no overflow, board+ledger fit, CTA visible, cells ≥ 40px`, r.overflow === 0 && r.ledgerClipped === 0 && r.primaryVisible && r.cellsInside && !r.overlap && r.minCell >= 40, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/layout-${name}.png` });
}

check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
