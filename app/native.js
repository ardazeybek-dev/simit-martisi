/* Simit Martısı: store app glue (Capacitor). Copied into www by app/build.py; the web version never loads it.
   Android back button: pause in flight, close the open panel/map/wardrobe, otherwise send the app to the background.
   Leaving the app (home button, call) pauses the flight even if the WebView skips visibilitychange. */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  // Titreşim: iOS WebView'da navigator.vibrate yok, Android'de uygulamanın VIBRATE izni yoktu → oyunun tüm vibrate() çağrıları
  // (çarpma, simit, altın, rüzgâr…) Haptics eklentisine gider. Desen [açık, kapalı, açık…] sırayla çalınır.
  var H = (C.Plugins && C.Plugins.Haptics) || (C.registerPlugin && C.registerPlugin('Haptics'));
  if (H) {
    var ios = C.getPlatform && C.getPlatform() === 'ios';
    var buzz = function (ms) {
      if (ios) H.impact({ style: ms < 20 ? 'LIGHT' : ms < 45 ? 'MEDIUM' : 'HEAVY' }).catch(function () {});
      else H.vibrate({ duration: Math.min(ms, 400) }).catch(function () {});
    };
    try {
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: function (p) {
        var a = Array.isArray(p) ? p : [p], at = 0;
        for (var i = 0; i < a.length; i++) {
          var ms = +a[i] || 0;
          if (i % 2 === 0 && ms > 0) { if (at) setTimeout(buzz, at, ms); else buzz(ms); }
          at += ms;
        }
        return true;
      } });
    } catch (e) {}
  }
  // Paylaş: Android WebView'de navigator.share yok (oyun panoya kopyalıyordu). Share eklentisine yönlendirilir;
  // puan kartı PNG'si önce Filesystem ile önbelleğe yazılır, sonra dosya olarak paylaşılır. İptal/hata oyunda sessizce yutulur.
  var reg = function (n) { return (C.Plugins && C.Plugins[n]) || (C.registerPlugin && C.registerPlugin(n)); };
  var Sh = reg('Share'), FS = reg('Filesystem');
  if (Sh) {
    var b64 = function (blob) {
      return new Promise(function (ok, no) {
        var r = new FileReader();
        r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
        r.onerror = no; r.readAsDataURL(blob);
      });
    };
    try {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: function (d) { return !d || !d.files || !!FS; } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: function (d) {
        d = d || {};
        var f = d.files && d.files[0];
        var plain = function () { return Sh.share({ title: d.title, text: d.text, url: d.url, dialogTitle: d.title }); };
        if (!f || !FS) return plain();
        return b64(f).then(function (data) {
          return FS.writeFile({ path: f.name || 'paylas.png', data: data, directory: 'CACHE' });
        }).then(function (w) {
          return Sh.share({ files: [w.uri], text: d.text, dialogTitle: d.title });
        }, function () { return plain(); }); // dosya yazılamazsa: metin + link
      } });
    } catch (e) {}
  }
  // Google Play yayın öncesi test robotları (Firebase Test Lab) sıralamaya "Martı ####" hesabı açıyordu:
  // o cihazda sıralama sunucusuna giden her istek, sanki bağlantı yokmuş gibi düşer. Eski kabukta eklenti yoksa dokunmaz.
  var TL = C.Plugins && C.Plugins.TestLab;
  if (TL && TL.get) {
    var lab = TL.get().then(function (r) { return !!(r && r.lab); }, function () { return false; });
    var f0 = window.fetch.bind(window);
    window.fetch = function (u, o) {
      if (!/supabase\.co\//.test(String(u && u.url || u))) return f0(u, o);
      return lab.then(function (isLab) { return isLab ? Promise.reject(new TypeError('test lab: offline')) : f0(u, o); });
    };
    lab.then(function (isLab) { if (isLab) window.__testLab = true; });
  }
  ota(reg('CapacitorUpdater'), reg('App'), C.getPlatform && C.getPlatform());
  var App = (C.Plugins && C.Plugins.App) || (C.registerPlugin && C.registerPlugin('App')); // paketsiz sayfada native köprünün vekili
  if (!App) return;
  var G = function () { return window.__game; };
  var esc = function () { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); };

  App.addListener('backButton', function () {
    var g = G();
    if (!g) return;
    if (g.state === 'play' || g.state === 'countdown') { esc(); return; }        // uçuşta: duraklat
    if (g.mapView && g.mapView.on) { esc(); return; }                            // harita
    if (g.busy) {                                                                // açık panel ya da gardırop
      var open = document.querySelector('#shopAsk:not(.hidden) #shopNo') ||      // satın alma onayı: önce o kapanır
        document.querySelector('.modal:not(.hidden) [id^="close"], .modal:not(.hidden) #skipName, #giftPanel:not(.hidden) #giftTake'); // hediye: Al
      if (open) open.click(); else esc();
      return;
    }
    if (g.state === 'paused') return;                                            // duraklatma menüsü kendi düğmeleriyle
    App.minimizeApp();                                                           // ana menü / oyun sonu: uygulama arka plana
  });

  App.addListener('appStateChange', function (s) {
    var g = G();
    if (!s.isActive && g && (g.state === 'play' || g.state === 'countdown')) g.pause();
  });
})();

