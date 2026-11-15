/* Simit Martısı: store app glue (Capacitor). Copied into www by app/build.py; the web version never loads it.
   Android back button: pause in flight, close the open panel/map/wardrobe, otherwise send the app to the background.
   Leaving the app (home button, call) pauses the flight even if the WebView skips visibilitychange. */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
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
      var open = document.querySelector('.modal:not(.hidden) [id^="close"], .modal:not(.hidden) #skipName');
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
