// Usage: emulator running + debug APK installed (see README), then node tests/android-notch.cjs
// çentik öykünmesini (tall) açar; WebView'da env(safe-area-inset-top) çentik kadar mı ve üstteki
// düğmeler çentiğin altında mı bakar; bitince öykünmeyi kapatır
const { execSync } = require('child_process');
const adb = c => execSync(`adb ${c}`, { encoding: 'utf8' }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const PKG = 'com.simitmartisi.game';

async function connect() {
  const pid = adb(`shell pidof ${PKG}`);
  adb('forward --remove-all'); adb(`forward tcp:9333 localabstract:webview_devtools_remote_${pid}`);
  let ws, id = 0; const pend = {};
  for (let i = 0; i < 15 && !ws; i++) {
    try {
      const t = (await (await fetch('http://localhost:9333/json/list')).json()).find(x => x.type === 'page'); if (!t) throw 0;
      ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    } catch (e) { ws = null; await sleep(2000); }
  }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  const ev = async (fn, arg) => {
    const expr = `(async () => (${fn.toString()})(${JSON.stringify(arg)}))()`;
    const d = await new Promise(r => { const n = ++id; pend[n] = r; ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
    if (d.result && d.result.exceptionDetails) throw new Error(d.result.exceptionDetails.text);
    return d.result.result.value;
  };
  return { ev, close: () => ws.close() };
}

(async () => {
  adb('shell cmd overlay enable com.android.internal.display.cutout.emulation.tall'); await sleep(2500);
  try {
    const cut = adb('shell dumpsys display').match(/DisplayCutout\{insets=Rect\(\d+, (\d+)/);
    const density = Number(adb('shell wm density').match(/(\d+)\s*$/)[1]) / 160;
    const cutCss = cut ? Number(cut[1]) / density : 0;
    adb('logcat -c');
    adb(`shell am force-stop ${PKG}`); adb(`shell am start -n ${PKG}/.MainActivity`); await sleep(6000);
    const { ev, close } = await connect();
    await ev(() => { const f = window.fetch; window.fetch = (u, o) => /supabase/.test(String(u)) ? Promise.reject(new Error('test')) : f(u, o); });
    for (let i = 0; i < 40 && !(await ev(() => window.__game && window.__game.state === 'title')); i++) await sleep(500);
    const m = await ev(() => {
      const p = document.createElement('div'); p.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px)'; document.body.appendChild(p);
      const sat = p.getBoundingClientRect().height; p.remove();
      const ua = navigator.userAgent.match(/Chrome\/(\d+)/);
      // görünür, en üstteki etkileşimli öğe
      let topMost = null;
      for (const e of document.querySelectorAll('button, .hud, [id$="Btn"]')) {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        if (r.width && r.height && cs.visibility !== 'hidden' && cs.display !== 'none' && (!topMost || r.top < topMost.top)) topMost = { id: e.id || e.className, top: r.top };
      }
      return { sat, webview: ua && +ua[1], innerH: innerHeight, topMost };
    });
    console.log('çentik', cutCss.toFixed(0) + 'px css, ölçülen', JSON.stringify(m));
    // WebView >= 140 çentiği env() ile verir; eskisinde Capacitor içeriği çentiğin altına iter (env = 0) — ikisi de doğru
    ok(m.webview >= 140 ? Math.abs(m.sat - cutCss) <= 2 : m.sat === 0, `env(safe-area-inset-top) = ${m.sat} (WebView ${m.webview})`);
    ok(m.topMost && m.topMost.top >= (m.webview >= 140 ? cutCss : 0) - 1, `en üstteki düğme çentiğin altında (${m.topMost && m.topMost.id} @ ${m.topMost && m.topMost.top.toFixed(0)})`);
    await ev(() => window.__game.startGame()); await sleep(3000);
    const pause = await ev(() => { const e = document.getElementById('pauseBtn'); if (!e) return null; const r = e.getBoundingClientRect(); return r.height ? r.top : null; });
    if (pause !== null) ok(pause >= (m.webview >= 140 ? cutCss : 0) - 1, `uçuşta duraklat düğmesi çentiğin altında (top ${pause.toFixed(0)})`);
    const err = adb('logcat -d -s Capacitor/Console:*').split('\n').filter(l => /safe area/i.test(l));
    // Capacitor, sayfa yüklenmeden --safe-area-inset-* yazmaya çalışınca bu hatayı basar; o değişkenleri kullanmıyoruz
    if (err.length) console.log('NOT  zararsız Capacitor uyarısı:', err[0].replace(/^.*Msg: /, ''));
    close();
  } finally {
    adb('shell cmd overlay disable com.android.internal.display.cutout.emulation.tall');
  }
  console.log(fails ? `${fails} FAIL` : 'NOTCH OK'); process.exit(fails ? 1 : 0);
})().catch(e => { try { adb('shell cmd overlay disable com.android.internal.display.cutout.emulation.tall'); } catch (_) {} console.error(e); process.exit(1); });
