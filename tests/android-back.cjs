// Usage: emulator running + debug APK installed (see README), then node tests/android-back.cjs
// emülatörde gerçek geri tuşu (adb keyevent 4) + uygulamaya dönüş; durumu WebView'dan (CDP) okur
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
  const st = () => page.evaluate(() => window.__game.state);
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
  const fg = () => /simitmartisi/.test(adb('shell dumpsys activity activities | grep -m1 -E "topResumedActivity|mResumedActivity"'));
  // açılışta çıkan panelleri (günlük ödül vb.) geri tuşuyla kapat
  for (let i = 0; i < 4 && await page.evaluate(() => window.__game.busy); i++) await back();
  ok(!(await page.evaluate(() => window.__game.busy)), 'açılış panelleri geri tuşuyla kapandı');

  // 1) panel: başarımlar açılır, geri tuşu kapatır, uygulama önde kalır
  await page.evaluate(() => document.getElementById('achBtn') ? document.getElementById('achBtn').click() : null);
  await sleep(700);
  const achOpen = await vis('#achPanel');
  await back();
  ok(achOpen && !(await vis('#achPanel')) && fg(), `panel geri tuşuyla kapandı, uygulama önde (açıldı: ${achOpen})`);

  // 2) uçuşta geri tuşu → duraklat; duraklatmada geri tuşu bir şey yapmaz
  await page.evaluate(() => window.__game.startGame()); await sleep(4500);
  const s0 = await st(); await back(); const s1 = await st();
  ok(s0 === 'play' && s1 === 'paused', `uçuşta geri tuşu duraklattı (${s0} → ${s1})`);
  await back(); ok((await st()) === 'paused' && fg(), 'duraklatmadayken geri tuşu uygulamayı kapatmadı');

  // 3) ana ekran tuşu uçuşu durdurur
  await page.evaluate(() => window.__game.resume()); await page.waitForFunction(() => window.__game.state === 'play');
  const s2 = await st(); adb('shell input keyevent 3');
  let s3; for (let i = 0; i < 8 && (s3 = await st()) !== 'paused'; i++) await sleep(500);
  ok(s2 === 'play' && s3 === 'paused', `ana ekran tuşuyla uçuş durdu (${s2} → ${s3})`);
  adb('shell am start -n com.simitmartisi.game/.MainActivity'); await sleep(2000);

  // 4) ana menüde geri tuşu uygulamayı arka plana alır (kapatmaz)
  await page.evaluate(() => window.__game.showTitle()); await sleep(1500);
  for (let i = 0; i < 3 && await page.evaluate(() => window.__game.busy); i++) await back();
  const t = await st(); await back(); await sleep(800);
  const alive = adb('shell pidof com.simitmartisi.game') === pid;
  ok(t === 'title' && !fg() && alive, `ana menüde geri tuşu arka plana aldı, süreç yaşıyor (${t}, önde: ${fg()}, canlı: ${alive})`);

  ws.close();
  console.log(fails ? `BACK FAIL (${fails})` : 'BACK OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(2); });
