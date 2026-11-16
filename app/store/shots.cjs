// Mağaza ekran görüntüleri: node app/store/shots.cjs   (serve.py çalışıyor olmalı; PORT=8777 varsayılan)
// 360x640 @3 = 1080x1920 telefon görüntüleri app/store/phone-*.png olarak yazılır. Sunucu istekleri engellenir.
'use strict';
const path = require('path');
const NPM = path.join(process.env.APPDATA || '', 'npm/node_modules');
let playwright;
for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright'), 'playwright']) { try { playwright = require(p); break; } catch (e) {} }
const PORT = +process.env.PORT || 8777;
const OUT = __dirname;
const CITIES = ['istanbul', 'izmir', 'antalya', 'mugla', 'canakkale', 'trabzon', 'samsun', 'rize', 'mersin'];
const SEED = { 'simit-martisi-reset-2026-10-31': '1', 'simit-martisi-eco-reset-2026-11-09': '1', 'simit-martisi-tut': 'true', 'simit-martisi-wallet': '1240',
  'simit-martisi-look': JSON.stringify({ owned: ['fes', 'nazar', 'cini'], on: ['fes', 'nazar', 'cini'], fresh: [] }) };
for (const c of CITIES) SEED[c === 'istanbul' ? 'simit-martisi-route' : 'simit-martisi-route-' + c] = '99';
const FLIGHTS = (process.env.CITIES || 'istanbul,izmir,antalya,mersin').split(',');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: process.env.LANG_CODE || 'tr-TR' });
  await ctx.route(/supabase/, r => r.abort());
  await ctx.addInitScript(seed => {
    if (sessionStorage.getItem('shots-seeded')) return; sessionStorage.setItem('shots-seeded', '1');
    localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, SEED);
  const page = await ctx.newPage();
  const g = (fn, a) => page.evaluate(fn, a);
  await page.goto(`http://localhost:${PORT}/?q=0&net=1`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 60000 });
  const calm = async () => { for (let i = 0; i < 5 && await g(() => window.__game.busy); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); } };
  await page.waitForTimeout(2500); await calm();
  // mağaza görüntüsünde açık hava: başlıkta şehri, uçuşta kalkışı hava açık çıkana kadar yenile
  const clearCity = async city => { for (let i = 0; i < 30; i++) { await g(c => window.__game.setCity(c), city); if (await g(() => window.__game.weather === 'clear')) return; } };
  const land = async () => {
    await g(() => { clearInterval(window.__ap); window.__ap = setInterval(() => { if (window.__game.state === 'play') window.__game.crash(); }, 300); });
    await page.waitForFunction(() => window.__game.state === 'over', null, { timeout: 15000 });
    await g(() => { clearInterval(window.__ap); window.__game.setGod(false); window.__game.showTitle(); });
    await page.waitForTimeout(1200); await calm();
  };
  await clearCity('istanbul'); await page.waitForTimeout(2500); await calm();
  let n = 1;
  const shot = async name => { const f = path.join(OUT, `phone-${n++}-${name}.png`); await page.screenshot({ path: f }); console.log(f); };
  await shot('title');
  for (const city of FLIGHTS) {
    for (let i = 0; i < 15; i++) {
      await clearCity(city); await page.waitForTimeout(500);
      await g(() => window.__game.startGame());
      await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 15000 });
      await g(() => { window.__game.setGod(true); window.__ap = setInterval(() => window.__game.autopilot(), 50); });
      if (await g(() => window.__game.weather === 'clear')) break;
      await land();
    }
    await page.waitForTimeout(+process.env.FLY_MS || 14000);
    await shot(city + (await g(() => window.__game.weather === 'clear') ? '' : '-notclear'));
    await land();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
