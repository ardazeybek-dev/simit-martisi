// Score flash: steers the gull just beside each obstacle (near miss) and counts the score counter's blue flash.
// v3.10.3-3.13.15 the fitted-score bounce rule swallowed it unnoticed. Usage: PORT=8777 node tests/score-flash.cjs (serve.py running)
const path = require('path'); const NPM = path.join(process.env.APPDATA, 'npm/node_modules');
let pw; for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright')]) { try { pw = require(p); break; } catch (e) {} }
const PORT = +process.env.PORT || 8777;
(async () => {
  const b = await pw.chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.route(/supabase/, r => r.abort());
  await ctx.addInitScript(() => { if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear(); for (const [k, v] of Object.entries({ 'simit-martisi-tut': 'true', 'simit-martisi-reset-2026-10-31': '1', 'simit-martisi-eco-reset-2026-11-09': '1', 'simit-martisi-route': '99' })) localStorage.setItem(k, v); });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/?q=0&net=1`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async () => {
    const g = window.__game, el = document.getElementById('score');
    const ev = { near: 0, dolph: 0, anims: [] };
    new MutationObserver(() => { for (const c of ['near', 'dolph']) if (el.classList.contains(c) && !el['_' + c]) { el['_' + c] = 1; ev[c]++; setTimeout(() => { ev.anims.push(el.getAnimations().map(a => a.animationName).join(',') || '-'); }, 60); } else if (!el.classList.contains(c)) el['_' + c] = 0; }).observe(el, { attributes: true, attributeFilter: ['class'] });
    let flights = 0, p0 = 0;
    for (let f = 0; f < 3; f++) {
      g.startGame(); flights++;
      await new Promise(r => setTimeout(r, 2200));
      const t0 = performance.now();
      while (g.state === 'play' && performance.now() - t0 < 25000) {
        const o = g.obs.sort((a, b) => b.z - a.z)[0];
        if (o) g.setTx(Math.max(-3.8, Math.min(3.8, o.x + (o.x > 0 ? -1 : 1) * (o.hw + 0.55))));
        await new Promise(r => setTimeout(r, 30));
      }
      if (g.state === 'play') { document.getElementById('pauseBtn').click(); document.getElementById('quitBtn').click(); }
      await new Promise(r => setTimeout(r, 1500));
      document.getElementById('homeBtn').click(); await new Promise(r => setTimeout(r, 1200));
      const rs = document.getElementById('recShow'); if (rs && !rs.classList.contains('hidden')) rs.click();
      await new Promise(r => setTimeout(r, 800));
    }
    return { ver: document.querySelector('meta[name=app-version]').content, flights, ...ev, anims: ev.anims.reduce((o, a) => (o[a] = (o[a] || 0) + 1, o), {}) };
  });
  console.log(JSON.stringify(res));
  const nx = res.anims.nearx || 0, dl = res.anims.dolph || 0;
  const pass = res.near >= 5 && nx >= res.near * 0.6 && (res.dolph === 0 || dl >= 1);
  console.log(pass ? `SCORE FLASH OK (near ${nx}/${res.near} flashed blue, dolphin ${dl}/${res.dolph})` : 'SCORE FLASH FAIL: the near-miss/dolphin flash is not playing (another .score rule overrides it?)');
  process.exitCode = pass ? 0 : 1;
  await b.close();
})();
