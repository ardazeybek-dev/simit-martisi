// ---------------- şehirler: her biri kendi iskele hattı, rengi ve ufku ----------------
// Sıradaki şehir, öncekinin son iskelesine varınca açılır. Cüzdan her yerde simit; şehir yalnız hattı ve görünümü değiştirir.
// stops: [ad, metre, yönelme hâli ("Konak'a 120 m kaldı"), ilk varışta hediye simit]
// routeKey: varılan en uzak iskele (İstanbul eski anahtarı korur, kayıtlar bozulmasın). was: v3.3 öncesi iskeleler [ad, metre]; kayıtlı sıra numarası bir kez ada göre yeni hatta taşınır.
// Son iskele adı aynı kalmalı: eskiden bitiren yine bitirmiş sayılır, sonraki şehir kilitlenmez
// bait: toplanan yem (simit/gevrek), bridges/maiden: İstanbul'a özgü köprü ve Kız Kulesi, imbat/balloons/regatta/flamingo: İzmir'in rüzgâr şeritleri, Kordon balonları, yelken yarışı ve Kuş Cenneti flamingoları, pirate/falls/beach/parasail: Antalya'nın korsan teknesi, Düden şelalesi, plaj şemsiyeleri ve paraşüt teknesi,
// balloons+marina/caretta/yamac/ari: Muğla'nın özgün parçaları (Bodrum marinasında balonlar, Dalyan kaplumbağaları, Ölüdeniz yamaç paraşütü, çam balı arıları); oldK: aşağıdaki kopya kalıpların aralığı çarpanı (seyrek gelsinler)
// mill/gulet/diver/cup: Muğla'nın yel değirmeni rüzgârı (imbat kalıbı), Mavi Yolculuk guleti (korsan kalıbı), sünger dalgıcı kabarcıkları (şelale kalıbı) ve Bodrum Cup (yelken yarışı kalıbı)
// kopru/truva/akinti/feribot: Çanakkale'nin 1915 Köprüsü (Galata kalıbı), Truva Atı (sabit kapı), Boğaz akıntısı (imbat kalıbı, ortada yön değiştirir) ve Kilitbahir feribotu (korsan kalıbı)
// hamsi/dalga/teleferik/horon: Trabzon'un hamsi sürüsü (zıplayan balık kalıbı), Karadeniz dalgası (korsan kalıbı), Boztepe teleferiği (paraşüt kalıbı) ve horon teknesi (plaj kalıbı)
// mavna/ucak/kule: Rize'nin çay mavnası (korsan kalıbı, çuval yığınları), kalkan uçağın jet rüzgârı (imbat kalıbı, uçak şeride kuyruk verip gaz açar, sonra kalkar)
// ve çay bardağı kule (Düden kalıbının yeni hâli: LED halkası bardağı tırmanınca buhar fışkırır ve martıyı kaldırır; ışık zamanlamayı söyler)
// kale/sutun/narenciye: Mersin'in Kızkalesi (Truva kalıbı: iki kemerli kapı, avluda altın), devrilen Soli sütunları (paraşüt ipi kalıbı: devrilme martının varışına göre)
// ve narenciye teknesi (plaj renk zinciri kalıbı: portakal, limon, mandalina)
// rivK: özel parçalar açık suyun yerini aldığı için kalan açık suya eklenen rakip olasılığı (yoksa 0)
// wx: hava çarpanları [açık, yağmur, sis, kar] (yoksa mevsim olasılığı aynen; 0 = o hava bu şehirde hiç çıkmaz)
// rainK: yağmur yoğunluğu (damla sayısı ve sudaki halkalar; 1 = olağan, en çok 1,5)
// mult: puan çarpanı (zor şehir biraz daha çok puan; sunucu submit_score aynı çarpanla denetler)
// hard: zorluk basamağı (engeller daha erken sıklaşır, geç oyun tavanı yükselir), hunger: simit yemeden kaç saniyede acıkırsın (simit %25, altın %60 doldurur)
// opened: bu şehir açılınca çıkan tebrik, end: son iskeleye varınca yazan cümle, after: kilitliyken menüde yazan cümle, soon: henüz hazır değil (seçicide görünür, açılmaz)
export const CITIES = [
  {
    id: 'istanbul', name: 'İstanbul', mult: 1, hard: 0, hunger: 7, routeKey: 'simit-martisi-route', bait: 'simit', bridges: true, maiden: true, end: 'Boğazı baştan sona uçtun!',
    stops: [['Kadıköy', 0, "Kadıköy'e", 0], ['Karaköy', 350, "Karaköy'e", 25], ['Beşiktaş', 900, "Beşiktaş'a", 50], ['Ortaköy', 1500, "Ortaköy'e", 75],
      ['Arnavutköy', 2200, "Arnavutköy'e", 100], ['Bebek', 2900, "Bebek'e", 125], ['Rumeli Hisarı', 3700, "Rumeli Hisarı'na", 150], ['Emirgan', 4450, "Emirgan'a", 200],
      ['İstinye', 5250, "İstinye'ye", 225], ['Yeniköy', 5950, "Yeniköy'e", 250], ['Tarabya', 6650, "Tarabya'ya", 300], ['Sarıyer', 7350, "Sarıyer'e", 350], ['Karadeniz', 8150, "Karadeniz'e", 750]],
    was: [['Kadıköy', 0], ['Karaköy', 400], ['Beşiktaş', 1000], ['Ortaköy', 1700], ['Bebek', 2500], ['Rumeli Hisarı', 3400], ['Emirgan', 4400], ['Sarıyer', 5500], ['Karadeniz', 6800]],
  },
  {
    id: 'izmir', name: 'İzmir', mult: 1.1, hard: 1, hunger: 6.5, opened: 'Tebrikler! İzmir açıldı!', routeKey: 'simit-martisi-route-izmir', bait: 'gevrek', wx: [1, 1, 1, 0], rivK: 0.55, imbat: true, balloons: true, regatta: true, flamingo: true, end: 'Körfezi baştan sona uçtun!', after: "İstanbul'u bitirince açılır",
    stops: [['Üçkuyular', 0, "Üçkuyular'a", 0], ['Güzelyalı', 550, "Güzelyalı'ya", 40], ['Göztepe', 1150, "Göztepe'ye", 60], ['Konak', 1850, "Konak'a", 80],
      ['Pasaport', 2650, "Pasaport'a", 100], ['Kordon', 3400, "Kordon'a", 130], ['Alsancak', 4300, "Alsancak'a", 160], ['Bayraklı', 5350, "Bayraklı'ya", 200],
      ['Turan', 6400, "Turan'a", 240], ['Alaybey', 7550, "Alaybey'e", 280], ['Karşıyaka', 8750, "Karşıyaka'ya", 340], ['Bostanlı', 10500, "Bostanlı'ya", 1000]],
    was: [['Üçkuyular', 0], ['Göztepe', 600], ['Konak', 1500], ['Pasaport', 2650], ['Alsancak', 3950], ['Bayraklı', 5500], ['Karşıyaka', 7300], ['Bostanlı', 10000]],
  },
  {
    id: 'antalya', name: 'Antalya', mult: 1.2, hard: 2, hunger: 6, opened: 'Tebrikler! Antalya açıldı!', routeKey: 'simit-martisi-route-antalya', bait: 'simit', rivK: 0.4, pirate: true, falls: true, beach: true, parasail: true, end: 'Antalya kıyısını baştan sona uçtun!', after: "İzmir'i bitirince açılır",
    stops: [['Konyaaltı', 0, "Konyaaltı'na", 0], ['Atatürk Parkı', 600, "Atatürk Parkı'na", 45], ['Kaleiçi', 1300, "Kaleiçi'ne", 65], ['Mermerli', 2100, "Mermerli'ye", 90],
      ['Hıdırlık', 3000, "Hıdırlık'a", 115], ['Karaalioğlu', 3950, "Karaalioğlu'na", 145], ['Falez', 5000, "Falez'e", 180], ['Şirinyalı', 6150, "Şirinyalı'ya", 220],
      ['Lara', 7350, "Lara'ya", 270], ['Düden', 8650, "Düden'e", 330], ['Güzeloba', 10500, "Güzeloba'ya", 420], ['Kundu', 13150, "Kundu'ya", 1500]],
    was: [['Konyaaltı', 0], ['Kaleiçi', 800], ['Mermerli', 1900], ['Karaalioğlu', 3300], ['Falez', 4900], ['Lara', 6700], ['Düden', 8900], ['Kundu', 12500]],
  },
  {
    id: 'mugla', name: 'Muğla', mult: 1.3, hard: 2.4, hunger: 5.7, rivK: 0.4, opened: 'Tebrikler! Muğla açıldı!', routeKey: 'simit-martisi-route-mugla', bait: 'simit', mill: true, gulet: true, diver: true, cup: true, balloons: true, marina: true, caretta: true, yamac: true, ari: true, oldK: 1.6, end: 'Bodrum yarımadasını baştan sona uçtun!', after: "Antalya'yı bitirince açılır",
    stops: [['Bodrum', 0, "Bodrum'a", 0], ['Kumbahçe', 600, "Kumbahçe'ye", 50], ['Torba', 1300, "Torba'ya", 70], ['Gündoğan', 2100, "Gündoğan'a", 95],
      ['Türkbükü', 3000, "Türkbükü'ne", 120], ['Gölköy', 3950, "Gölköy'e", 150], ['Yalıkavak', 5000, "Yalıkavak'a", 190], ['Gümüşlük', 6150, "Gümüşlük'e", 230],
      ['Turgutreis', 7350, "Turgutreis'e", 280], ['Akyarlar', 8750, "Akyarlar'a", 340], ['Bitez', 10750, "Bitez'e", 440], ['Gümbet', 13550, "Gümbet'e", 1600]],
  },
  {
    id: 'canakkale', name: 'Çanakkale', mult: 1.4, hard: 2.8, hunger: 5.4, rivK: 0.4, opened: 'Tebrikler! Çanakkale açıldı!', routeKey: 'simit-martisi-route-canakkale', bait: 'simit', kopru: true, truva: true, akinti: true, feribot: true, end: 'Çanakkale Boğazını baştan sona uçtun!', after: "Muğla'yı bitirince açılır",
    stops: [['Lapseki', 0, "Lapseki'ye", 0], ['Umurbey', 600, "Umurbey'e", 55], ['Köprübaşı', 1300, "Köprübaşı'na", 75], ['Kordon', 2100, "Kordon'a", 100],
      ['Saat Kulesi', 3000, "Saat Kulesi'ne", 130], ['Kilitbahir', 3950, "Kilitbahir'e", 160], ['Kepez', 5000, "Kepez'e", 200], ['İntepe', 6200, "İntepe'ye", 245],
      ['Dardanos', 7450, "Dardanos'a", 295], ['Kumkale', 8950, "Kumkale'ye", 360], ['Seddülbahir', 11050, "Seddülbahir'e", 460], ['Truva', 14000, "Truva'ya", 1700]],
  },
  {
    id: 'trabzon', name: 'Trabzon', mult: 1.5, hard: 3.2, hunger: 5.1, rivK: 0.4, wx: [0.45, 4, 0.9, 0], rainK: 1.2, opened: 'Tebrikler! Trabzon açıldı!', routeKey: 'simit-martisi-route-trabzon', bait: 'simit', hamsi: true, dalga: true, teleferik: true, horon: true, end: 'Trabzon kıyısını baştan sona uçtun!', after: "Çanakkale'yi bitirince açılır",
    stops: [['Akçaabat', 0, "Akçaabat'a", 0], ['Söğütlü', 600, "Söğütlü'ye", 60], ['Kaşüstü', 1300, "Kaşüstü'ne", 80], ['Ganita', 2100, "Ganita'ya", 105],
      ['Meydan', 3000, "Meydan'a", 135], ['Boztepe', 4050, "Boztepe'ye", 170], ['Değirmendere', 5100, "Değirmendere'ye", 210], ['Moloz', 6200, "Moloz'a", 255],
      ['Yomra', 7550, "Yomra'ya", 310], ['Arsin', 9000, "Arsin'e", 380], ['Araklı', 11200, "Araklı'ya", 480], ['Sürmene', 14450, "Sürmene'ye", 1800]],
  },
  {
    id: 'samsun', name: 'Samsun', mult: 1.6, hard: 3.6, hunger: 4.8, rivK: 0.4, opened: 'Tebrikler! Samsun açıldı!', routeKey: 'simit-martisi-route-samsun', bait: 'simit', bandirma: true, delta: true, irmak: true, vinc: true, end: 'Samsun kıyısını baştan sona uçtun!', after: "Trabzon'u bitirince açılır",
    stops: [['Bafra', 0, "Bafra'ya", 0], ['Kızılırmak', 600, "Kızılırmak'a", 65], ['Engiz', 1300, "Engiz'e", 85], ['Kurupelit', 2100, "Kurupelit'e", 110],
      ['Atakum', 3000, "Atakum'a", 140], ['Amisos', 4050, "Amisos'a", 175], ['Saathane', 5100, "Saathane'ye", 220], ['Batıpark', 6300, "Batıpark'a", 265],
      ['Doğupark', 7600, "Doğupark'a", 320], ['Tekkeköy', 9200, "Tekkeköy'e", 395], ['Çarşamba', 11400, "Çarşamba'ya", 500], ['Terme', 14900, "Terme'ye", 1900]],
  },
  {
    id: 'rize', name: 'Rize', mult: 1.7, hard: 4.0, hunger: 4.6, rivK: 1, wx: [0.2, 6, 0.6, 0], rainK: 1.5, opened: 'Tebrikler! Rize açıldı!', routeKey: 'simit-martisi-route-rize', bait: 'simit', mavna: true, ucak: true, kule: true, end: 'Rize kıyısını baştan sona uçtun!', after: "Samsun'u bitirince açılır",
    stops: [['İyidere', 0, "İyidere'ye", 0], ['Derepazarı', 600, "Derepazarı'na", 65], ['Fener', 1300, "Fener'e", 90], ['Rize Kalesi', 2100, "Rize Kalesi'ne", 115],
      ['Ziraat', 3000, "Ziraat'e", 145], ['Gündoğdu', 4100, "Gündoğdu'ya", 180], ['Çayeli', 5250, "Çayeli'ne", 225], ['Madenli', 6500, "Madenli'ye", 270],
      ['Pazar', 7900, "Pazar'a", 330], ['Yeşilköy', 9450, "Yeşilköy'e", 405], ['Ardeşen', 11800, "Ardeşen'e", 510], ['Fındıklı', 15300, "Fındıklı'ya", 2000]],
  },
  {
    id: 'mersin', name: 'Mersin', mult: 1.8, hard: 4.4, hunger: 4.4, rivK: 0.4, wx: [1.4, 0.6, 0.5, 0], opened: 'Tebrikler! Mersin açıldı!', routeKey: 'simit-martisi-route-mersin', bait: 'simit', kale: true, sutun: true, narenciye: true, end: 'Mersin kıyısını baştan sona uçtun!', after: "Rize'yi bitirince açılır",
    stops: [['Mersin Limanı', 0, "Mersin Limanı'na", 0], ['Kültür Parkı', 600, "Kültür Parkı'na", 70], ['Marina', 1300, "Marina'ya", 95], ['Yenişehir', 2100, "Yenişehir'e", 120],
      ['Mezitli', 3000, "Mezitli'ye", 150], ['Soli', 4100, "Soli'ye", 185], ['Tece', 5250, "Tece'ye", 230], ['Davultepe', 6500, "Davultepe'ye", 280],
      ['Tömük', 7900, "Tömük'e", 340], ['Erdemli', 9450, "Erdemli'ye", 415], ['Ayaş', 11800, "Ayaş'a", 520], ['Kızkalesi', 15750, "Kızkalesi'ne", 2100]],
  },
];
export const cityOf = id => CITIES.find(c => c.id === id) || CITIES[0];
