// ---------------- şehirler: her biri kendi iskele hattı, rengi ve ufku ----------------
// Sıradaki şehir, öncekinin son iskelesine varınca açılır. Cüzdan her yerde simit; şehir yalnız hattı ve görünümü değiştirir.
// stops: [ad, metre, yönelme hâli ("Konak'a 120 m kaldı"), ilk varışta hediye simit]
// routeKey: varılan en uzak iskele (İstanbul eski anahtarı korur, kayıtlar bozulmasın)
// bait: toplanan yem (simit/gevrek), bridges/maiden: İstanbul'a özgü köprü ve Kız Kulesi, imbat: İzmir'in rüzgâr şeritleri, pirate/falls: Antalya'nın korsan teknesi ve Düden şelalesi
// end: son iskeleye varınca yazan cümle, after: kilitliyken menüde yazan cümle, soon: henüz hazır değil (seçicide görünür, açılmaz)
export const CITIES = [
  {
    id: 'istanbul', name: 'İstanbul', routeKey: 'simit-martisi-route', bait: 'simit', bridges: true, maiden: true, end: 'Boğazı baştan sona uçtun!',
    stops: [['Kadıköy', 0, "Kadıköy'e", 0], ['Karaköy', 400, "Karaköy'e", 25], ['Beşiktaş', 1000, "Beşiktaş'a", 50], ['Ortaköy', 1700, "Ortaköy'e", 75],
      ['Bebek', 2500, "Bebek'e", 125], ['Rumeli Hisarı', 3400, "Rumeli Hisarı'na", 175], ['Emirgan', 4400, "Emirgan'a", 250], ['Sarıyer', 5500, "Sarıyer'e", 350], ['Karadeniz', 6800, "Karadeniz'e", 750]],
  },
  {
    id: 'izmir', name: 'İzmir', routeKey: 'simit-martisi-route-izmir', bait: 'gevrek', imbat: true, end: 'Körfezi baştan sona uçtun!', after: "İstanbul'u bitirince açılır",
    stops: [['Üçkuyular', 0, "Üçkuyular'a", 0], ['Göztepe', 450, "Göztepe'ye", 40], ['Konak', 1100, "Konak'a", 70], ['Pasaport', 1900, "Pasaport'a", 110],
      ['Alsancak', 2850, "Alsancak'a", 170], ['Bayraklı', 3950, "Bayraklı'ya", 240], ['Karşıyaka', 5250, "Karşıyaka'ya", 340], ['Bostanlı', 7200, "Bostanlı'ya", 1000]],
  },
  {
    id: 'antalya', name: 'Antalya', routeKey: 'simit-martisi-route-antalya', bait: 'simit', pirate: true, falls: true, end: 'Antalya kıyısını baştan sona uçtun!', after: "İzmir'i bitirince açılır",
    stops: [['Konyaaltı', 0, "Konyaaltı'na", 0], ['Kaleiçi', 500, "Kaleiçi'ne", 50], ['Mermerli', 1200, "Mermerli'ye", 90], ['Karaalioğlu', 2050, "Karaalioğlu'na", 140],
      ['Falez', 3050, "Falez'e", 210], ['Lara', 4200, "Lara'ya", 300], ['Düden', 5550, "Düden'e", 420], ['Kundu', 7800, "Kundu'ya", 1500]],
  },
];
export const cityOf = id => CITIES.find(c => c.id === id) || CITIES[0];
