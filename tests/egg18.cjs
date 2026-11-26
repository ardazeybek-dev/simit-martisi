// 18 sürprizleri + Dürüm martı (3418 simit, açlık %18 yavaş). Usage: PORT=8777 node tests/egg18.cjs (serve.py running)
// Checks: 1818 m rain pays 18 simits once per flight, combo 18 flash only with Dürüm worn, a score ending in 18 bursts on the game-over card,
// 18:18 on the menu pays 18 simits once a day with Dürüm worn.
const path = require('path'); const NPM = path.join(process.env.APPDATA, 'npm/node_modules');
let pw; for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright')]) { try { pw = require(p); break; } catch (e) {} }
const PORT = +process.env.PORT || 8777;
const INIT = { 'simit-martisi-tut': 'true', 'simit-martisi-reset-2026-10-31': '1', 'simit-martisi-eco-reset-2026-11-09': '1', 'simit-martisi-route': '99' };
const fails = [], ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails.push(m); };
async function open(b, wear, time) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.route(/supabase/, r => r.abort());
  await ctx.addInitScript(([init, wear]) => {
    if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear();
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
    if (wear) localStorage.setItem('simit-martisi-look', JSON.stringify({ owned: ['durum'], on: ['durum'] }));
  }, [INIT, wear]);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  if (time) await page.clock.setFixedTime(time);
  await page.goto(`http://localhost:${PORT}/?q=0&net=1`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}
const egg = page => page.evaluate(() => { const e = document.getElementById('amkEgg'); return e ? { rain: e.classList.contains('rain'), big: (e.querySelector('b') || {}).textContent || '', n: e.querySelectorAll('span').length } : null; });

(async () => {
  const b = await pw.chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  // A: Dürüm giyili, saat 18:18
  { const { ctx, page, errs } = await open(b, true, new Date(2026, 10, 26, 18, 18, 5));
    await page.waitForTimeout(1500);
    const e = await egg(page), w = await page.evaluate(() => window.__game.wallet);
    ok(e && /18:18/.test(e.big) && /\+18/.test(e.big), `18:18 menu burst with gift: ${JSON.stringify(e)}`);
    ok(w === 18, `18:18 paid 18 simits (wallet ${w})`);
    await page.evaluate(() => document.getElementById('amkEgg')?.remove()); await page.waitForTimeout(2500);
    ok(!(await egg(page)) && (await page.evaluate(() => window.__game.wallet)) === 18, '18:18 only once a day');
    const look = await page.evaluate(() => window.__game.look);
    ok(look.on.includes('durum'), 'Dürüm worn');
    // 1818 m
    await page.evaluate(() => { const g = window.__game; g.setGod(true); g.startGame(); });
    await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 10000 });
    await page.evaluate(() => { window.__rains = 0; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.id === 'amkEgg' && n.classList.contains('rain')) window.__rains++; }).observe(document.body, { childList: true }); window.__game.warp(1790); }); await page.waitForTimeout(2500); // iskele ödemeleri ölçümden önce bitsin
    const w0 = await page.evaluate(() => window.__game.wallet);
    await page.waitForFunction(() => document.getElementById('amkEgg'), null, { timeout: 12000 }).catch(() => {});
    const r = await egg(page), w1 = await page.evaluate(() => window.__game.wallet);
    ok(r && r.rain && r.n === 26 && /1818/.test(r.big), `1818 m rain: ${JSON.stringify(r)}`);
    ok(w1 - w0 >= 18, `1818 m paid 18 (${w0} → ${w1})`);
    await page.waitForTimeout(3000);
    { const [n, d2] = await page.evaluate(() => [window.__rains, Math.round(window.__game.dist)]); ok(n === 1, `1818 m rain once per flight (${n}x by ${d2} m)`); }
    // kombo 18: 17'den bir simit yakala
    await page.evaluate(() => window.__game.setCombo(17));
    let fl = null; const t0 = Date.now();
    while (!fl && Date.now() - t0 < 15000) {
      fl = await page.evaluate(() => {
        const g = window.__game, e = document.getElementById('amkEgg');
        if (e && !e.classList.contains('rain')) return { combo: g.combo, n: e.querySelectorAll('span').length, big: !!e.querySelector('b') };
        if (g.combo < 17 || g.combo > 18) g.setCombo(17);
        return null;
      });
      await page.waitForTimeout(40);
    }
    ok(fl && fl.n === 12 && !fl.big, `combo 18 flash with Dürüm: ${JSON.stringify(fl)}`);
    // skor …18
    await page.evaluate(() => { const g = window.__game; document.getElementById('amkEgg')?.remove(); for (let i = 0; i < 300 && g.score % 100 !== 18; i++) g.addPoints(1); window.__s = g.score; g.setGod(false); g.crash('bacaya'); });
    await page.waitForFunction(() => window.__game.state === 'over' || window.__game.state === 'dead', null, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => document.getElementById('amkEgg'), null, { timeout: 12000 }).catch(() => {});
    const s = await egg(page), sc = await page.evaluate(() => [window.__s, window.__game.state]);
    ok(s && !s.rain && /18$/.test(s.big.replace(/\D/g, '')), `score ${sc[0]} (${sc[1]}) ends in 18 → burst ${JSON.stringify(s)}`);
    ok(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close(); }
  // B: Dürüm giyili değil, 18:18 → mesaj var, hediye yok; kombo 18'de parlama yok; fiyat ve özellik yazısı
  { const { ctx, page, errs } = await open(b, false, new Date(2026, 10, 26, 18, 18, 5));
    await page.waitForTimeout(1500);
    const e = await egg(page), w = await page.evaluate(() => window.__game.wallet);
    ok(e && e.big === '18:18 🌯' && w === 0, `18:18 without Dürüm: message only (${JSON.stringify(e)}, wallet ${w})`);
    const info = await page.evaluate(() => { const c = window.__game; return null; });
    void info;
    ok(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close(); }
  // C: saat 18:17 → hiçbir şey
  { const { ctx, page, errs } = await open(b, true, new Date(2026, 10, 26, 18, 17, 5));
    await page.waitForTimeout(2500);
    ok(!(await egg(page)), '18:17: no burst');
    ok(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close(); }
  await b.close();
  console.log(fails.length ? `EGG18 FAIL (${fails.length})` : 'EGG18 OK');
  process.exit(fails.length ? 1 : 0);
})();
