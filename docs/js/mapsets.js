// ---------------- dünya haritası dioramaları ----------------
// Her şehrin simgesi, oyunun kendi modellerinden küçük bir maket: duran parçalar tek Kit gövdesinde birleşir (tek çizim çağrısı),
// yalnız kıpırdayanlar ayrı mesh (değirmen kanadı, horoncular). Her biri oyun ölçüsünde kurulur, sonra fit() ile haritadaki boyuna küçülür.
// userData.tick(dt, t): canlılık. Ayar: H (maketin haritadaki yüksekliği).
import * as THREE from 'three';
import { Kit, vcMat, teaGlassProfile, teaGlassLedTex } from './util.js';
import { makeKemenceci, makeWindmill, makeFalls, truvaGeo, bandirmaGeo, horonDancerGeo, BEACH_COLS, ckClock, konakTower, ringTex, planeGeo, kaleGeo } from './models.js';

const cyl = (rt, rb, h, n = 16) => new THREE.CylinderGeometry(rt, rb, h, n);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mesh = (geo, shadow = true) => { const m = new THREE.Mesh(geo, vcMat); m.castShadow = shadow; m.receiveShadow = true; return m; };

// maketi h yüksekliğe ölçekler ama taban genişliği w'yi geçmez (komşu şehre taşmasın); tabanı y=0'a oturtur
export function fit(obj, h, w = 1.75) {
  const b = new THREE.Box3().setFromObject(obj), s = new THREE.Vector3(); b.getSize(s);
  const k = Math.min(h / Math.max(s.y, 1e-3), w / Math.max(s.x, s.z, 1e-3));
  const g = new THREE.Group(); g.add(obj); obj.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(g); obj.position.y -= b2.min.y; obj.position.x -= (b2.min.x + b2.max.x) / 2; obj.position.z -= (b2.min.z + b2.max.z) / 2;
  return g;
}
function houseRing(k, n, r0, r1, cols, roof = 0xc0573e, skip = () => false) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3, r = r0 + ((i * 37) % 10) / 10 * (r1 - r0), x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (skip(x, z)) continue;
    const h = 3 + ((i * 53) % 7) / 3, w = 3.4 + ((i * 29) % 5) / 4;
    k.add(box(w, h, w), cols[i % cols.length], x, h / 2, z, 0, a);
    k.add(new THREE.ConeGeometry(w * 0.78, 1.8, 4), roof, x, h + 0.9, z, 0, a + Math.PI / 4);
  }
}
// harita Truva Atı: oyuncak gibi dolgun (kalın bacaklar, tombul gövde, iri baş, koyu yele), tekerlekli tahta platformda. Yandan görünür, baş +x
function toyHorse(k, x, y, z, s) {
  const W1 = 0xb07a40, W2 = 0x96632f, DARK = 0x5a3a1c, band = (f, yy) => (Math.floor(yy * 1.6) % 2 ? W1 : W2);
  k.add(box(11 * s, 0.7 * s, 5.2 * s), W2, x, y + 1.15 * s, z);                                                             // platform
  for (const [dx, dz] of [[-3.8, 2.7], [3.8, 2.7], [-3.8, -2.7], [3.8, -2.7]]) k.add(cyl(1.05 * s, 1.05 * s, 0.4 * s, 14), DARK, x + dx * s, y + 1.05 * s, z + dz * s, Math.PI / 2).add(cyl(0.3 * s, 0.3 * s, 0.5 * s, 8), W1, x + dx * s, y + 1.05 * s, z + dz * s, Math.PI / 2); // tekerlekler
  for (const [dx, dz] of [[2.6, 1.15], [2.6, -1.15], [-2.6, 1.15], [-2.6, -1.15]]) k.add(box(1.25 * s, 3.4 * s, 1.25 * s), band, x + dx * s, y + 3.2 * s, z + dz * s).add(box(1.45 * s, 0.55 * s, 1.45 * s), DARK, x + dx * s, y + 1.75 * s, z + dz * s); // bacaklar, toynaklar
  const by = y + 6.4 * s;
  k.add(new THREE.CapsuleGeometry(2.25 * s, 4.6 * s, 6, 14), (f, yy) => (Math.floor((yy + 9) * 0.9) % 2 ? W1 : W2), x, by, z, 0, 0, Math.PI / 2); // gövde
  for (const dx of [-1.6, 1.6]) k.add(cyl(2.3 * s, 2.3 * s, 0.35 * s, 16), DARK, x + dx * s, by, z, 0, 0, Math.PI / 2);     // demir kuşaklar
  k.add(box(2.1 * s, 4.6 * s, 1.9 * s), band, x + 4.1 * s, by + 2.6 * s, z, 0, 0, -0.45)                                    // boyun
    .add(box(3.4 * s, 2.0 * s, 1.9 * s), W1, x + 5.9 * s, by + 4.9 * s, z, 0, 0, -0.25)                                      // baş
    .add(box(1.5 * s, 1.4 * s, 1.75 * s), W2, x + 7.3 * s, by + 4.4 * s, z, 0, 0, -0.25)                                     // burun
    .add(box(1.0 * s, 4.8 * s, 0.6 * s), DARK, x + 3.6 * s, by + 3.4 * s, z, 0, 0, -0.45)                                    // yele
    .add(box(0.7 * s, 3.4 * s, 0.6 * s), DARK, x - 4.1 * s, by - 1.2 * s, z, 0, 0, 0.35);                                    // kuyruk
  for (const sd of [-1, 1]) {
    k.add(new THREE.ConeGeometry(0.35 * s, 1.1 * s, 4), W2, x + 5.2 * s, by + 6.2 * s, z + sd * 0.55 * s)                  // kulaklar
      .add(new THREE.SphereGeometry(0.3 * s, 8, 6), 0x1a1410, x + 6.3 * s, by + 5.2 * s, z + sd * 0.96 * s)                // gözler
      .add(new THREE.SphereGeometry(0.12 * s, 6, 4), 0xffffff, x + 6.4 * s, by + 5.3 * s, z + sd * 1.08 * s)
      .add(box(1.8 * s, 1.3 * s, 0.08 * s), DARK, x - 0.2 * s, by - 0.4 * s, z + sd * 2.28 * s);                            // gizli kapak
  }
}
// taban: arka yarı deniz (z<0), ön yarı kara (üstü top, yanı side); flat: kara alçak
function seaBack(k, r, top, side) {
  k.add(new THREE.CylinderGeometry(r, r + 0.4, 0.6, 32, 1, false, Math.PI / 2, Math.PI), (f, y) => (y > 0.25 ? 0x3f9fd0 : 0x2f7fb0), 0, 0.3, 0);
  k.add(new THREE.CylinderGeometry(r, r + 0.4, 0.9, 32, 1, false, -Math.PI / 2, Math.PI), (f, y) => (y > 0.4 ? top : side), 0, 0.45, 0);
}
function waves(k, pts) { for (const [x, z] of pts) k.add(box(1.6, 0.06, 0.25), 0xffffff, x, 0.63, z); } // dalga köpüğü çizgileri
// ahşap gulet: kahve gövde, beyaz bant, iki direk, sarılı yelken; yandan (boyu x)
function gulet(k, x, z, ry = 0, s = 1) {
  const c = Math.cos(ry), sn = Math.sin(ry), P = (lx, lz) => [x + (lx * c + lz * sn) * s, z + (-lx * sn + lz * c) * s];
  k.add(box(7 * s, 1.2 * s, 2.2 * s), 0x8a5a32, x, 0.75, z, 0, ry).add(box(7.1 * s, 0.25 * s, 2.3 * s), 0xf6f4ee, x, 1.35, z, 0, ry).add(box(3 * s, 1 * s, 1.7 * s), 0xb07a48, ...[P(0.8, 0)].flatMap(([a, b]) => [a, 1.9, b]), 0, ry);
  for (const lx of [-1.6, 1.8]) { const [a, b] = P(lx, 0); k.add(cyl(0.07 * s, 0.08 * s, 5 * s, 5), 0x6a4a2c, a, 1.4 + 2.5 * s, b).add(box(0.25 * s, 0.25 * s, 1.6 * s), 0xf2ead6, a, 1.6 + 2 * s, b, 0, ry); }
  const [bx, bz] = P(-4, 0); k.add(new THREE.ConeGeometry(0.9 * s, 1.6 * s, 4), 0x8a5a32, bx, 0.85, bz, 0, ry, Math.PI / 2, 0.7, 1, 0.9);
}
function cypress(k, x, z, h) { k.add(new THREE.ConeGeometry(h * 0.16, h, 7), 0x2f6b3a, x, h / 2, z); }
function palm(k, x, z, h) {
  k.add(cyl(0.25, 0.4, h, 6), 0x8a6a45, x, h / 2, z, 0, 0, 0.08);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.add(box(0.5, 0.12, 3.2), 0x3f9a4a, x + Math.sin(a) * 1.3, h - 0.2, z + Math.cos(a) * 1.3, 0.35, a, 0); }
}
const plain = parts => { const g = new THREE.Group(); parts.forEach(p => g.add(p)); return g; };

