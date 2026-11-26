/* Simit Seagull: portal adapter (ads, gameplay events, language).
   Built by platform/build.py. TARGET is replaced at build time.
   If the portal SDK is missing (adblock, local file, other domain) every call is a no-op
   and the game keeps working. */
(function () {
  'use strict';
  var TARGET = '__TARGET__';          // 'crazygames'
  // CrazyGames allows no ads in Basic launch: build without --ads hides the rewarded button and skips ad breaks
  var ADS = '__ADS__' === 'on';
  var MIN_PLAY_BEFORE_AD = 60;        // seconds of real gameplay before the first ad break
  var AD_TIMEOUT = 8000;              // never leave the player stuck if the SDK hangs
  try { var mp = /[?&]pf_minplay=(\d+)/.exec(location.search); if (mp) MIN_PLAY_BEFORE_AD = +mp[1]; } catch (e) {}  // testing only

  // ---------------------------------------------------------------- language
  // texts live in js/i18n.js (window.I18N, loaded before this file), shared with the web version
  var I18N = window.I18N;
  function t(s) { return I18N.t(s); }
  function translateDom() {
    I18N.translateDom();
    document.documentElement.classList.add('pf-ads');   // shows the video icon on the rewarded button
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
    if (!ADS) { then(); return; }
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
  function canReward() { return ADS && TARGET === 'crazygames' && !!(cg && cg.environment !== 'disabled'); }
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

  // ---------------------------------------------------------------- progress save
  // docs.crazygames.com/sdk/data/ : the save lives in the SDK Data module (guests: the SDK keeps it locally,
  // logged-in players: on their CrazyGames account). Same calls as localStorage; the module has no key list,
  // so the adapter keeps one (util.js walks the keys for its one-time save clean-ups).
  var LANG_KEY = 'simit-martisi-settings';   // i18n.js reads the language from localStorage before the SDK is up
  var storage = null;
  function dataStore(d) {
    var IDX = '__pfKeys', keys = [];
    try { keys = JSON.parse(d.getItem(IDX) || '[]') || []; } catch (e) { keys = []; }
    function saveKeys() { d.setItem(IDX, JSON.stringify(keys)); }
    var s = {
      getItem: function (k) { var v = d.getItem(k); return v === undefined ? null : v; },
      setItem: function (k, v) {
        v = String(v); d.setItem(k, v);
        if (keys.indexOf(k) < 0) { keys.push(k); saveKeys(); }
        if (k === LANG_KEY) try { localStorage.setItem(k, v); } catch (e) {}
      },
      removeItem: function (k) { d.removeItem(k); var i = keys.indexOf(k); if (i >= 0) { keys.splice(i, 1); saveKeys(); } },
      key: function (i) { return i >= 0 && i < keys.length ? keys[i] : null; },
      clear: function () { d.clear(); keys = []; },
      get length() { return keys.length; },
      sdk: true
    };
    // first run with the Data module: bring over a save this browser already has (docs: copy existing localStorage keys)
    if (!keys.length) {
      try {
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('simit-martisi') === 0) s.setItem(k, localStorage.getItem(k)); }
      } catch (e) {}
    }
    return s;
  }
  function pickStorage() {
    try {
      var d = cg && cg.data;
      if (d && typeof d.getItem === 'function') { d.getItem('__pfKeys'); storage = dataStore(d); return; }
    } catch (e) { console.warn('[portal] Data module unavailable, saving locally', e); }
    storage = null;   // util.js falls back to localStorage
  }

  // the game waits for this before loading (index.html): the SDK preloads the save during init.
  // A hung SDK must not keep the player on the loading screen.
  var ready = (TARGET === 'crazygames' ? Promise.race([initCrazy(), new Promise(function (r) { setTimeout(r, 8000); })]) : Promise.resolve())
    .then(pickStorage);
  ready.then(function () { try { if (cg) cg.game.loadingStart(); } catch (e) {} });

  window.PF = {
    target: TARGET, t: t, get lang() { return I18N.lang; }, get inAd() { return inAd; }, get playing() { return playing; },
    get sdkMuted() { return sdkMuted; }, get playSeconds() { return playSeconds; },
    ready: ready, get storage() { return storage; },
    bind: function (g) { game = g; if (sdkMuted) g.mute(true); },
    loaded: function () { ready.then(function () { try { if (cg) cg.game.loadingStop(); } catch (e) {} }); },
    gameplayStart: gameplayStart, gameplayStop: gameplayStop, adBreak: adBreak, happy: happy,
    canReward: canReward, rewarded: rewarded, offerReward: function () { offered = true; },
    translateDom: translateDom
  };
})();
