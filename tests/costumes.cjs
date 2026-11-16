// Costume check: every costume has an icon, a perk and a name/perk translation in all 20 languages;
// then the new pieces are worn in the browser (no page errors) and a wardrobe screenshot is saved.
// Usage: PORT=8777 node tests/costumes.cjs [shot.png]
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const NPM = path.join(process.env.APPDATA || '', 'npm/node_modules');
let playwright;
for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright'), 'playwright']) {
  try { playwright = require(p); break; } catch (e) {}
}
const ROOT = path.join(__dirname, '..'), JS = path.join(ROOT, 'docs/js');
const PORT = +process.env.PORT || 8765;
const SHOT = process.argv[2] ? path.resolve(process.argv[2]) : '';
const WEAR = ['ari', 'snorkel', 'medal', 'cini'];
const SUITS = ['durum', 'kurye', 'taksi']; // full-body suits are modelled at gull size, not grown
const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
const fail = [];

// --- static: the tables the wardrobe reads
const models = read('models.js'), main = read('main.js');
const cos = [...models.slice(models.indexOf('export const COSTUMES'), models.indexOf('];', models.indexOf('export const COSTUMES'))).matchAll(/\{ id: '(\w+)', name: '([^']+)', slot: '(\w+)'/g)].map(m => ({ id: m[1], name: m[2], slot: m[3] }));
const perkSrc = main.slice(main.indexOf('const PERKS = {'), main.indexOf('};', main.indexOf('const PERKS = {')));
const perks = Object.fromEntries([...perkSrc.matchAll(/(\w+): '([^']+)'/g)].map(m => [m[1], m[2]]));
const svgSrc = models.slice(models.indexOf('export const COSTUME_SVG'));
const growSrc = models.slice(models.indexOf('const COS_GROW'), models.indexOf('};', models.indexOf('const COS_GROW')));
const pal = models.slice(models.indexOf('const GULL_PAL'), models.indexOf('};', models.indexOf('const GULL_PAL')));
const tables = { 'i18n.js': read('i18n.js') };
for (const f of fs.readdirSync(path.join(JS, 'lang'))) tables['lang/' + f] = read('lang/' + f);
for (const c of cos) {
  if (!new RegExp(`\\n  ${c.id}: '<svg`).test(svgSrc)) fail.push(c.id + ': no icon');
  if (!perks[c.id]) fail.push(c.id + ': no perk');
  else if (!main.includes(`perk('${c.id}')`) && !new RegExp(`PW_PERK = \\{[^}]*'${c.id}'`).test(main)) fail.push(c.id + ': perk text but no effect');
  if (!SUITS.includes(c.id) && !new RegExp(`[ {]${c.id}: [\\d.]+`).test(growSrc)) fail.push(c.id + ': no COS_GROW');
  if (c.slot === 'body' && !new RegExp(`\\n  ${c.id}: \\{`).test(pal)) fail.push(c.id + ': no GULL_PAL');
  for (const s of [c.name, perks[c.id]].filter(Boolean)) for (const [f, t] of Object.entries(tables)) {
    const n = t.split(JSON.stringify(s) + ':').length - 1 + t.split(`'${s}':`).length - 1; // en table uses single quotes
    if (n < (f === 'i18n.js' ? 3 : 1)) fail.push(`${f}: missing "${s}"`);
  }
}
console.log(`- ${cos.length} costumes, ${Object.keys(tables).length} language files checked`);

const up = () => new Promise(res => { const r = http.get(`http://localhost:${PORT}/`, x => { x.resume(); res(true); }); r.on('error', () => res(false)); });

(async () => {
  if (!playwright) { fail.push('Playwright not found'); return; }
  let srv = null;
  if (!(await up())) { srv = spawn('python', ['serve.py', String(PORT)], { cwd: ROOT, stdio: 'ignore', windowsHide: true }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise(r => setTimeout(r, 250)); }
  const browser = await playwright.chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.route(/supabase/, r => r.abort()); // test scores must never reach the real leaderboard
    await ctx.addInitScript(([ids, wear]) => {
      if (sessionStorage.getItem('cos-seeded')) return; sessionStorage.setItem('cos-seeded', '1');
      localStorage.clear();
      const S = { 'simit-martisi-reset-2026-10-31': '1', 'simit-martisi-eco-reset-2026-11-09': '1', 'simit-martisi-tut': 'true',
        'simit-martisi-look': JSON.stringify({ owned: ids, on: wear, fresh: [] }) };
      for (const [k, v] of Object.entries(S)) localStorage.setItem(k, v);
    }, [cos.map(c => c.id), WEAR]);
    const page = await ctx.newPage();
    page.on('pageerror', e => fail.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED/.test(m.text())) fail.push('console.error: ' + m.text()); });
    await page.goto(`http://localhost:${PORT}/?q=0&net=1`);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    const on = await page.evaluate(() => window.__game.look.on);
    for (const id of WEAR) if (!on.includes(id)) fail.push('not worn after load: ' + id);
    // close whatever opened by itself (daily reward), then the wardrobe
    await page.evaluate(() => document.querySelectorAll('.panel:not(.hidden) .close, #closeDaily').forEach(b => b.offsetParent && b.click()));
    await page.evaluate(() => window.__game.openWardrobe());
    await page.waitForTimeout(800);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('#costumes button')].map(b => ({ svg: !!b.querySelector('svg'), txt: b.textContent })));
    if (!tiles.length || tiles.some(t => !t.svg || /undefined/.test(t.txt))) fail.push('wardrobe tile without icon/name: ' + JSON.stringify(tiles.filter(t => !t.svg || /undefined/.test(t.txt))));
    console.log(`- wardrobe: ${tiles.length} tiles in the open tab`);
    if (SHOT) { await page.screenshot({ path: SHOT }); console.log('- screenshot ' + SHOT); }
    await page.evaluate(() => window.__game.closeWardrobe());
    await page.evaluate(() => window.__game.startGame());
    await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log('- flew with ' + WEAR.join(', '));
    // diving mask: reviving costs half the fish (1, 1, 2 instead of 1, 2, 4)
    const costs = [];
    await page.evaluate(() => window.__game.setFish(9));
    for (let i = 0; i < 3; i++) {
      // crash() is ignored while the revive shield is on, and the over card ignores revive for a moment: keep trying
      await page.waitForFunction(() => { if (window.__game.state === 'play') window.__game.crash(); return window.__game.state === 'over'; }, null, { timeout: 20000, polling: 300 });
      costs.push(await page.evaluate(() => window.__game.fishCost));
      await page.waitForFunction(() => { if (window.__game.state === 'over') window.__game.fishRevive(); return window.__game.state === 'play'; }, null, { timeout: 20000, polling: 300 });
    }
    console.log('- revive fish costs with the mask: ' + costs.join(', '));
    if (costs.join() !== '1,1,2') fail.push('diving mask revive costs ' + costs.join() + ', expected 1,1,2');
  } finally { await browser.close(); if (srv) srv.kill(); }
})().catch(e => fail.push(String(e))).finally(() => {
  if (fail.length) { console.log('COSTUMES FAIL\n' + fail.join('\n')); process.exit(1); }
  console.log('COSTUMES OK');
});