export const DIORAMA = {
  istanbul() { // Galata Kulesi yamacında evler ve serviler
    const k = new Kit();
    k.add(cyl(13, 14, 1.2, 28), 0xd9c9a8, 0, 0.6, 0);
    k.add(cyl(4.4, 4.9, 4, 24), 0xc9b79b, 0, 3.2, 0);
    k.add(cyl(3.6, 4, 22, 24), 0xd5c4a6, 0, 16.2, 0);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; for (const yy of [9, 15, 21]) k.add(new THREE.PlaneGeometry(0.8, 1.5), 0x3d4a5e, Math.sin(a) * 3.88, yy, Math.cos(a) * 3.88, 0, a); }
    k.add(cyl(4.3, 3.7, 1, 24), 0xb9a78b, 0, 27.6, 0);
    k.add(cyl(3.4, 3.4, 3.2, 24), 0xe6dccb, 0, 29.6, 0);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.add(new THREE.PlaneGeometry(1, 2), 0x2f3a4a, Math.sin(a) * 3.43, 29.6, Math.cos(a) * 3.43, 0, a); }
    k.add(new THREE.ConeGeometry(3.9, 7.5, 24), 0x56677a, 0, 35, 0);
    k.add(cyl(0.12, 0.12, 2, 6), 0xd8b24a, 0, 39.5, 0);
    houseRing(k, 9, 8, 11.5, [0xf1d9b5, 0xe8a87c, 0xf3e6c4, 0xd98c6a, 0xfff2d8]);
    cypress(k, -6, -6, 9); cypress(k, 6.5, -5, 8);
    const g = plain([mesh(k.build())]); return { g, h: 2.2 };
  },
  izmir() { // Konak Meydanı: ortada Saat Kulesi, solda çinili Yalı Camii, palmiyeler, banklar; arkada körfez, vapur ve yelkenli
    const k = new Kit();
    seaBack(k, 13, 0xe8dcc0, 0xc9b994);
    k.add(box(26, 0.5, 1.1), 0xbfb39a, 0, 0.65, 0.2); for (let x = -12; x <= 12; x += 1.5) k.add(cyl(0.07, 0.07, 1, 5), 0x3a3f48, x, 1.4, 0.4); // Kordon taşı, korkuluk
    for (let x = -11; x <= 11; x += 2.2) for (let z = 2; z <= 11; z += 2.2) if (Math.hypot(x, z) < 12) k.add(box(2.05, 0.04, 2.05), (Math.round(x / 2.2) + Math.round(z / 2.2)) % 2 ? 0xe8dcc0 : 0xd8c8a6, x, 0.92, z); // meydan taşları
    konakTower(k, 1.5, 0.9, 5.6);
    // Yalı Camii: sekizgen, çini bantlı gövde, kurşun kubbe, ince minare
    k.add(cyl(2.4, 2.5, 3.2, 8), (f, y) => (y > 0.5 && y < 1.2 ? 0x2f7fc4 : 0xf1e6cf), -7.4, 2.5, 6.2).add(new THREE.SphereGeometry(2.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8c9cad, -7.4, 4.1, 6.2)
      .add(cyl(0.38, 0.45, 7.5, 10), 0xf1e6cf, -4.6, 4.6, 4.7).add(cyl(0.6, 0.45, 0.4, 10), 0xd9c9a8, -4.6, 6.6, 4.7).add(new THREE.ConeGeometry(0.42, 1.6, 10), 0x7f90a3, -4.6, 9.1, 4.7);
    for (const [x, z, h] of [[-10.6, 2.4, 9], [9.6, 2.2, 10], [9.2, 8.6, 8.5], [-3.2, 10.6, 8], [5.4, 11, 7.5]]) palm(k, x, z, h);
    for (const [x, z, r] of [[5.4, 2.4, 0], [-1.8, 2.4, 0], [-9.6, 9.2, 1.1]]) k.add(box(2.4, 0.25, 0.7), 0x9a6a3c, x, 1.4, z, 0, r).add(box(2.4, 0.6, 0.12), 0x9a6a3c, x, 1.75, z - 0.3, 0, r); // banklar
    // körfez: İzmir vapuru (beyaz-lacivert) ve yelkenli
    k.add(box(7.5, 1.3, 2.6), 0xf6f4ee, -3, 0.9, -6.5).add(box(7.6, 0.35, 2.7), 0x1f4f8a, -3, 0.45, -6.5).add(box(3.6, 1.2, 2.2), 0xf6f4ee, -2.6, 2.1, -6.5).add(box(3.7, 0.4, 2.3), 0x2b4560, -2.6, 2.3, -6.5).add(cyl(0.3, 0.32, 1.4, 8), 0xe5484d, -4.6, 3.2, -6.5);
    k.add(box(3.4, 0.7, 1.2), 0xf6f4ee, 6.5, 0.6, -8).add(cyl(0.06, 0.06, 6, 5), 0xd8d2c4, 6.5, 3.9, -8).add(new THREE.ConeGeometry(1.4, 4.8, 3), 0xfdfbf4, 7.2, 3.8, -8, 0, Math.PI / 2, 0, 0.35, 1, 1);
    waves(k, [[-9, -4], [2, -10], [9, -4.5], [-8, -10]]);
    return { g: plain([mesh(k.build())]), h: 2.1 };
  },
  antalya() { // Düden: falezden denize dökülen şelale; falezin üstünde çamlar ve Yivli Minare, önde turkuaz deniz, gulet, kumsalda şemsiyeler
    const f = makeFalls(); f.rotation.y = Math.PI / 2; f.position.z = -4.5; // su perdesi kameraya (+z) baksın
    for (const q of f.userData.foam.slice(3)) q.m.visible = false; // maket küçük: köpüğün üçü yeter
    const k = new Kit();
    k.add(cyl(13, 13.4, 0.6, 32), (f, y) => (y > 0.25 ? 0x3fc4d0 : 0x2a8fb0), 0, 0.3, 0);                                             // turkuaz koy
    k.add(new THREE.CylinderGeometry(13, 13.4, 1, 32, 1, false, Math.PI * 0.62, Math.PI * 0.32), (f, y) => (y > 0.45 ? 0xeedcb2 : 0xc9a87a), 0, 0.5, 0); // sağda kumsal
    for (const [x, z, c] of [[9.4, 3.4, 0xe5484d], [10.6, 0.6, 0x2f7fd6], [8, 6, 0xf2b22c]]) k.add(cyl(0.08, 0.08, 2.6, 4), 0xf4f1e8, x, 2.2, z).add(new THREE.ConeGeometry(1.5, 0.7, 10), (f) => ((f >> 1) % 2 ? 0xf8f6f0 : c), x, 3.4, z);
    gulet(k, -4, 5.6, 0.3);
    k.add(cyl(0.9, 1.1, 6, 12), (f) => ((f >> 1) % 2 ? 0xa8553d : 0x93462f), -7, 15.5, -7).add(new THREE.ConeGeometry(1, 2.6, 12), 0x7f90a3, -7, 19.8, -7); // Yivli Minare (falezin üstünde)
    waves(k, [[2, 8], [-9, 2], [6, 10.5]]);
    const g = plain([f, mesh(k.build())]);
    g.userData.tick = (dt, t) => { for (const q of f.userData.foam) if (q.m.visible) q.m.scale.setScalar(q.s * (0.85 + 0.2 * Math.sin(t * 3 + q.ph))); };
    return { g, h: 1.9 };
  },
  mugla() { // Bodrum: tepede yel değirmeni, yamaçta mavi kapılı beyaz kübik evler ve begonviller, önde marina: gulet ve Bodrum Cup yelkenlisi
    const w = makeWindmill(); w.rotation.y = Math.PI / 2; w.position.set(-1.5, 2.7, -3.2); // kanatlar kameraya baksın; tepenin üstünde
    const k = new Kit();
    seaBack(k, 9, 0xe9dcc2, 0xc9b994);
    k.add(new THREE.CylinderGeometry(2.8, 4.2, 1.8, 14), (f, y) => (y > 0.8 ? 0xc9b98c : 0xb39f74), -1.5, 1.8, -3.2);                      // değirmen tepesi
    for (const [x, z, sc] of [[-6.2, 2, 1], [5.2, 2.6, 0.95], [5.6, -2.2, 0.85], [-6.4, -2.6, 0.8], [1.2, 5.2, 0.75], [-3.2, 5.6, 0.8]]) {
      const hh = 2.6 * sc; k.add(box(3 * sc, hh, 3 * sc), 0xfbfbf6, x, 0.9 + hh / 2, z).add(box(0.8 * sc, 1.4 * sc, 0.1), 0x2f6fb5, x, 0.9 + 0.7 * sc, z + 1.52 * sc).add(box(3.1 * sc, 0.18, 3.1 * sc), 0xeeeee6, x, 0.9 + hh + 0.09, z);
      k.add(new THREE.IcosahedronGeometry(0.7 * sc, 0), 0xd94a8c, x + 1.3 * sc, 0.9 + hh * 0.75, z + 1.4 * sc, 0, 0, 0, 1, 0.8, 0.6); // begonvil
    }
    k.add(box(18, 0.4, 1), 0xbfb39a, 0, 0.8, 7.2);                                                                                            // marina rıhtımı (önde)
    gulet(k, -3.5, 9.2, 0, 0.8); k.add(box(3, 0.6, 1), 0x8a5a32, 4, 0.55, 9.3).add(cyl(0.06, 0.06, 5.5, 5), 0xd8d2c4, 4, 3.4, 9.3).add(new THREE.ConeGeometry(1.2, 4.4, 3), 0xfdfbf4, 4.5, 3.4, 9.3, 0, Math.PI / 2, 0, 0.35, 1, 1);
    const g = plain([w, mesh(k.build())]); const sails = w.userData.sails;
    g.userData.tick = dt => { sails.rotation.x += dt * 1.6; };
    return { g, h: 2.2 };
  },
  canakkale() { // Truva Atı taş kaidesinde, yanında küçük Saat Kulesi
    // arkada Boğaz (yarım disk deniz, üstünde küçük feribot), önde Kordon: taş meydan, basamaklı kaidede Truva Atı, sağda Saat Kulesi, selviler ve fenerler
    const k = new Kit(), SEA = 0x3f9fd0, GRASS = 0x7cc95a, SOIL = 0xb08a5a, STONE = 0xd9cfba, STONE2 = 0xbfb39a;
    k.add(new THREE.CylinderGeometry(13, 13.4, 0.6, 32, 1, false, Math.PI / 2, Math.PI), (f, y) => (y > 0.25 ? SEA : 0x2f7fb0), 0, 0.3, 0);       // Boğaz (arka yarı)
    k.add(new THREE.CylinderGeometry(13, 13.4, 0.9, 32, 1, false, -Math.PI / 2, Math.PI), (f, y) => (y > 0.4 ? GRASS : SOIL), 0, 0.45, 0);     // kıyı (ön yarı)
    k.add(box(26, 0.5, 1.2), STONE2, 0, 0.75, 0.2);                                                                                            // rıhtım taşı
    k.add(box(18, 0.12, 8), STONE, 0, 0.96, 5.2);                                                                                              // Kordon meydanı
    for (const [w, d, y] of [[13.4, 8.2, 1.2], [12.2, 7.4, 1.6]]) k.add(box(w, 0.4, d), y > 1.4 ? STONE : STONE2, -2, y, 5.2);                 // basamaklı kaide
    toyHorse(k, -2, 1.8, 5.2, 1);
    ckClock(k, 7.6, 0.9, 7.6, 0.5);
    for (const [x, z, h] of [[-11, 4.5, 5], [-10, 8.5, 4.2], [11, 2.6, 4.6], [10.4, 9.6, 3.8]]) k.add(new THREE.ConeGeometry(h * 0.17, h, 7), 0x2f6b3a, x, 0.9 + h / 2, z); // selviler
    for (const x of [-8.4, 4.4]) { k.add(cyl(0.1, 0.12, 2.6, 6), 0x3a3f48, x, 2.2, 1.2); k.add(new THREE.SphereGeometry(0.32, 8, 6), 0xfff1c8, x, 3.6, 1.2); } // fenerler
    // feribot: beyaz gövde, kırmızı bant, köprüüstü
    k.add(box(7, 1.2, 2.4), 0xf6f4ee, 2, 0.9, -7).add(box(7.1, 0.3, 2.5), 0xc8352e, 2, 1.25, -7).add(box(3, 1.2, 2), 0xf6f4ee, 2.6, 2.1, -7).add(box(3.1, 0.35, 2.1), 0x2b4560, 2.6, 2.2, -7).add(cyl(0.25, 0.3, 1.2, 8), 0xc8352e, 1.2, 3, -7);
    for (const x of [-6, -9.5, 7.5]) k.add(box(1.6, 0.06, 0.25), 0xffffff, x, 0.62, -4 - Math.abs(x) * 0.3); // dalga köpüğü
    return { g: plain([mesh(k.build())]), h: 2.2 };
  },
  trabzon() { // yaylada horon: çimenli düzlükte el ele yedi oyuncu ritimle zıplar; çevrede ahşap yayla evi, kemençeci kütükte, çamlar, fındık çalıları, çit
    const g = new THREE.Group(), n = 7, list = [], R = 3.1, S = 1.45;
    const k = new Kit();
    k.add(cyl(6.6, 7, 0.8, 32), (f, y) => (y > 0.35 ? 0x6aa84f : 0x8a6a45), 0, 0.4, 0);
    k.add(cyl(R + 0.9, R + 0.9, 0.06, 28), 0x84bf5e, 0, 0.82, 0);                                                                                     // oyun alanı (açık çimen)
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; if (Math.abs(a - Math.PI) < 0.5) continue; k.add(cyl(0.07, 0.08, 0.9, 5), 0x7a5634, Math.sin(a) * 6.3, 1.2, Math.cos(a) * 6.3); } // çit direkleri
    k.add(box(3.4, 2, 2.6), 0x9a6a3c, -4.4, 1.8, -3.6).add(new THREE.ConeGeometry(2.7, 1.4, 4), 0x5a3a24, -4.4, 3.5, -3.6, 0, Math.PI / 4).add(box(0.7, 1.1, 0.06), 0x3a2618, -4.4, 1.35, -2.28); // yayla evi
    for (const [x, z, h] of [[4.6, -3.6, 3.6], [5.4, -1.2, 2.8], [3.2, -5.2, 3]]) k.add(new THREE.ConeGeometry(h * 0.28, h, 7), 0x2c6a36, x, 0.8 + h / 2, z); // çamlar
    for (const [x, z] of [[-5.6, 1.6], [-5, 3.6], [5.4, 2.8]]) k.add(new THREE.IcosahedronGeometry(0.55, 0), 0x4f8a3a, x, 1.1, z, 0, 0, 0, 1.3, 0.8, 1.2); // fındık çalıları
    k.add(cyl(0.45, 0.5, 0.6, 8), 0x7a5634, 0, 1.1, 5.4);                                                                                              // kemençecinin kütüğü
    g.add(mesh(k.build(), false));
    const km = makeKemenceci().mesh; km.scale.setScalar(S * 0.95); km.position.set(0, 1.4, 5.4); km.rotation.y = Math.PI; g.add(km); // kemençeci halkaya bakar
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, m = mesh(horonDancerGeo(i % BEACH_COLS.length)); m.scale.setScalar(S);
      m.position.set(Math.sin(a) * R, 0.85, Math.cos(a) * R); m.rotation.y = a + Math.PI / 2; // yüzü halkanın yönüne
      g.add(m); list.push({ m, a });
    }
    g.userData.tick = (dt, t) => {
      const spin = t * 0.35;
      list.forEach(({ m, a }, i) => { const b = a + spin; m.position.set(Math.sin(b) * R, 0.85 + Math.max(0, Math.sin(t * 7 + i * 0.9)) * 0.45, Math.cos(b) * R); m.rotation.y = b + Math.PI / 2; });
    };
    return { g, h: 1.4 };
  },
  samsun() { // Bandırma Vapuru limanda
    const ship = mesh(bandirmaGeo());
    const b = new THREE.Box3().setFromObject(ship), s = new THREE.Vector3(); b.getSize(s);
    if (s.z > s.x) ship.rotation.y = Math.PI / 2; // yandan görünsün
    const L = Math.max(s.x, s.z), k = new Kit();
    k.add(cyl(L * 0.62, L * 0.64, 0.6, 28), 0x48b4d8, 0, 0.3, 0);
    k.add(box(L * 1.05, 1.6, 3), 0xb8ad98, 0, 0.8, -L * 0.24); // rıhtım
    const g = plain([ship, mesh(k.build(), false)]); ship.position.y = 0.2;
    g.userData.tick = (dt, t) => { ship.rotation.z = Math.sin(t * 1.2) * 0.02; ship.position.y = 0.2 + Math.sin(t * 1.5) * 0.15; };
    return { g, h: 1.5 };
  },
  mersin() { // Kızkalesi: denizde kayalık adacık, köşeleri yuvarlak burçlu sur, iki kemerli kapı; kıyıda iki Soli sütunu
    const k = new Kit();
    k.add(cyl(13, 13.4, 0.6, 28), 0x48b4d8, 0, 0.3, 0);
    k.add(box(24, 1.4, 5), 0xe6d6ae, 0, 0.7, 8);
    for (const x of [-6, -3, 6]) k.add(cyl(0.45, 0.5, x === -3 ? 2.2 : 4.2, 10), 0xe8dcc4, x, 1.4 + (x === -3 ? 1.1 : 2.1), 8).add(box(1.2, 0.3, 1.2), 0xe8dcc4, x, x === -3 ? 3.5 : 5.6, 8);
    const q = kaleGeo(0, true);
    for (const g of [q.body, q.front, q.back]) k.add(g, null, 0, 0.5, -1.5, 0, 0.3, 0, 0.56);
    const g = plain([mesh(k.build())]);
    g.userData.tick = (dt, t) => { g.position.y = Math.sin(t * 1.1) * 0.03; };
    return { g, h: 3.4 };
  },
  rize() { // çay bardağı kule: LED'li ince belli bardak, kırmızı tabak, denize doldurulmuş sette pist ve kalkan minik uçak; ışık halkası bardağı tırmanır
    const k = new Kit();
    k.add(cyl(13, 13.4, 0.6, 28), (f, y) => (y > 0.25 ? 0x7cc95a : 0xb08a5a), 0, 0.3, 0);   // kara: havalimanı ve kule çimenin üstünde
    for (const [x0, x1] of [[-12, -7.4], [7.4, 12]]) for (let z = -7; z <= 1; z += 1.6) if (Math.hypot(x0 < 0 ? x0 + 1 : x1 - 1, z) < 12) k.add(box(x1 - x0, 0.5, 0.8), 0x3f8a36, (x0 + x1) / 2, 0.85, z); // kenarlarda çay sıraları
    k.add(box(24, 1.4, 6), 0x9a9890, 0, 0.7, 6.5).add(box(22, 0.1, 2.4), 0x3d4046, 0, 1.45, 6.5); // dolgu ve pist
    for (let x = -9; x <= 9; x += 3) k.add(box(1.4, 0.12, 0.3), 0xf4f4ee, x, 1.5, 6.5);
    k.add(cyl(6.2, 6.6, 1.6, 24), 0x9a9890, 0, 0.8, -2).add(cyl(4.6, 4, 0.6, 24), 0xc8241c, 0, 1.9, -2).add(new THREE.TorusGeometry(4.55, 0.16, 6, 28), 0xf6f2ea, 0, 2.2, -2, Math.PI / 2);
    const S = 1.25, led = new THREE.Mesh(new THREE.LatheGeometry(teaGlassProfile().map(p => new THREE.Vector2(p.x * S, p.y * S + 2.2)), 28), new THREE.MeshBasicMaterial({ map: teaGlassLedTex() }));
    { const pr = teaGlassProfile(), q = pr[pr.length - 4]; k.add(new THREE.CircleGeometry(q.x * S * 0.99, 28), 0x7a2412, 0, q.y * S + 2.2, -2, -Math.PI / 2); } // bardağın ağzında demli çay (üstten bakınca bardak boş görünmesin)
    led.position.z = -2; led.castShadow = true; led.userData.greyMat = new THREE.MeshBasicMaterial({ map: teaGlassLedTex(true) }); // kilitliyken gri (worldmap swapMat)
    const tex = ringTex(true); tex.repeat.y = 2;
    const ring = new THREE.Mesh(new THREE.LatheGeometry(teaGlassProfile().map(p => new THREE.Vector2(p.x * S * 1.03, p.y * S + 2.2)), 28), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.z = -2; ring.userData.greyHide = true;
    const plane = mesh(planeGeo()); plane.scale.setScalar(0.55); plane.rotation.y = -Math.PI / 2; // burun +x: pist boyunca
    const g = plain([mesh(k.build()), led, ring, plane]);
    let px = -10, wait = 1;
    g.userData.tick = (dt, t) => {
      tex.offset.y -= dt * 0.7; // halkalar bardağı tırmanır
      if ((wait -= dt) > 0) { plane.position.set(-10, 1.5, 6.5); plane.rotation.z = 0; return; }
      px += dt * (4 + (px + 10) * 0.9); plane.position.x = px; // pistte hızlanır, kalkar, tırmanır
      if (px > 0) { plane.position.y = 1.5 + (px * 0.35) ** 1.4; plane.rotation.z = 0.25; }
      if (px > 22) { px = -10; wait = 3 + Math.random() * 3; }
    };
    return { g, h: 2.3 };
  },
};