/* Uygulama içi güncelleme (oyun dosyaları, mağazasız). app/ota.py yeni sürümün zip'ini GitHub Releases'e koyar,
   docs/app-update.json'u yazar: { version, url, checksum, minNative, store }.
   - Açılışta oyun yüklenince notifyAppReady: yüklenemeyen (bozuk) paket 30 sn içinde kendiliğinden eskisine döner.
   - Menüde dururken bildirime bakar; daha yeni sürüm varsa arka planda indirir, next() ile sıraya koyar:
     uygulama arka plana gidip dönünce ya da yeniden açılınca yeni sürüm gelir (uçuş asla kesilmez).
   - Paket yerel kabuğun desteklemediği bir sürüm isterse (minNative > versionCode) yalnız menüde "Güncelle" kartı → mağaza.
   - Geri alınan sürüm bir daha indirilmez. Capgo sunucusuna hiçbir şey gitmez (capacitor.config: statsUrl/updateUrl boş). */
function ota(U, App, platform) {
  if (!U || !App) return;
  var SITE = 'https://ardazeybek-dev.github.io/simit-martisi/';
  var OK_URL = /^https:\/\/(ardazeybek-dev\.github\.io\/simit-martisi\/|github\.com\/ardazeybek-dev\/simit-martisi\/releases\/download\/)/;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
             set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} } };
  var meta = document.querySelector('meta[name="app-version"]');
  var cur = meta ? meta.content : '0';
  var newer = function (a, b) { // a > b ?
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (+x[i] || 0) - (+y[i] || 0); if (d) return d > 0; }
    return false;
  };
  // önceki açılışta sıraya konan sürüm gelmediyse geri alınmıştır: bir daha deneme
  // (bozuk paketin native.js'i de çalışır: işaret ancak oyun gerçekten açılınca silinir, yoksa geri dönüşte yakalanır)
  var pend = ls.get('otaPending');
  if (pend && pend !== cur) { ls.set('otaBad', pend); ls.set('otaPending', null); }
  var G = function () { return window.__game; };
  var t0 = Date.now(), readyTimer = setInterval(function () {
    if (G()) { clearInterval(readyTimer); U.notifyAppReady().catch(function () {}); if (ls.get('otaPending') === cur) ls.set('otaPending', null); setTimeout(tidy, 2000); setTimeout(check, 4000); }
    else if (Date.now() - t0 > 60000) clearInterval(readyTimer);
  }, 250);

  var card = null, storeUrl = '', busy = false, lastCheck = 0;
  var showCard = function (on) {
    if (on && !card) {
      card = document.createElement('a');
      card.id = 'otaCard'; card.target = '_blank'; card.rel = 'noopener';
      card.textContent = /^tr/i.test(navigator.language || '') ? '⬆️ Yeni sürüm var · Güncelle' : '⬆️ New version · Update';
      card.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom));z-index:60;' +
        'background:#ffc23a;color:#1b1838;font:800 15px "Baloo 2",Arial,sans-serif;padding:8px 16px;border-radius:999px;text-decoration:none;' +
        'box-shadow:0 3px 10px rgba(0,0,0,.35);white-space:nowrap;display:none';
      document.body.appendChild(card);
    }
    if (card) { card.href = storeUrl; card.style.display = on ? 'block' : 'none'; }
  };
  setInterval(function () { // kart yalnız ana menüde, panel kapalıyken
    if (!storeUrl) return;
    var g = G(); showCard(!!g && g.state === 'title' && !g.busy && !(g.mapView && g.mapView.on));
  }, 700);

  // eski ve geri alınmış paketleri sil (her biri birkaç MB): yalnız çalışan ve daha yeni (sıradaki) kalır
  function tidy() {
    U.current().then(function (c) {
      return U.list().then(function (l) {
        (l.bundles || []).forEach(function (b) {
          if (b.id !== c.bundle.id && (!newer(b.version, cur) || b.version === ls.get('otaBad'))) U.delete({ id: b.id }).catch(function () {});
        });
      });
    }).catch(function () {});
  }
  function check() {
    var g = G();
    if (busy || !g) return;
    if (g.state !== 'title') { setTimeout(check, 5000); return; } // uçuşta ağ/disk işi yok
    busy = true; lastCheck = Date.now();
    var inline = ls.get('otaManifestJson'), src = ls.get('otaManifest');
    var get = inline ? Promise.resolve(JSON.parse(inline))
      : fetch((src && OK_URL.test(src) ? src : SITE + 'app-update.json') + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
    Promise.all([get, App.getInfo()]).then(function (a) {
      var m = a[0] || {}, build = +a[1].build || 0;
      if (!m.version || !newer(m.version, cur) || !OK_URL.test(m.url || '')) return;
      if (m.minNative && build < m.minNative) { // oyun dosyaları yeni yerel kabuk istiyor: mağazaya yönlendir
        storeUrl = (m.store && m.store[platform]) || ''; return;
      }
      if (ls.get('otaBad') === m.version) return;
      return U.download({ url: m.url, version: m.version, checksum: m.checksum }).then(function (b) {
        return U.next({ id: b.id }).then(function () { ls.set('otaPending', m.version); });
      });
    }).catch(function () {}).then(function () { busy = false; });
  }
  // uzun süre arka planda kalıp dönünce yeniden bak (en çok saatte bir)
  App.addListener('appStateChange', function (s) { if (s.isActive && Date.now() - lastCheck > 3600e3) check(); });
}
