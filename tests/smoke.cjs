// Smoke test: opens the game on a phone-sized window, opens and closes every menu panel,
// flies ~20 s in each city on autopilot and fails on any page error or console error.
// Usage: node tests/smoke.cjs   (uses serve.py on port 8765; starts it if nothing is listening)
'use strict';
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

// Playwright: global @playwright/cli install, else a global or local `playwright` package
const NPM = path.join(process.env.APPDATA || '', 'npm/node_modules');
let playwright;
for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright'), 'playwright']) {
  try { playwright = require(p); break; } catch (e) {}
}
if (!playwright) { console.error('Playwright not found: npm i -g playwright && npx playwright install chromium'); process.exit(1); }

const PORT = 8765;
const URL = `http://localhost:${PORT}/?q=0`;
const ROOT = path.join(__dirname, '..');
const MENU = ['settingsBtn', 'wardrobeBtn', 'missionsBtn', 'dailyBtn', 'achBtn', 'boardBtn', 'upsBtn', 'modeBtn'];
const CLOSE = { missionsPanel: 'closeMissions', achPanel: 'closeAch', upPanel: 'closeUps', boardPanel: 'closeBoard', profilePanel: 'skipName', dailyPanel: 'closeWheel', dayRunPanel: 'closeDayRun', settings: 'closeSettings' };
const CITIES = ['istanbul', 'izmir', 'antalya'];
const FLY_MS = 20000;

// a returning player: tutorial done, every city unlocked, no name yet
const SEED = {
  'simit-martisi-reset-2026-10-31': '1',
  'simit-martisi-eco-reset-2026-11-09': '1',
  'simit-martisi-tut': 'true',
  'simit-martisi-route': '99',
  'simit-martisi-route-izmir': '99',
};

const up = () => new Promise(res => {
  const req = http.get(`http://localhost:${PORT}/`, r => { r.resume(); res(true); });
  req.on('error', () => res(false));
  req.setTimeout(1500, () => { req.destroy(); res(false); });
});

async function startServer() {
  if (await up()) return null;
  const child = spawn('python', ['serve.py', String(PORT)], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 50; i++) { if (await up()) return child; await new Promise(r => setTimeout(r, 200)); }
  throw new Error('serve.py did not start on port ' + PORT);
}
function stopServer(child) {
  if (!child) return;
  try { if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); else child.kill(); } catch (e) {}
}

async function main() {
  const errors = [];
  const server = await startServer();
  const browser = await playwright.chromium.launch({ headless: false });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.route(/supabase/, r => r.abort());
    await ctx.addInitScript(seed => {
      if (sessionStorage.getItem('smoke-seeded')) return;
      sessionStorage.setItem('smoke-seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, SEED);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const loc = (m.location() && m.location().url) || '';
      if (/supabase/.test(loc) || /supabase/.test(m.text())) return; // blocked on purpose
      if (/net::ERR_FAILED/.test(m.text()) && /supabase|^$/.test(loc)) return;
      errors.push('console.error: ' + m.text() + (loc ? ` (${loc})` : ''));
    });
    page.on('requestfailed', r => { if (!/supabase/.test(r.url())) errors.push('request failed: ' + r.url()); });

    const step = s => console.log('- ' + s);
    const check = (ok, msg) => { if (!ok) throw new Error(msg); };
    const g = (expr, arg) => page.evaluate(expr, arg);
    // a panel's close link can be hidden (the daily reward before claiming): then close it the way a backdrop tap does
    const press = async id => { const b = page.locator('#' + id); if (await b.isVisible()) await b.click(); else await g(i => document.getElementById(i).click(), id); };

    await page.goto(URL);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 60000 });
    step('title screen loaded');
    await page.waitForTimeout(1200);
    // a nameless player is asked for a name once per session on the title; after that it must not pop up again
    step('name asked on launch: ' + (await g(() => !document.getElementById('profilePanel').classList.contains('hidden'))));
    // the daily reward may open by itself on the first visit of the day: close whatever is open
    for (const b of await g(close => Object.entries(close).filter(([p]) => !document.getElementById(p).classList.contains('hidden')).map(([, b]) => b), CLOSE)) await press(b);

    // menu buttons: open, check a panel opened, close it
    for (const id of MENU) {
      await page.click('#' + id);
      await page.waitForFunction(() => window.__game.busy, null, { timeout: 5000 }).catch(() => { throw new Error(id + ' opened nothing'); });
      const open = await g(close => !document.getElementById('wardrobe').classList.contains('hidden') ? 'closeWardrobe' : Object.entries(close).filter(([p]) => !document.getElementById(p).classList.contains('hidden')).map(([, b]) => b)[0], CLOSE);
      check(open, id + ': no open panel found');
      await press(open);
      await page.waitForFunction(() => !window.__game.busy, null, { timeout: 5000 }).catch(() => { throw new Error(id + ' did not close'); });
      step(`${id} opened and closed`);
    }

    for (const city of CITIES) {
      await g(c => window.__game.setCity(c), city);
      await g(() => window.__game.startGame());
      await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 15000 }).catch(() => { throw new Error(city + ': flight did not start'); });
      await g(() => { window.__game.setGod(true); window.__smokeAp = setInterval(() => window.__game.autopilot(), 50); });
      await page.waitForTimeout(FLY_MS);
      const s = await g(() => ({ state: window.__game.state, dist: window.__game.dist }));
      await g(() => { clearInterval(window.__smokeAp); window.__game.setGod(false); });
      check(s.state === 'play', `${city}: state is ${s.state} after flying`);
      check(s.dist > 0, `${city}: dist is ${s.dist}`);
      await g(() => window.__game.crash());
      await page.waitForFunction(() => window.__game.state === 'over', null, { timeout: 10000 }).catch(() => { throw new Error(city + ': crash did not end the flight'); });
      await g(() => window.__game.showTitle());
      await page.waitForTimeout(1200); // anything that pops up on the title by itself does so within a second
      const prof = await g(() => !document.getElementById('profilePanel').classList.contains('hidden'));
      check(!prof, `${city}: profile panel opened by itself on the title screen`);
      step(`${city}: flew ${Math.round(s.dist)} m, crashed, back on title`);
    }

    // the profile still opens from Settings and saves the name
    await page.click('#settingsBtn');
    await page.click('#profileBtn');
    check(await page.locator('#profilePanel').isVisible(), 'Settings → Profile did not open the profile panel');
    await page.fill('#nameInput', 'Smoke Test');
    await page.click('#saveName');
    await page.waitForFunction(() => document.getElementById('profilePanel').classList.contains('hidden') && document.getElementById('profileName').textContent === 'Smoke Test', null, { timeout: 5000 })
      .catch(() => { throw new Error('profile name was not saved'); });
    step('Settings → Profile opened and saved the name');
  } catch (e) {
    errors.push(e.message);
  } finally {
    await browser.close().catch(() => {});
    stopServer(server);
  }
  if (errors.length) { console.error('SMOKE FAILED\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK');
}

main().catch(e => { console.error('SMOKE FAILED\n' + (e.stack || e.message)); process.exit(1); });
