// ---------------- dünya haritası dioramaları ----------------
// Her şehrin simgesi, oyunun kendi modellerinden küçük bir maket: duran parçalar tek Kit gövdesinde birleşir (tek çizim çağrısı),
// yalnız kıpırdayanlar ayrı mesh (değirmen kanadı, horoncular). Her biri oyun ölçüsünde kurulur, sonra fit() ile haritadaki boyuna küçülür.
// userData.tick(dt, t): canlılık. Ayar: H (maketin haritadaki yüksekliği).
import * as THREE from 'three';
import { Kit, vcMat } from './util.js';
import { makeWindmill, makeFalls, truvaGeo, bandirmaGeo, horonDancerGeo, BEACH_COLS, ckClock, konakTower } from './models.js';

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
    const g = plain([mesh(k.build())]); return { g, h: 2.6 };
  },
  izmir() { // Konak Saat Kulesi, iki palmiye
    const k = new Kit();
    k.add(cyl(12, 13, 1.2, 28), 0xe8dcc0, 0, 0.6, 0);
    konakTower(k, 0, 1.2, 0);
    palm(k, -8, 4, 11); palm(k, 8.5, 3, 10);
    return { g: plain([mesh(k.build())]), h: 2.4 };
  },
  antalya() { // Düden: falezden dökülen şelale, dibinde gölcük
    const f = makeFalls(); f.rotation.y = Math.PI / 2; // su perdesi kameraya (+z) baksın
    for (const q of f.userData.foam.slice(3)) q.m.visible = false; // maket küçük: köpüğün üçü yeter
    const k = new Kit(); k.add(cyl(7, 7.4, 0.6, 24), 0x48b4d8, 0, 0.3, 4); for (const [x, z] of [[-6, -3], [6, -2], [-5, 2]]) k.add(new THREE.ConeGeometry(1.4, 4, 7), 0x3d8f45, x, 2, z);
    const g = plain([f, mesh(k.build())]);
    g.userData.tick = (dt, t) => { for (const q of f.userData.foam) if (q.m.visible) q.m.scale.setScalar(q.s * (0.85 + 0.2 * Math.sin(t * 3 + q.ph))); };
    return { g, h: 1.9 };
  },
  mugla() { // yel değirmeni ve beyaz kübik evler
    const w = makeWindmill(); w.rotation.y = Math.PI / 2; // kanatlar kameraya baksın
    const k = new Kit(); k.add(cyl(6, 6.4, 1, 24), 0xe9dcc2, 0, -0.5, 0);
    for (const [x, z, s] of [[-4.2, 2.6, 1], [4, 2.8, 0.9], [3.6, -3, 0.8]]) { k.add(box(3 * s, 2.6 * s, 3 * s), 0xfbfbf6, x, 1.3 * s, z); k.add(box(0.8 * s, 1.4 * s, 0.1), 0x2f6fb5, x, 0.7 * s, z + 1.52 * s); }
    const g = plain([w, mesh(k.build())]); const sails = w.userData.sails;
    g.userData.tick = dt => { sails.rotation.x += dt * 1.6; };
    return { g, h: 2.2 };
  },
  canakkale() { // Truva Atı taş kaidesinde, yanında küçük Saat Kulesi
    const k = new Kit();
    k.add(box(30, 1.6, 12), 0xcfc4ae, 0, 0.8, 0);
    k.add(truvaGeo(false), null, -2, 1.6, 0);
    ckClock(k, 12, 1.6, -2, 0.55);
    return { g: plain([mesh(k.build())]), h: 2.2 };
  },
  trabzon() { // horon halkası: el ele yedi oyuncu, ritimle zıplar
    const g = new THREE.Group(), n = 7, list = [];
    const k = new Kit(); k.add(cyl(3.4, 3.6, 0.4, 24), 0x6aa84f, 0, 0.2, 0); g.add(mesh(k.build(), false));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, m = mesh(horonDancerGeo(i % BEACH_COLS.length));
      m.position.set(Math.sin(a) * 2.2, 0.4, Math.cos(a) * 2.2); m.rotation.y = a + Math.PI / 2; // yüzü halkanın yönüne
      g.add(m); list.push({ m, a });
    }
    g.userData.tick = (dt, t) => {
      const spin = t * 0.35;
      list.forEach(({ m, a }, i) => { const b = a + spin; m.position.set(Math.sin(b) * 2.2, 0.4 + Math.max(0, Math.sin(t * 7 + i * 0.9)) * 0.35, Math.cos(b) * 2.2); m.rotation.y = b + Math.PI / 2; });
    };
    return { g, h: 1.3 };
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
};

// ada süsü: ağaçlar, karlı tepeler (hepsi tek gövde). avoid: [x, z, r] şehir yerleri
export function islandDecor(rx, rz, avoid, seed = 1) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const k = new Kit(), GY = 0.72, ok = (x, z, r) => !avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar + r);
  const hills = [[0.4, 2.2, 1.0], [0.1, -1.9, 1.15], [-2.7, -3.6, 0.75], [2.9, 1.6, 0.7]];
  for (const [x, z, r] of hills) if (ok(x, z, r * 0.6)) {
    k.add(new THREE.ConeGeometry(r, r * 1.05, 7), 0x5aa84a, x, GY + r * 0.52, z);
    k.add(new THREE.ConeGeometry(r * 0.36, r * 0.38, 7), 0xffffff, x, GY + r * 0.88, z);
  }
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * rx * 2, z = (rnd() - 0.5) * rz * 2;
    if (Math.abs(x) / rx + Math.abs(z) / rz > 1.45 || Math.hypot(x / rx, z / rz) > 0.92 || !ok(x, z, 0.35) || hills.some(([hx, hz, hr]) => Math.hypot(hx - x, hz - z) < hr)) continue;
    const h = 0.45 + rnd() * 0.3;
    k.add(cyl(0.04, 0.05, 0.16, 5), 0x7a5634, x, GY + 0.08, z);
    k.add(new THREE.ConeGeometry(h * 0.38, h, 6), rnd() < 0.5 ? 0x2f8a3e : 0x3c9b48, x, GY + 0.14 + h / 2, z);
  }
  const m = mesh(k.build()); return m;
}