// ada süsü: ağaçlar, karlı tepeler (hepsi tek gövde). avoid: [x, z, r] şehir yerleri
export const HILLS = [[0.4, 2.2, 1.0], [0.1, -1.9, 1.15], [-2.7, -3.6, 0.75], [2.9, 1.6, 0.7], [-0.2, -6.4, 0.8], [2.9, -8.2, 0.55]]; // adadaki tepeler [x, z, yarıçap]: yol taşları bunların üstünden geçmez
// rx/rz: süs alanının yarı boyları, zc: alanın ortası (ada kuzeye uzadıkça kayar)
export function islandDecor(rx, rz, avoid, seed = 1, zc = 0) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const k = new Kit(), GY = 0.95, ok = (x, z, r) => !avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar + r);
  const hills = HILLS;
  for (const [x, z, r] of hills) if (ok(x, z, r * 0.6)) {
    k.add(new THREE.ConeGeometry(r, r * 1.05, 7), 0x5aa84a, x, GY + r * 0.52, z);
    k.add(new THREE.ConeGeometry(r * 0.36, r * 0.38, 7), 0xffffff, x, GY + r * 0.88, z);
  }
  for (let i = 0; i < 90; i++) {
    const x = (rnd() - 0.5) * rx * 2, z = zc + (rnd() - 0.5) * rz * 2;
    if (Math.abs(x) / rx + Math.abs(z - zc) / rz > 1.45 || Math.hypot(x / rx, (z - zc) / rz) > 0.92 || !ok(x, z, 0.35) || hills.some(([hx, hz, hr]) => Math.hypot(hx - x, hz - z) < hr)) continue;
    const h = 0.45 + rnd() * 0.3;
    k.add(cyl(0.04, 0.05, 0.16, 5), 0x7a5634, x, GY + 0.08, z);
    k.add(new THREE.ConeGeometry(h * 0.38, h, 6), rnd() < 0.5 ? 0x2f8a3e : 0x3c9b48, x, GY + 0.14 + h / 2, z);
  }
  const m = mesh(k.build()); return m;
}
