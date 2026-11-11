// ---------------- şehirler: her biri kendi iskele hattı, rengi ve ufku ----------------
// Sıradaki şehir, öncekinin son iskelesine varınca açılır. Cüzdan her yerde simit; şehir yalnız hattı ve görünümü değiştirir.
// stops: [ad, metre, yönelme hâli ("Konak'a 120 m kaldı"), ilk varışta hediye simit]
// routeKey: varılan en uzak iskele (İstanbul eski anahtarı korur, kayıtlar bozulmasın)
// bait: toplanan yem (simit/gevrek), bridges/maiden: İstanbul'a özgü köprü ve Kız Kulesi, imbat: İzmir'in rüzgâr şeritleri, pirate/falls/beach: Antalya'nın korsan teknesi, Düden şelalesi ve plaj şemsiyeleri
// mult: puan çarpanı (zor şehir biraz daha çok puan; sunucu submit_score aynı çarpanla denetler)
// hard: zorluk basamağı (engeller daha erken sıklaşır, geç oyun tavanı yükselir), hunger: simit yemeden kaç saniyede acıkırsın
// opened: bu şehir açılınca çıkan tebrik, end: son iskeleye varınca yazan cümle, after: kilitliyken menüde yazan cümle, soon: henüz hazır değil (seçicide görünür, açılmaz)
export const CITIES = [
  {
    id: 'istanbul', name: 'İstanbul', mult: 1, hard: 0, hunger: 24, routeKey: 'simit-martisi-route', bait: 'simit', bridges: true, maiden: true, end: 'Boğazı baştan sona uçtun!',
    stops: [['Kadıköy', 0, "Kadıköy'e", 0], ['Karaköy', 400, "Karaköy'e", 25], ['Beşiktaş', 1000, "Beşiktaş'a", 50], ['Ortaköy', 1700, "Ortaköy'e", 75],
      ['Bebek', 2500, "Bebek'e", 125], ['Rumeli Hisarı', 3400, "Rumeli Hisarı'na", 175], ['Emirgan', 4400, "Emirgan'a", 250], ['Sarıyer', 5500, "Sarıyer'e", 350], ['Karadeniz', 6800, "Karadeniz'e", 750]],
  },
  {
    id: 'izmir', name: 'İzmir', mult: 1.1, hard: 1, hunger: 20, opened: 'Tebrikler! İzmir açıldı!', routeKey: 'simit-martisi-route-izmir', bait: 'gevrek', imbat: true, end: 'Körfezi baştan sona uçtun!', after: "İstanbul'u bitirince açılır",
    stops: [['Üçkuyular', 0, "Üçkuyular'a", 0], ['Göztepe', 600, "Göztepe'ye", 40], ['Konak', 1500, "Konak'a", 70], ['Pasaport', 2650, "Pasaport'a", 110],
      ['Alsancak', 3950, "Alsancak'a", 170], ['Bayraklı', 5500, "Bayraklı'ya", 240], ['Karşıyaka', 7300, "Karşıyaka'ya", 340], ['Bostanlı', 10000, "Bostanlı'ya", 1000]],
  },
  {
    id: 'antalya', name: 'Antalya', mult: 1.2, hard: 2, hunger: 17, opened: 'Tebrikler! Antalya açıldı!', routeKey: 'simit-martisi-route-antalya', bait: 'simit', pirate: true, falls: true, beach: true, end: 'Antalya kıyısını baştan sona uçtun!', after: "İzmir'i bitirince açılır",
    stops: [['Konyaaltı', 0, "Konyaaltı'na", 0], ['Kaleiçi', 800, "Kaleiçi'ne", 50], ['Mermerli', 1900, "Mermerli'ye", 90], ['Karaalioğlu', 3300, "Karaalioğlu'na", 140],
      ['Falez', 4900, "Falez'e", 210], ['Lara', 6700, "Lara'ya", 300], ['Düden', 8900, "Düden'e", 420], ['Kundu', 12500, "Kundu'ya", 1500]],
  },
];
export const cityOf = id => CITIES.find(c => c.id === id) || CITIES[0];
