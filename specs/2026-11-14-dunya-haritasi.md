# Dünya haritası

## Amaç
Başlıktaki `‹ Şehir ›` okları ile nokta rotasının yerine, oyuncunun şehir seçtiği ve ilerlemesini gördüğü 3B bir dünya haritası. İki işi aynı anda görür: hızlı ve işlevsel bir şehir seçme menüsü olur, oyuncuyu da "sıradakini açayım" diye heveslendirir. Yeni ülkeler (Amerika, Japonya, Güney Afrika) geldikçe harita sıkışmadan büyür.

## Hedefler
- Harita Türkiye adasına yakın açılır ve 7 şehir tek dik ekrana sığar. Kaydırma, iki parmakla yakınlaştırma ve tekerlekle yakınlaştırma çalışır, kamera sınır içinde kalır.
- Her şehir oyunun kendi modelleriyle kurulmuş küçük bir dioramadır: Kız Kulesi / Galata, Saat Kulesi, Düden, yel değirmeni, Truva Atı, horon, Bandırma vapuru.
- Şehre dokununca alttan bir kart açılır. Kartta şehrin adı, ×çarpanı, iskele ilerlemesi, sıradaki hedef ve **UÇ!** düğmesi bulunur. Kilitli şehrin kartında açılma şartı yazar.
- Heves katmanı:
  - Bitirilen şehirde bayrak.
  - Sıradaki şehre giden yol taşları; ilerledikçe dolar.
  - Kilitli şehirler sisli ve gri görünür.
  - Yeni açılan şehrin üstündeki bulut dağılır.
- Uzaklaşınca diğer ülkeler bulutla örtülü ayrı adalar olarak görünür, üzerlerinde "Yakında" yazar.

## Hedef olmayanlar
- Açılma kuralı değişmez: `cityOpen`, `routeOf` ve `city.after` aynen kalır.
- Gerçek Türkiye ya da dünya coğrafyası birebir çizilmez. Ada şekli serbesttir.

## Asla olmasın
- Telefonda kasma. Çizim çağrısı sayısı ölçülür, gerekirse parçalar birleştirilir. Çözünürlük kısılmaz.
- Başka bir oyunun haritasının kopyası olmamalı; yalnızca tarz ilham alınır.
- Ekran yazıyla dolmamalı (sade ekran ilkesi).

## Yaklaşım
Üç yol karşılaştırıldı:
- **A. 3B adalar (seçildi):** three.js sahnesi, oyunun kendi modelleri, canlı dioramalar.
- **B. 2B çizim:** daha hafif ama oyunun 3B görünüşünden kopuk.
- **C. Hibrit:** 3B'den alınmış resimler 2B haritaya konur; hafif ama dioramalar kıpırdamaz.

Arda taslak görselleri karşılaştırıp A'nın yakın görünümünü seçti.

## Nasıl kurulacak
- Yeni modül `docs/js/worldmap.js`. Kendi `THREE.Scene`'i ve kamerası olur, ama oyunun mevcut `renderer`'ını kullanır (kostüm podyumu ve rekor ekranıyla aynı desen). `main.js` döngüsünde `mapping` açıkken dünya yerine harita çizilir.
- Başlıkta şehir adı haritayı açan düğmeye dönüşür ve `‹ ›` okları kalkar.
- Kart, mevcut şehir verisini kullanır: `CITIES`, `STOPS`, `routeOf`, `cityOpen`.
- Metinler `tr()` ve `lang` dosyalarından gelir.
