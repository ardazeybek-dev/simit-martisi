// Usage: node tests/clock.cjs  (serve.py running; PORT=8765 to change)
// v3.11.1 saat düzeltmelerini gerçek tarayıcıda dener: sunucu saati (Date başlığı) gerçek, telefon saati kaydırılmış
const path = require('path');
const NPM = path.join(process.env.APPDATA, 'npm/node_modules');
let playwright; for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright')]) { try { playwright = require(p); break; } catch (e) {} }
const URL = `http://localhost:${+process.env.PORT || 8777}/?q=0&net=1`;
const D = 864e5, REAL = Date.now();
const key = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

async function run(browser, { phoneOffset, seed }) {
  const ctx = await browser.newContext();
  // sahte sunucu: her RPC gerçek saati Date başlığıyla döner; daily peek "hazır" der
  await ctx.route('**/rest/v1/rpc/**', r => {
    const fn = r.request().url().split('/').pop();
    const body = fn === 'daily' ? { ready: true, streak: 1, n: 1, lost: 0 } : fn === 'fish_day' ? 0 : {};
    r.fulfill({ status: 200, contentType: 'application/json', headers: { Date: new Date().toUTCString(), 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Date' }, body: JSON.stringify(body) });
  });
  await ctx.addInitScript(([off, seed]) => {
    // telefon saati: Date kaydırılır (window.__off ile sonradan da oynatılır); performance.now window.__freeze ile durdurulabilir
    window.__off = off; const RD = Date, rnow = RD.now.bind(RD);
    class FD extends RD { constructor(...a) { a.length ? super(...a) : super(rnow() + window.__off); } static now() { return rnow() + window.__off; } }
    window.Date = FD;
    const pn = performance.now.bind(performance); let frozen = null, base = 0;
    window.__freeze = on => { if (on) frozen = pn() - base; else { base = pn() - frozen; frozen = null; } };
    performance.now = () => frozen !== null ? frozen : pn() - base;
    if (seed && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('simit-martisi-reset-2026-10-31', '1'); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v)); }
  }, [phoneOffset, seed || null]);
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 30000 });
  await page.waitForTimeout(1500); // peek + fixFuture
  return { ctx, page };
}

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, args: ['--mute-audio'] });
  const today = key(REAL), tomorrow = key(REAL + D);

  // 1) saat yanlışlıkla 30 gün ileri kurulmuş, o tarihle kaydedilmiş günlük haklar: sunucu saati gelince yarına çekilmeli
  const far = key(REAL + 30 * D);
  let { ctx, page } = await run(browser, { phoneOffset: 0, seed: { 'simit-martisi-freespin': far, 'simit-martisi-daily': { last: far, streak: 3 }, 'simit-martisi-dayrun': { day: far } } });
  let ls = await page.evaluate(() => ({ fs: JSON.parse(localStorage.getItem('simit-martisi-freespin')), d: JSON.parse(localStorage.getItem('simit-martisi-daily')), r: JSON.parse(localStorage.getItem('simit-martisi-dayrun')) }));
  ok(ls.fs === tomorrow, `30 gün ileri kayıtlı bedava çark yarına çekildi (${ls.fs}, beklenen ${tomorrow})`);
  ok(ls.r.day === tomorrow, `günün uçuşu yarına çekildi (${ls.r.day})`);
  ok(ls.d.last === today || ls.d.last === tomorrow, `günlük ödül kaydı kilitli kalmadı (${ls.d.last})`);
  await ctx.close();

  // 2) telefon saati 1 gün ileri, dün bedava çark kullanılmış: sunucu saatine göre hak yine bugünün → yenilenmemeli
  ({ ctx, page } = await run(browser, { phoneOffset: D, seed: { 'simit-martisi-freespin': today } }));
  let r = await page.evaluate(async () => { const n = await import('./js/net.js'); return { now: n.nowMs() }; });
  ok(key(r.now) === today, `saat 1 gün ileriyken oyunun "bugün"ü sunucununki (${key(r.now)})`);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('simit-martisi-freespin'))) === today, 'bugün kullanılmış bedava çark kaydı korunuyor (hak yenilenmedi)');
  // giriş serisi: saati ileri alınca ziyaret günü bugünden ileri yazılmamalı
  const visit = await page.evaluate(() => JSON.parse(localStorage.getItem('simit-martisi-visit') || 'null'));
  ok(!visit || visit.last === today, `giriş günü sunucu gününe yazıldı (${visit && visit.last})`);
  await ctx.close();

  // 3) uyku: performance.now durur, telefon saati 10 saat ilerler → oyunun saati de ilerlemeli
  ({ ctx, page } = await run(browser, { phoneOffset: 0 }));
  r = await page.evaluate(async () => {
    const n = await import('./js/net.js'); const a = n.nowMs();
    window.__freeze(true); window.__off += 10 * 3600e3; const b = n.nowMs(); window.__freeze(false);
    return (b - a) / 3600e3;
  });
  ok(r > 9.9 && r < 10.1, `uyku sonrası oyun saati ${r.toFixed(2)} saat ilerledi`);
  await ctx.close();

  await browser.close();
  console.log(fails ? `CLOCK FAIL (${fails})` : 'CLOCK OK');
  process.exit(fails ? 1 : 0);
})();
