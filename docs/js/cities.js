// ---------------- şehirler: her biri kendi iskele hattı, rengi ve ufku ----------------
// Sıradaki şehir, öncekinin son iskelesine varınca açılır. Cüzdan her yerde simit; şehir yalnız hattı ve görünümü değiştirir.
// stops: [ad, metre, yönelme hâli ("Konak'a 120 m kaldı"), ilk varışta hediye simit]
// routeKey: varılan en uzak iskele (İstanbul eski anahtarı korur, kayıtlar bozulmasın). was: v3.3 öncesi iskele adları; kayıtlı sıra numarası bir kez ada göre yeni hatta taşınır.
// Son iskele adı aynı kalmalı: eskiden bitiren yine bitirmiş sayılır, sonraki şehir kilitlenmez
// bait: toplanan yem (simit/gevrek), bridges/maiden: İstanbul'a özgü köprü ve Kız Kulesi, imbat/balloons/regatta/flamingo: İzmir'in rüzgâr şeritleri, Kordon balonları, yelken yarışı ve Kuş Cenneti flamingoları, pirate/falls/beach/parasail: Antalya'nın korsan teknesi, Düden şelalesi, plaj şemsiyeleri ve paraşüt teknesi
// mult: puan çarpanı (zor şehir biraz daha çok puan; sunucu submit_score aynı çarpanla denetler)
// hard: zorluk basamağı (engeller daha erken sıklaşır, geç oyun tavanı yükselir), hunger: simit yemeden kaç saniyede acıkırsın (simit %25, altın %60 doldurur)
// opened: bu şehir açılınca çıkan tebrik, end: son iskeleye varınca yazan cümle, after: kilitliyken menüde yazan cümle, soon: henüz hazır değil (seçicide görünür, açılmaz)
export const CITIES = [
  {
    id: 'istanbul', name: 'İstanbul', mult: 1, hard: 0, hunger: 7, routeKey: 'simit-martisi-route', bait: 'simit', bridges: true, maiden: true, end: 'Boğazı baştan sona uçtun!',
    stops: [['Kadıköy', 0, "Kadıköy'e", 0], ['Karaköy', 400, "Karaköy'e", 25], ['Beşiktaş', 1000, "Beşiktaş'a", 50], ['Ortaköy', 1700, "Ortaköy'e", 75],
      ['Arnavutköy', 2500, "Arnavutköy'e", 100], ['Bebek', 3300, "Bebek'e", 125], ['Rumeli Hisarı', 4200, "Rumeli Hisarı'na", 150], ['Emirgan', 5100, "Emirgan'a", 200],
      ['İstinye', 6000, "İstinye'ye", 225], ['Yeniköy', 6800, "Yeniköy'e", 250], ['Tarabya', 7600, "Tarabya'ya", 300], ['Sarıyer', 8400, "Sarıyer'e", 350], ['Karadeniz', 9300, "Karadeniz'e", 750]],
    was: ['Kadıköy', 'Karaköy', 'Beşiktaş', 'Ortaköy', 'Bebek', 'Rumeli Hisarı', 'Emirgan', 'Sarıyer', 'Karadeniz'],
  },
  {
    id: 'izmir', name: 'İzmir', mult: 1.1, hard: 1, hunger: 6.5, opened: 'Tebrikler! İzmir açıldı!', routeKey: 'simit-martisi-route-izmir', bait: 'gevrek', imbat: true, balloons: true, regatta: true, flamingo: true, end: 'Körfezi baştan sona uçtun!', after: "İstanbul'u bitirince açılır",
    stops: [['Üçkuyular', 0, "Üçkuyular'a", 0], ['Güzelyalı', 600, "Güzelyalı'ya", 40], ['Göztepe', 1300, "Göztepe'ye", 60], ['Konak', 2100, "Konak'a", 80],
      ['Pasaport', 3000, "Pasaport'a", 100], ['Kordon', 3900, "Kordon'a", 130], ['Alsancak', 4900, "Alsancak'a", 160], ['Bayraklı', 6100, "Bayraklı'ya", 200],
      ['Turan', 7300, "Turan'a", 240], ['Alaybey', 8600, "Alaybey'e", 280], ['Karşıyaka', 10000, "Karşıyaka'ya", 340], ['Bostanlı', 12000, "Bostanlı'ya", 1000]],
    was: ['Üçkuyular', 'Göztepe', 'Konak', 'Pasaport', 'Alsancak', 'Bayraklı', 'Karşıyaka', 'Bostanlı'],
  },
  {
    id: 'antalya', name: 'Antalya', mult: 1.2, hard: 2, hunger: 6, opened: 'Tebrikler! Antalya açıldı!', routeKey: 'simit-martisi-route-antalya', bait: 'simit', pirate: true, falls: true, beach: true, parasail: true, end: 'Antalya kıyısını baştan sona uçtun!', after: "İzmir'i bitirince açılır",
    stops: [['Konyaaltı', 0, "Konyaaltı'na", 0], ['Atatürk Parkı', 700, "Atatürk Parkı'na", 45], ['Kaleiçi', 1500, "Kaleiçi'ne", 65], ['Mermerli', 2400, "Mermerli'ye", 90],
      ['Hıdırlık', 3400, "Hıdırlık'a", 115], ['Karaalioğlu', 4500, "Karaalioğlu'na", 145], ['Falez', 5700, "Falez'e", 180], ['Şirinyalı', 7000, "Şirinyalı'ya", 220],
      ['Lara', 8400, "Lara'ya", 270], ['Düden', 9900, "Düden'e", 330], ['Güzeloba', 12000, "Güzeloba'ya", 420], ['Kundu', 15000, "Kundu'ya", 1500]],
    was: ['Konyaaltı', 'Kaleiçi', 'Mermerli', 'Karaalioğlu', 'Falez', 'Lara', 'Düden', 'Kundu'],
  },
];
export const cityOf = id => CITIES.find(c => c.id === id) || CITIES[0];
