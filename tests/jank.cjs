// Jank scan: 4x slower CPU (a mid-range phone), opens every menu panel, the wardrobe, the world map
// (each city picked) and the first 12 s of flight in each city; lists every main-thread task over 200 ms by step.
// Usage: PORT=8777 node tests/jank.cjs   (prints JANK OK when no task exceeds LIMIT ms)
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

const PORT = +process.env.PORT || 8765; // 8765 busy? PORT=8777 node tests/smoke.cjs
const URL = `http://localhost:${PORT}/?q=0&net=1`; // net=1: online parts on (requests to the server are blocked below)
const ROOT = path.join(__dirname, '..');
const MENU = ['settingsBtn', 'shopBtn', 'wardrobeBtn', 'missionsBtn', 'dailyBtn', 'achBtn', 'boardBtn', 'upsBtn', 'modeBtn'];
const CLOSE = { shopPanel: 'closeShop', roadPanel: 'closeRoad', missionsPanel: 'closeMissions', achPanel: 'closeAch', upPanel: 'closeUps', boardPanel: 'closeBoard', profilePanel: 'skipName', dailyPanel: 'closeWheel', dayRunPanel: 'closeDayRun', settings: 'closeSettings' };
const CITIES = ['istanbul', 'izmir', 'antalya', 'mugla', 'canakkale', 'trabzon', 'samsun', 'rize', 'mersin'];
const FLY_MS = 20000;

// a returning player: tutorial done, every city unlocked, no name yet
const SEED = {
  'simit-martisi-reset-2026-10-31': '1',
  'simit-martisi-eco-reset-2026-11-09': '1',
  'simit-martisi-tut': 'true',
  'simit-martisi-route': '99',
  'simit-martisi-route-izmir': '99',
  'simit-martisi-route-antalya': '99',
  'simit-martisi-route-mugla': '99',
  'simit-martisi-route-canakkale': '99',
  'simit-martisi-route-trabzon': '99',
  'simit-martisi-route-samsun': '99',
  'simit-martisi-route-rize': '99',
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

const LIMIT = +process.env.LIMIT || 400;
(async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  let worst = 0;
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.route(/supabase/, r => r.abort());
    await ctx.addInitScript(seed => {
      window.__jank = []; window.__jl = 'load';
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration >= 200) window.__jank.push([window.__jl, Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
      if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
      localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, SEED);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const g = (f, a) => page.evaluate(f, a);
    const label = l => g(x => { window.__jl = x; }, l);
    await page.goto(URL);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 120000 });
    await page.waitForTimeout(3000);
    const closeAll = async () => { for (const b of await g(close => Object.entries(close).filter(([p]) => !document.getElementById(p).classList.contains('hidden')).map(([, b]) => b), CLOSE)) await g(i => document.getElementById(i).click(), b); if (await g(() => !document.getElementById('wardrobe').classList.contains('hidden'))) await g(() => document.getElementById('closeWardrobe').click()); await page.waitForTimeout(600); };
    await closeAll();
    for (const id of MENU) {
      await label('panel ' + id); await g(i => document.getElementById(i).click(), id); await page.waitForTimeout(1800); await closeAll();
    }
    for (const c of CITIES) {
      await label('map → ' + c);
      await g(() => document.getElementById('cityPick').click()); await page.waitForTimeout(1200);
      await page.click(`.map-lbl[data-pick="${c}"]`, { force: true }).catch(() => {}); await page.waitForTimeout(600);
      await page.click('#mapGo', { force: true }).catch(() => {}); await page.waitForTimeout(+process.env.WAIT || 3500);
      await label('flight ' + c); await g(() => window.__game.startGame()); await page.waitForTimeout(12000);
      await label('over ' + c); await g(() => { document.getElementById('pauseBtn').click(); document.getElementById('quitBtn').click(); }); await page.waitForTimeout(1500);
      await g(() => document.getElementById('homeBtn').click()).catch(() => {}); await page.waitForTimeout(1500);
      await g(() => { const r = document.getElementById('recShow'); if (r && !r.classList.contains('hidden')) r.click(); }); await page.waitForTimeout(800);
      await closeAll();
    }
    const j = await g(() => window.__jank);
    const by = {}; for (const [l, d] of j) (by[l] = by[l] || []).push(d);
    const rows = Object.entries(by).map(([l, ds]) => [l, Math.max(...ds), ds.length]).sort((a, b) => b[1] - a[1]);
    for (const [l, mx, n] of rows) console.log(`${String(mx).padStart(5)} ms  x${n}  ${l}`);
    worst = rows.length ? rows[0][1] : 0;
  } finally { await browser.close(); stopServer(server); }
  console.log(worst > LIMIT ? `JANK: worst ${worst} ms > ${LIMIT}` : `JANK OK (worst ${worst} ms)`);
  process.exit(worst > LIMIT ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
