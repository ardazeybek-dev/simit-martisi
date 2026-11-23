// Usage: emulator running + debug APK installed (see README), then node tests/android-share.cjs
// uygulamada Paylaş: navigator.share Share eklentisine gider, puan kartı dosya olarak, link sitenin adresi; Android seçicisi açılır
const path = require('path'), { execSync } = require('child_process');
const NPM = path.join(process.env.APPDATA, 'npm/node_modules');
let playwright; for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright')]) { try { playwright = require(p); break; } catch (e) {} }
const adb = c => execSync(`adb ${c}`, { encoding: 'utf8' }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const back = async () => { adb('shell input keyevent 4'); await sleep(900); };

(async () => {
  adb('shell am force-stop com.simitmartisi.game');
  adb('shell am start -n com.simitmartisi.game/.MainActivity'); await sleep(6000);
  const pid = adb('shell pidof com.simitmartisi.game');
  adb('forward --remove-all'); adb(`forward tcp:9333 localabstract:webview_devtools_remote_${pid}`);
  let ws, id = 0; const pend = {};
  for (let i = 0; i < 15 && !ws; i++) {
    try {
      const list = await (await fetch('http://localhost:9333/json/list')).json();
      const t = list.find(x => x.type === 'page'); if (!t) throw 0;
      ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    } catch (e) { ws = null; await sleep(2000); }
  }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  const ev = async (fn, arg) => {
    const expr = `(async () => (${fn.toString()})(${JSON.stringify(arg)}))()`;
    const d = await new Promise(r => { const n = ++id; pend[n] = r; ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
    if (d.result && d.result.exceptionDetails) throw new Error(d.result.exceptionDetails.text + ' ' + JSON.stringify(d.result.exceptionDetails.exception && d.result.exceptionDetails.exception.description));
    return d.result.result.value;
  };
  // sıralamaya test oyuncusu düşmesin: fetch'e supabase isteğini reddettir
  await ev(() => { const f = window.fetch; window.fetch = (u, o) => /supabase/.test(String(u)) ? Promise.reject(new Error('test')) : f(u, o); });
  const page = { evaluate: ev, waitForFunction: async (fn) => { for (let i = 0; i < 60; i++) { if (await ev(fn)) return; await sleep(500); } throw new Error('timeout'); } };
  await page.waitForFunction(() => window.__game && window.__game.state === 'title');

  const chooser = () => /Chooser|ResolverActivity|sharesheet/i.test(adb('shell dumpsys window | grep mCurrentFocus'));
  for (let i = 0; i < 4 && await page.evaluate(() => window.__game.busy); i++) await back();
  ok(await page.evaluate(() => typeof navigator.share === 'function' && navigator.canShare({ files: [new File(['x'], 'a.png')] })), 'navigator.share var (eklentiye bağlı)');
  // eklentiye giden çağrıyı kaydet (asıl paylaşım yine çalışır)
  await page.evaluate(() => { const S = window.Capacitor.Plugins.Share, o = S.share.bind(S); window.__shares = []; S.share = a => { window.__shares.push(JSON.parse(JSON.stringify(a))); return o(a); }; });
  // 1) uçuş → bitir → oyun sonu Paylaş
  await page.evaluate(() => window.__game.startGame()); await sleep(5000);
  await page.evaluate(() => { document.getElementById('pauseBtn').click(); }); await sleep(600);
  await page.evaluate(() => { document.getElementById('quitBtn').click(); }); await sleep(1500);
  await page.evaluate(() => document.getElementById('shareBtn').click());
  let open = false; for (let i = 0; i < 12 && !(open = chooser()); i++) await sleep(500);
  const a = (await page.evaluate(() => window.__shares))[0] || {};
  console.log('     ', JSON.stringify(a).slice(0, 220));
  ok(open, 'Paylaş: Android paylaşım seçicisi açıldı');
  ok(a.files && /^file:.*\.png$/.test(a.files[0]), 'puan kartı PNG dosya olarak gitti');
  ok(/https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.simitmartisi\.game$/.test(a.text || '') && !/localhost/.test(JSON.stringify(a)), 'link Google Play sayfası (localhost değil)');
  await back(); await sleep(800);
  ok(!chooser() && /simitmartisi/.test(adb('shell dumpsys window | grep mCurrentFocus')), 'seçiciden geri: oyuna dönüldü, hata yok');
  // 2) sıralama daveti: metin + link
  await page.evaluate(() => document.getElementById('inviteBtn').click());
  open = false; for (let i = 0; i < 12 && !(open = chooser()); i++) await sleep(500);
  const b = (await page.evaluate(() => window.__shares))[1] || {};
  console.log('     ', JSON.stringify(b).slice(0, 220));
  ok(open && b.url === 'https://play.google.com/store/apps/details?id=com.simitmartisi.game', 'Davet: seçici açıldı, link Google Play');
  await back();
  ws.close(); console.log(fails ? `${fails} FAIL` : 'ANDROID SHARE OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
