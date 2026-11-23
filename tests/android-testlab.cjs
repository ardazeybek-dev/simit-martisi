// Usage: emulator running + debug APK installed, then node tests/android-testlab.cjs
// Google Play yayın öncesi robotları (Firebase Test Lab, ayar firebase.test.lab=true) sıralamaya hesap açmasın:
// o cihazda uygulama Supabase'e tek istek göndermez; ayar yokken TestLab eklentisi lab:false der.
const { execSync } = require('child_process');
const adb = c => execSync(`adb ${c}`, { encoding: 'utf8' }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PKG = 'com.simitmartisi.game';
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

let ws = null, id = 0; const pend = {};
async function connect() {
  if (ws) try { ws.close(); } catch (e) {}
  ws = null;
  for (let i = 0; i < 30 && !ws; i++) {
    try {
      const pid = adb(`shell pidof ${PKG}`); if (!pid) throw 0;
      adb('forward --remove-all'); adb(`forward tcp:9333 localabstract:webview_devtools_remote_${pid}`);
      const list = await (await fetch('http://localhost:9333/json/list')).json();
      const t = list.find(x => x.type === 'page'); if (!t) throw 0;
      const w = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { w.onopen = res; w.onerror = rej; });
      w.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
      ws = w;
    } catch (e) { await sleep(1500); }
  }
  if (!ws) throw new Error('no webview');
}
const ev = async (fn, arg) => {
  const expr = `(async () => (${fn.toString()})(${JSON.stringify(arg)}))()`;
  const d = await Promise.race([new Promise(r => { const n = ++id; pend[n] = r; ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); }), sleep(8000).then(() => ({}))]);
  if (!d.result) throw new Error('evaluate timeout');
  if (d.result.exceptionDetails) throw new Error(d.result.exceptionDetails.text);
  return d.result.result.value;
};
// sayfa yeniden yüklenmiş/uygulama yeniden açılmış olabilir: bağlantıyı tazeleyerek dene
const evr = async (fn, arg) => { for (let i = 0; ; i++) { try { return await ev(fn, arg); } catch (e) { if (i > 4) throw e; await connect(); await sleep(1000); } } };
const blockNet = () => evr(() => { if (window.__blocked) return; window.__blocked = 1; const f = window.fetch; window.fetch = (u, o) => /supabase/.test(String(u)) ? Promise.reject(new Error('test')) : f(u, o); });
const until = async (fn, ms, arg) => { const t = Date.now(); let v; while (Date.now() - t < ms) { try { if ((v = await ev(fn, arg))) return v; } catch (e) { try { await connect(); } catch (e2) {} } await sleep(700); } return v; };
const launch = async () => { adb(`shell am force-stop ${PKG}`); adb(`shell am start -n ${PKG}/.MainActivity`); await sleep(1500); await connect(); await blockNet(); };
// localStorage diske ~5 sn gecikmeyle yazılır: yazdıktan sonra zorla kapatmak yazılanı kaybettirir → yeniden açılış = sayfa yenileme
const reopen = async () => { await ev(() => { setTimeout(() => location.reload(), 50); return 1; }).catch(() => {}); await sleep(2500); await connect(); await blockNet(); };
const ver = () => evr(() => document.querySelector('meta[name="app-version"]').content);

const sbCount = () => ev(() => performance.getEntriesByType('resource').filter(e => /supabase/.test(e.name)).length);
(async () => {
  adb('shell settings put system firebase.test.lab true');
  adb(`shell am force-stop ${PKG}`); adb(`shell am start -n ${PKG}/.MainActivity`); await sleep(1500); await connect();
  await until(() => window.__game && window.__game.state === 'title', 30000);
  const r1 = await ev(() => window.Capacitor.Plugins.TestLab.get());
  ok(r1 && r1.lab === true, `Test Lab cihazı tanındı (${JSON.stringify(r1)})`);
  // sıralamayı açtır, birkaç saniye bekle: hiçbir istek gitmemeli
  await ev(() => { const b = document.getElementById('boardBtn'); if (b) b.click(); });
  await sleep(6000);
  const st = await ev(() => window.__game.startGame()); await sleep(5000);
  await ev(() => { document.getElementById('pauseBtn').click(); }); await sleep(500);
  await ev(() => { document.getElementById('quitBtn').click(); }); await sleep(4000);
  const n = await sbCount();
  ok(n === 0, `Test Lab cihazında Supabase'e giden istek: ${n}`);
  const t = await ev(() => fetch('https://sznwlsoyssseckgljulb.supabase.co/rest/v1/').then(() => 'gitti', e => 'düştü: ' + e.message));
  ok(/düştü/.test(t), `elle istek de düşüyor (${t})`);
  const other = await ev(() => fetch('https://ardazeybek-dev.github.io/simit-martisi/manifest.webmanifest', { cache: 'no-store' }).then(r => r.status, e => 'ERR ' + e.message));
  ok(other === 200, `başka adreslere (güncelleme bildirimi) istek serbest (${other})`);
  adb('shell settings delete system firebase.test.lab');
  adb(`shell am force-stop ${PKG}`); adb(`shell am start -n ${PKG}/.MainActivity`); await sleep(1500); await connect(); await blockNet();
  const r2 = await until(() => window.Capacitor.Plugins.TestLab.get(), 20000);
  ok(r2 && r2.lab === false && !(await ev(() => window.__testLab)), `normal telefonda lab:false (${JSON.stringify(r2)})`);
  try { ws.close(); } catch (e) {}
  console.log(fails ? `${fails} FAIL` : 'ANDROID TESTLAB OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
