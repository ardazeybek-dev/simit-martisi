// Delete my account: after Profile → Delete my account the device must NOT re-register by itself
// (on reload, at the leaderboard, after a flight). It rejoins only when the player saves a name again.
// Server calls are faked here; nothing reaches the real leaderboard.
// Usage: PORT=8777 node tests/delete-account.cjs
'use strict';
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const NPM = path.join(process.env.APPDATA || '', 'npm/node_modules');
let playwright;
for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright'), 'playwright']) {
  try { playwright = require(p); break; } catch (e) {}
}
if (!playwright) { console.error('Playwright not found'); process.exit(1); }

const PORT = +process.env.PORT || 8765;
const URL = `http://localhost:${PORT}/?q=0&net=1`;
const ROOT = path.join(__dirname, '..');
const SEED = {
  'simit-martisi-reset-2026-10-31': '1',
  'simit-martisi-eco-reset-2026-11-09': '1',
  'simit-martisi-tut': 'true',
  'simit-martisi-best': '500',
  'simit-martisi-profile': JSON.stringify({ id: '11111111-1111-1111-1111-111111111111', secret: '22222222-2222-2222-2222-222222222222', name: 'Deneme', srv: 'Deneme', cc: 'TR', claimed: true, dirty: false, ccDirty: false }),
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
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const server = await startServer();
  const browser = await playwright.chromium.launch({ headless: true, args: ['--mute-audio'] });
  const calls = [];
  let fail = '';
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.route(/supabase/, r => r.abort()); // registered first: later routes win, the fake RPCs below take precedence
    await ctx.route('**/rest/v1/rpc/**', r => {
      const fn = r.request().url().split('/rpc/')[1];
      calls.push(fn);
      const body = { delete_player: true, register: { id: '33333333-3333-3333-3333-333333333333', secret: '44444444-4444-4444-4444-444444444444', name: 'Martı 1234' }, get_board: { week: 1, total: 0, top: [], me: null } }[fn];
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body === undefined ? null : body) });
    });
    await ctx.addInitScript(seed => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, SEED);
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
    await wait(2500);

    // Profile → Delete my account → Yes, delete (real buttons)
    await page.evaluate(() => { document.getElementById('delOpen').click(); });
    await wait(200);
    await page.evaluate(() => { document.getElementById('delGo').click(); });
    await page.waitForFunction(() => /silindi|deleted/i.test(document.getElementById('delNote').textContent), null, { timeout: 8000 });
    if (!calls.includes('delete_player')) fail = 'delete_player was not called';

    // reload (app reopened) + leaderboard open + a sync: none of them may register again
    const before = calls.length;
    await page.reload();
    await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
    await wait(3000);
    await page.evaluate(async () => { const n = await import('/js/net.js'); await n.fetchBoard(); await n.sync(); });
    const after = calls.slice(before);
    const prof = await page.evaluate(() => localStorage.getItem('simit-martisi-profile'));
    if (!fail && after.includes('register')) fail = 'deleted account re-registered by itself: ' + after.join(',');
    if (!fail && after.includes('claim_best')) fail = 'deleted account re-uploaded best score';
    if (!fail && prof && JSON.parse(prof) && JSON.parse(prof).id) fail = 'profile id came back: ' + prof;

    // saving a name again = rejoining on purpose → register goes out
    const b2 = calls.length;
    await page.evaluate(async () => { const n = await import('/js/net.js'); n.setName('Yeniden'); await n.sync(); });
    if (!fail && !calls.slice(b2).includes('register')) fail = 'saving a name did not rejoin the leaderboard';
  } finally {
    await browser.close();
    if (server) try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch (e) {}
  }
  if (fail) { console.log('DELETE FAIL: ' + fail); process.exit(1); }
  console.log('DELETE OK (' + calls.join(',') + ')');
}
main().catch(e => { console.log('DELETE FAIL: ' + e.message); process.exit(1); });
