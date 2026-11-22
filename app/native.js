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
