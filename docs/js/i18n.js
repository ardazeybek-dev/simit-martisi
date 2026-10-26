/* Simit Martısı: dil tablosu. Klasik betik (modül değil): main.js'ten ve portal kopyasındaki platform.js'ten önce yüklenir.
   Kaynak dil Türkçe; metnin kendisi anahtardır. Tabloda olmayan metin Türkçe kalır.
   Dil: Ayarlar'da seçilen (localStorage), seçilmemişse tarayıcı dili (tr → Türkçe, diğerleri → İngilizce). */
(function () {
  'use strict';
  var EN = {
    // index.html
    'Martı ısınıyor…': 'Warming up the seagull…', 'Martısı': 'Seagull', 'Simitleri kap': 'Grab the simits',
    'Bacalara, direklere, martılara çarpma': 'Dodge funnels, masts and other gulls',
    'kombo': 'combo', 'Parmağını sağa sola kaydır': 'Slide your finger left and right',
    'Martı parmağını takip eder': 'The seagull follows your finger',
    'Duraklatıldı': 'Paused', 'Devam et': 'Resume', 'Ses efektleri': 'Sound effects', 'Müzik': 'Music',
    'Titreşim': 'Vibration', 'Ana menü': 'Main menu', 'Ayarlar': 'Settings', 'Tamam': 'OK', 'Dil': 'Language', 'Güçlendir': 'Power-ups', 'sn': 's', 'Tam': 'Max', 'Güçlendirmeler daha uzun sürer.': 'Your power-ups now last longer.', 'Simitle güçlendirmeleri yükselt: her seviye süreyi uzatır.': 'Upgrade power-ups with simits: every level makes them last longer.', 'Kamera': 'Camera', 'Yakın': 'Close', 'Uzak': 'Far', 'Kuş bakışı': 'Bird\'s eye', 'Martı gözü': 'Gull\'s eye',
    'Bilgisayarda: fare ya da ← → ile yönlendir, P duraklat, M sesi kapat.': 'On desktop: steer with the mouse or ← →, P to pause, M to mute.',
    'Pat!': 'Bonk!', 'Puan': 'Score', 'Yeni rekor!': 'New best!', 'simit': 'simits', 'mesafe': 'distance',
    'en iyi seri': 'best streak', 'Tekrar uç': 'Fly again', 'Duraklat': 'Pause', 'Sesi aç/kapat': 'Sound on/off',
    'Paylaş': 'Share', 'Kopyalandı': 'Copied',
    'Oyun yüklenemedi. Bağlantını kontrol edip sayfayı yenile.': 'The game could not load. Check your connection and reload the page.',
    // main.js, models.js
    'Rekor': 'Best', 'İlk uçuşun!': 'Your first flight!', 'Önceki rekoru geçtin': 'You beat your best', 'altın': 'gold',
    'Kalkan!': 'Shield!', 'Martı kavgası!': 'Gull fight!', 'Uçurtmaya dolandın!': 'Tangled in a kite!',
    'Bacaya çarptın!': 'Hit a funnel!', 'Direğe çarptın!': 'Hit a mast!', 'Öhö öhö!': 'Cough cough!', 'Kıl payı!': 'Close call!', 'Yunus!': 'Dolphin!', 'Köprü altı!': 'Under the bridge!', 'Oltaya takıldın!': 'Hooked on a fishing line!', 'Bir uçuşta {n} yunusun üstünden geç': 'Fly over {n} dolphins in one flight',
    'Mıknatıs': 'Magnet', 'Kalkan': 'Shield', '2x Puan': '2x Points',
    'Simidim!': 'My simit!', 'Hoop!': 'Hey!', 'Yaa!': 'Aww!', 'Martıya bak!': 'Look at that gull!', 'Bırak onu!': 'Drop it!',
    'Ah simidim…': 'Oh, my simit…', 'Oha!': 'Whoa!', 'Kaçtı!': 'It got away!', 'Hayırdır?': 'Excuse me?', 'Afiyet olsun!': 'Enjoy!', 'Al bakalım!': 'Here you go!', 'Hadi gel!': 'Come on, take it!',
    'İkinci şans': 'Second chance', 'İkinci şans!': 'Second chance!', 'Reklam izle, devam et': 'Watch an ad to continue',
    'Reklam şu an yok, sonra tekrar dene': 'No ad available right now, try again later',
    'Kostümler': 'Outfits', 'Cüzdan': 'Wallet', 'Giy': 'Wear', 'Giyili': 'Wearing', 'Yeterli simit yok': 'Not enough simits',
    'Simitler cüzdanına girer; onlarla martına kostüm al.': 'Every simit you catch goes into your wallet. Spend them on outfits.',
    'Fes': 'Fez', 'Güneş gözlüğü': 'Sunglasses', 'Atkı': 'Scarf', 'Kaptan şapkası': 'Captain hat', 'Altın taç': 'Golden crown', 'Bıyık': 'Moustache', 'Pembe tüy': 'Pink feathers', 'Gece martısı': 'Night gull', 'Altın martı': 'Golden gull',
    'Görevler': 'Missions', 'Görev tamam!': 'Mission complete!', 'Oyna': 'Play', 'Yelkene takıldın!': 'Caught in a sail!', 'Cama çarptın!': 'Hit the glass!', 'ya da ekrana dokun': 'or tap the screen',
    'Günlük ödül': 'Daily reward', 'Gün': 'Day', 'Al': 'Claim', 'Görevi bitirince simitler hemen cüzdanına girer.': 'Finish a mission and the simits go straight to your wallet.',
    'Her gün uğra, ödül büyüsün. Bir gün kaçırırsan baştan başlar.': 'Come back every day and the reward grows. Miss a day and it starts over.',
    'Bugünün ödülünü aldın. Yarın yine gel!': 'You got today\'s reward. Come back tomorrow!',
    'Bir uçuşta {n} simit kap': 'Catch {n} simits in one flight', 'Bir uçuşta {n} kez kıl payı geç': 'Get {n} close calls in one flight',
    'Bir uçuşta {n} altın simit kap': 'Catch {n} golden simits in one flight', 'Bir uçuşta {n} m uç': 'Fly {n} m in one flight',
    '{n} simitlik seri yap': 'Make a {n} simit streak', 'Bir uçuşta {n} güçlendirme topla': 'Pick up {n} power-ups in one flight',
    'Bir uçuşta yolcuların elinden {n} simit kap': 'Snatch {n} simits from passengers in one flight',
    'Bir uçuşta {n} puan yap': 'Score {n} points in one flight', '{n} kez uç': 'Fly {n} times', 'Toplam {n} simit topla': 'Collect {n} simits in total',
    'VİRAJ': 'TURN', 'Kusursuz viraj!': 'Perfect turn!', 'Güzel viraj': 'Nice turn', 'Hızlanıyor!': 'Speed up!', 'Rüzgâr!': 'Gust!', 'Dondun!': 'Frozen!', 'Üşüyorsun!': 'Freezing!', 'Bir uçuşta {n} kusursuz viraj al': 'Take {n} perfect turns in one flight',
    'Simit Martısı\'nda {s} puan yaptım, {n} simit kaptım! Sen kaç yaparsın?': 'I scored {s} points and snatched {n} simits in Simit Seagull! Can you beat it?'
  };
  var TABLES = { en: EN };
  var KEY = 'simit-martisi-settings';
  var lang = 'en';
  try { var l = (navigator.languages && navigator.languages[0]) || navigator.language || ''; if (/^tr\b/i.test(l)) lang = 'tr'; } catch (e) {}
  try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (s && (s.lang === 'tr' || TABLES[s.lang])) lang = s.lang; } catch (e) {}

  function t(s) { var T = TABLES[lang]; return T && Object.prototype.hasOwnProperty.call(T, s) ? T[s] : s; }

  // sabit HTML metinleri bir kez, sayfa açılırken çevrilir
  var translated = false;
  function translateDom() {
    if (translated) return; translated = true;
    document.documentElement.lang = lang;
    if (lang === 'tr') return;
    document.title = 'Simit Seagull';
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n; while ((n = walker.nextNode())) { var s = n.nodeValue.trim(); if (s && t(s) !== s) n.nodeValue = n.nodeValue.replace(s, t(s)); }
    document.querySelectorAll('[aria-label]').forEach(function (el) { var a = el.getAttribute('aria-label'); if (t(a) !== a) el.setAttribute('aria-label', t(a)); });
  }

  window.I18N = { get lang() { return lang; }, langs: ['tr'].concat(Object.keys(TABLES)), t: t, translateDom: translateDom };
})();
