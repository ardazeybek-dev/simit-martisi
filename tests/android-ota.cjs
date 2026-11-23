// Usage: emulator running + debug APK installed, test bundles published with app/ota.py --test, then
//   OTA_GOOD='<manifest json>' OTA_BAD='<broken manifest json>' node tests/android-ota.cjs
// Uygulama içi güncelleme: yeni sürüm iner, arka plana gidip dönünce gelir, oyuncu kaydı (localStorage) aynen kalır;
// bozuk paket (main.js açılışta çöker) kendiliğinden eski sürüme döner ve bir daha indirilmez; Capgo sunucusuna istek yok.
const { execSync } = require('child_process');
const adb = c => execSync(`adb ${c}`, { encoding: 'utf8' }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PKG = 'com.simitmartisi.game';
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const GOOD = JSON.parse(process.env.OTA_GOOD), BAD = JSON.parse(process.env.OTA_BAD);

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
const snap = () => evr(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^(ota|CapacitorUpdater)/.test(k)) o[k] = localStorage.getItem(k); } return o; });
const homeAndBack = async () => { adb('shell input keyevent 3'); await sleep(3000); adb(`shell am start -n ${PKG}/.MainActivity`); await sleep(2500); await connect(); await blockNet(); };

(async () => {
  adb('logcat -c');
  await launch();
  await until(() => window.__game && window.__game.state === 'title', 30000);
  await evr(() => window.Capacitor.Plugins.CapacitorUpdater.reset()).catch(() => {}); // önceki testten kalan paket varsa yerleşiğe dön
  await sleep(3000); await connect(); await blockNet();
  await until(() => window.__game && window.Capacitor.Plugins.CapacitorUpdater.current().then(c => c.bundle.id === 'builtin'), 30000);
  const v0 = await ver();
  console.log('     built-in version', v0);
  // oyuncu kaydı: belirgin bir anahtar ekle, tamamının kopyasını al
  await evr(() => { localStorage.setItem('zzOtaProbe', 'kayit-' + 12345); for (const k of ['otaBad', 'otaPending']) localStorage.removeItem(k); });
  const before = await snap();
  await evr(m => localStorage.setItem('otaManifestJson', m), JSON.stringify(GOOD));

  // 1) yeni sürüm: açılışta iner, sıraya girer; uçuşu kesmez
  await reopen();
  const p = await until(() => localStorage.getItem('otaPending'), 90000);
  ok(p === GOOD.version, `yeni sürüm indi ve sıraya girdi (otaPending=${p})`);
  ok((await ver()) === v0, 'indirme sırasında oyun yeniden yüklenmedi (sürüm hâlâ ' + v0 + ')');
  await homeAndBack();
  let v1 = await until(() => window.__game && document.querySelector('meta[name="app-version"]').content, 30000);
  ok(v1 === GOOD.version, `arka plandan dönünce yeni sürüm çalışıyor (${v1})`);
  const after = await snap();
  const lost = Object.keys(before).filter(k => after[k] !== before[k]);
  ok(Object.keys(before).length > 3 && !lost.length && after.zzOtaProbe === 'kayit-12345', `oyuncu kaydı aynen duruyor (${Object.keys(before).length} anahtar, değişen: ${lost.join(',') || 'yok'})`);
  await sleep(5000);
  ok(!(await evr(() => localStorage.getItem('otaPending'))), 'yeni sürüm notifyAppReady ile onaylandı (bekleyen yok)');

  // 2) bozuk paket: main.js açılışta çöker → 30 sn içinde kendiliğinden geri döner, bir daha indirilmez
  await evr(m => localStorage.setItem('otaManifestJson', m), JSON.stringify(BAD));
  await reopen();
  const pb = await until(() => localStorage.getItem('otaPending'), 90000);
  ok(pb === BAD.version, `bozuk paket indi (otaPending=${pb})`);
  await homeAndBack();
  console.log('     bozuk paket açıldı, geri alınması bekleniyor (≤ 45 sn)…');
  const back = await until(v => { const m = document.querySelector('meta[name="app-version"]'); return window.__game && m && m.content !== v && m.content; }, 60000, BAD.version);
  ok(back && back !== BAD.version, `bozuk paketten kendiliğinden döndü (şimdi ${back})`);
  const bad = await until(() => localStorage.getItem('otaBad'), 15000);
  ok(bad === BAD.version, `bozuk sürüm kara listede (otaBad=${bad})`);
  const after2 = await snap();
  ok(after2.zzOtaProbe === 'kayit-12345', 'geri dönüşten sonra da kayıt duruyor');
  await reopen(); await sleep(9000);
  ok(!(await evr(() => localStorage.getItem('otaPending'))), 'yeniden açılışta bozuk sürüm tekrar indirilmedi');

  // 2b) yeni sürüm yeni yerel kabuk istiyorsa (minNative > versionCode): indirmez, menüde mağaza kartı gösterir
  await evr(m => { localStorage.setItem('otaManifestJson', m); localStorage.removeItem('otaBad'); }, JSON.stringify({ ...GOOD, version: '3.13.200', minNative: 99999999 }));
  await reopen();
  await until(() => window.__game && window.__game.state === 'title', 20000);
  for (let i = 0; i < 6 && await evr(() => window.__game.busy); i++) { adb('shell input keyevent 4'); await sleep(900); } // açılış panelleri (günlük ödül) kapansın
  const cardOk = await until(() => { const c = document.getElementById('otaCard'); return c && c.style.display === 'block' && c.href; }, 20000);
  ok(/play\.google\.com\/store\/apps\/details\?id=com\.simitmartisi\.game/.test(cardOk || ''), `eski kabukta menüde "Güncelle" kartı → Play Store (${cardOk})`);
  ok(!(await evr(() => localStorage.getItem('otaPending'))), 'eski kabukta yeni paket indirilmedi');
  await evr(() => window.__game.startGame()); await sleep(2500);
  ok(await evr(() => document.getElementById('otaCard').style.display === 'none'), 'uçuşta kart görünmüyor');
  await evr(() => { const g = window.__game; g.pause && g.pause(); });

  // 3) Capgo sunucusuna istek yok
  const log = adb('logcat -d');
  ok(!/capgo\.app/.test(log), 'logcat: capgo.app adresine istek yok');

  // temizlik: test bildirimi ve paketleri sil, yerleşik sürüme dön
  await evr(() => { for (const k of ['otaManifestJson', 'otaBad', 'otaPending', 'zzOtaProbe']) localStorage.removeItem(k); });
  await evr(() => window.Capacitor.Plugins.CapacitorUpdater.reset()).catch(() => {});
  await sleep(3000); await connect();
  await until(v => window.__game && document.querySelector('meta[name="app-version"]').content === v, 30000, v0);
  await sleep(4000);
  const left = await evr(() => window.Capacitor.Plugins.CapacitorUpdater.list().then(l => l.bundles.map(b => b.version)));
  ok(left.length <= 1, `eski paketler silindi (telefonda kalan: ${left.join(',') || 'yok'})`);
  ok((await ver()) === v0, `temizlik: yerleşik sürüme dönüldü (${await ver()})`);
  try { ws.close(); } catch (e) {}
  console.log(fails ? `${fails} FAIL` : 'ANDROID OTA OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
