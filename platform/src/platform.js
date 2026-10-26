/* Simit Seagull: portal adapter (ads, gameplay events, language).
   Built by platform/build.py. TARGET is replaced at build time.
   If the portal SDK is missing (adblock, local file, other domain) every call is a no-op
   and the game keeps working. */
(function () {
  'use strict';
  var TARGET = '__TARGET__';          // 'crazygames'
  var MIN_PLAY_BEFORE_AD = 60;        // seconds of real gameplay before the first ad break
  var AD_TIMEOUT = 8000;              // never leave the player stuck if the SDK hangs
  try { var mp = /[?&]pf_minplay=(\d+)/.exec(location.search); if (mp) MIN_PLAY_BEFORE_AD = +mp[1]; } catch (e) {}  // testing only

  // ---------------------------------------------------------------- language
  var EN = {
    // index.html
    'Martı ısınıyor…': 'Warming up the seagull…', 'Martısı': 'Seagull', 'Vapurların kralı sensin': 'King of the ferries',
    'Dokun ve başla': 'Tap to start', 'Simitleri kap': 'Grab the simits',
    'Bacalara, direklere, martılara çarpma': 'Dodge funnels, masts and other gulls',
    'kombo': 'combo', 'Parmağını sağa sola kaydır': 'Slide your finger left and right',
    'Martı parmağını takip eder': 'The seagull follows your finger',
    'Duraklatıldı': 'Paused', 'Devam et': 'Resume', 'Ses efektleri': 'Sound effects', 'Müzik': 'Music',
    'Titreşim': 'Vibration', 'Ana menü': 'Main menu', 'Ayarlar': 'Settings', 'Tamam': 'OK',
    'Bilgisayarda: fare ya da ← → ile yönlendir, P duraklat, M sesi kapat.': 'On desktop: steer with the mouse or ← →, P to pause, M to mute.',
    'Pat!': 'Bonk!', 'Puan': 'Score', 'Yeni rekor!': 'New best!', 'simit': 'simits', 'mesafe': 'distance',
    'en iyi seri': 'best streak', 'Tekrar uç': 'Fly again', 'Duraklat': 'Pause', 'Sesi aç/kapat': 'Sound on/off',
    'Oyun yüklenemedi. Bağlantını kontrol edip sayfayı yenile.': 'The game could not load. Check your connection and reload the page.',
    // main.js, models.js
    'Rekor': 'Best', 'İlk uçuşun!': 'Your first flight!', 'Önceki rekoru geçtin': 'You beat your best', 'altın': 'gold',
    'Kalkan!': 'Shield!', 'Martı kavgası!': 'Gull fight!', 'Uçurtmaya dolandın!': 'Tangled in a kite!',
    'Bacaya çarptın!': 'Hit a funnel!', 'Direğe çarptın!': 'Hit a mast!', 'Öhö öhö!': 'Cough cough!', 'Kıl payı!': 'Close call!',
    'Mıknatıs': 'Magnet', 'Kalkan': 'Shield', '2x Puan': '2x Points',
    'Simidim!': 'My simit!', 'Hoop!': 'Hey!', 'Yaa!': 'Aww!', 'Martıya bak!': 'Look at that gull!', 'Bırak onu!': 'Drop it!',
    'Ah simidim…': 'Oh, my simit…', 'Oha!': 'Whoa!', 'Kaçtı!': 'It got away!', 'Hayırdır?': 'Excuse me?',
    'İkinci şans': 'Second chance', 'İkinci şans!': 'Second chance!', 'Reklam izle, devam et': 'Watch an ad to continue',
    'Reklam şu an yok, sonra tekrar dene': 'No ad available right now, try again later',
    'Kostümler': 'Outfits', 'Cüzdan': 'Wallet', 'Giy': 'Wear', 'Giyili': 'Wearing', 'Yeterli simit yok': 'Not enough simits',
    'Simitler cüzdanına girer; onlarla martına kostüm al.': 'Every simit you catch goes into your wallet. Spend them on outfits.',
    'Fes': 'Fez', 'Güneş gözlüğü': 'Sunglasses', 'Atkı': 'Scarf', 'Kaptan şapkası': 'Captain hat', 'Altın taç': 'Golden crown'
  };
  var lang = 'en';
  try { var l = (navigator.languages && navigator.languages[0]) || navigator.language || ''; if (/^tr\b/i.test(l)) lang = 'tr'; } catch (e) {}
  function t(s) { return lang === 'en' && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s; }

  function translateDom() {
    document.documentElement.lang = lang;
    document.documentElement.classList.add('pf-ads');   // shows the video icon on the rewarded button
    if (lang !== 'en') { document.title = 'Simit Martısı'; return; }
    document.title = 'Simit Seagull';
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n; while ((n = walker.nextNode())) { var s = n.nodeValue.trim(); if (s && EN[s]) n.nodeValue = n.nodeValue.replace(s, EN[s]); }
    document.querySelectorAll('[aria-label]').forEach(function (el) { var a = el.getAttribute('aria-label'); if (EN[a]) el.setAttribute('aria-label', EN[a]); });
  }

  // ---------------------------------------------------------------- state
  var game = null;           // { mute(bool), pauseInput(bool) } set by main.js
  var sdkMuted = false, inAd = false, playing = false, playSeconds = 0, playFrom = 0;
  var cg = null, adDone = null, adTimer = 0;
  var rwDone = null, rwOk = false, offered = false;   // rewarded ad state, kept apart from the midgame break

  function setAdMute(on) { inAd = on; if (game) game.mute(on || sdkMuted); }

  // ---------------------------------------------------------------- CrazyGames SDK v3
  // docs.crazygames.com/sdk/game/ , docs.crazygames.com/sdk/video-ads/
  function initCrazy() {
    var SDK = window.CrazyGames && window.CrazyGames.SDK;
    if (!SDK) return Promise.resolve();
    return Promise.resolve(SDK.init()).then(function () {
      cg = SDK;
      if (playing) { try { SDK.game.gameplayStart(); } catch (e) {} }   // player started before init finished
      try {
        if (SDK.game.settings && SDK.game.settings.muteAudio) { sdkMuted = true; if (game) game.mute(true); }
        SDK.game.addSettingsChangeListener(function (s) { sdkMuted = !!(s && s.muteAudio); if (game) game.mute(inAd || sdkMuted); });
      } catch (e) {}
    }).catch(function (e) { cg = null; console.warn('[portal] CrazyGames SDK unavailable', e); });
  }

  // ---------------------------------------------------------------- ad break
  function finishAd() {
    clearTimeout(adTimer);
    if (game) game.pauseInput(false);
    setAdMute(false);
    var cb = adDone; adDone = null; if (cb) cb();
  }
  function adBreak(then) {
    then = then || function () {};
    if (adDone || rwDone) return;                         // already waiting for one
    // a rewarded "continue" was offered on this game-over screen: no midgame ad on top of it
    if (offered) { offered = false; then(); return; }
    if (playSeconds < MIN_PLAY_BEFORE_AD) { then(); return; }
    if (TARGET === 'crazygames' && cg && cg.environment !== 'disabled') {
      adDone = then; if (game) game.pauseInput(true);
      adTimer = setTimeout(finishAd, AD_TIMEOUT);
      try {
        cg.ad.requestAd('midgame', {
          adStarted: function () { clearTimeout(adTimer); setAdMute(true); },
          adFinished: function () { finishAd(); },
          adError: function () { finishAd(); }
        });
      } catch (e) { finishAd(); }
      return;
    }
    then();
  }

  // ---------------------------------------------------------------- rewarded ad
  // The reward is granted only when the ad was watched to the end (adFinished).
  // Errors, no fill and timeouts give nothing.
  function canReward() { return TARGET === 'crazygames' && !!(cg && cg.environment !== 'disabled'); }
  function finishReward() {
    clearTimeout(adTimer);
    if (game) game.pauseInput(false);
    setAdMute(false);
    var cb = rwDone, ok = rwOk; rwDone = null; rwOk = false;
    if (cb) cb(ok);
  }
  function rewarded(cb) {
    offered = false;
    if (rwDone || adDone) return;
    if (!canReward()) { cb(false); return; }
    rwDone = cb; rwOk = false; if (game) game.pauseInput(true);
    adTimer = setTimeout(finishReward, AD_TIMEOUT);
    try {
      cg.ad.requestAd('rewarded', {
        adStarted: function () { clearTimeout(adTimer); setAdMute(true); },
        adFinished: function () { rwOk = true; finishReward(); },
        adError: function () { finishReward(); }
      });
    } catch (e) { finishReward(); }
  }

  // ---------------------------------------------------------------- gameplay events
  function gameplayStart() {
    if (playing) return; playing = true; playFrom = performance.now();
    try { if (cg) cg.game.gameplayStart(); } catch (e) {}
  }
  function gameplayStop() {
    if (!playing) return; playing = false; playSeconds += (performance.now() - playFrom) / 1000;
    try { if (cg) cg.game.gameplayStop(); } catch (e) {}
  }
  function happy() { try { if (cg) cg.game.happytime(); } catch (e) {} }

  var ready = TARGET === 'crazygames' ? initCrazy() : Promise.resolve();
  ready.then(function () { try { if (cg) cg.game.loadingStart(); } catch (e) {} });

  window.PF = {
    target: TARGET, t: t, get lang() { return lang; }, get inAd() { return inAd; }, get playing() { return playing; },
    get sdkMuted() { return sdkMuted; }, get playSeconds() { return playSeconds; },
    bind: function (g) { game = g; if (sdkMuted) g.mute(true); },
    loaded: function () { ready.then(function () { try { if (cg) cg.game.loadingStop(); } catch (e) {} }); },
    gameplayStart: gameplayStart, gameplayStop: gameplayStop, adBreak: adBreak, happy: happy,
    canReward: canReward, rewarded: rewarded, offerReward: function () { offered = true; },
    translateDom: translateDom
  };
})();
