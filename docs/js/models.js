import * as THREE from 'three';
import { Kit, vcMat, rand, pick, canvasTex } from './util.js';

// ---------------- martı ----------------
// Gövde tek geometri; her kanat iki eklemli (kol + el) ki çırpış dalga gibi aksın.
function wingShape(rootChord, tipChord, len, sweep) {
  const s = new THREE.Shape();
  s.moveTo(0, -rootChord * 0.35); s.lineTo(len, -tipChord * 0.3 + sweep);
  s.lineTo(len, tipChord * 0.7 + sweep); s.lineTo(0, rootChord * 0.65); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // x = açıklık, z = kanat kirişi (arkaya doğru +)
  return g;
}
// uç tüyü (primary): sivri, ince; kanat ucunda yelpaze gibi açılıp "parmak" siluetini verir
function primary(len, w) {
  const s = new THREE.Shape();
  s.moveTo(0, -w * 0.5); s.lineTo(len * 0.7, -w * 0.45); s.lineTo(len, 0); s.lineTo(len * 0.7, w * 0.5); s.lineTo(0, w * 0.5); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  return g;
}
// kanadın ön kenarı: kalın, yuvarlak kemik hattı; kanada kalınlık verir, arkadan bakınca da okunur
function edgeRoll(len, r0, r1) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
  g.rotateZ(-Math.PI / 2); g.translate(len / 2, 0, 0); g.scale(1, 0.75, 1);
  return g;
}

// geometriler türe göre bir kez üretilir; her yeni martı aynı tamponları paylaşır (bellek sızmasın)
const gullGeoCache = {};
// tür = renk: player beyaz martı; grey/red/blue rakipler (renk davranışı söyler: gri süzülür, kırmızı dalar, mavi zikzak çizer);
// pink/night/golden oyuncunun kostüm dolabındaki tüy renkleri
const GULL_PAL = {
  player: { body: 0xfbfaf6, head: 0xffffff, wing: 0xaab4c0, tip: 0x1b1c22, beak: 0xf4b52a, eye: 0x111111 },
  grey: { body: 0x6f7682, head: 0x5d6470, wing: 0x474d58, tip: 0x15161a, beak: 0xd9862a, eye: 0xff4a3a },
  red: { body: 0xd9544f, head: 0xc8453f, wing: 0x9c2f2b, tip: 0x2a1010, beak: 0xffc23a, eye: 0xfff2b0 },
  blue: { body: 0x5fa8d3, head: 0x4f93c0, wing: 0x2f6f9f, tip: 0x10202e, beak: 0xffc23a, eye: 0xfff2b0 },
  pink: { body: 0xffd6e2, head: 0xffe4ec, wing: 0xf08fb0, tip: 0x7a2b4a, beak: 0xf4b52a, eye: 0x111111 },
  night: { body: 0x3a3f4c, head: 0x2c303a, wing: 0x1e2129, tip: 0x0a0a0c, beak: 0xffc23a, eye: 0xffe07a },
  golden: { body: 0xffd77a, head: 0xffe39c, wing: 0xe0a53a, tip: 0x8a5a12, beak: 0xff8a3a, eye: 0x111111 },
  sunset: { body: 0xffbb85, head: 0xffcf9e, wing: 0x9b5fc0, tip: 0x3d1f5c, beak: 0xffd34d, eye: 0x111111 },
  mint: { body: 0xdcfff2, head: 0xecfff8, wing: 0x5cc9a7, tip: 0x1f5e4e, beak: 0xf4b52a, eye: 0x111111 },
  ice: { body: 0xeaf6ff, head: 0xf6fbff, wing: 0x8fc9ef, tip: 0x2f6f9f, beak: 0xbfe6ff, eye: 0x2a6fd6 },
};
function gullGeos(type) {
  if (gullGeoCache[type]) return gullGeoCache[type];
  const C = GULL_PAL[type] || GULL_PAL.player;
  const k = new Kit();
  // gövde: ileri (−z) doğru incelen damla
  // sırt (manto) kanat renginde: arkadan bakınca martı beyaz topak değil, gri sırtlı kuş okunur
  k.add(new THREE.SphereGeometry(0.42, 11, 8), (f, y) => (y > 0.2 ? C.wing : C.body), 0, 0, 0, 0, 0, 0, 0.95, 0.82, 1.85);
  k.add(new THREE.SphereGeometry(0.3, 9, 7), (f, y) => (y < -0.05 ? 0xe8e6e0 : C.head), 0, 0.2, -0.72);
  k.add(new THREE.ConeGeometry(0.085, 0.42, 6), C.beak, 0, 0.14, -1.12, -Math.PI / 2);
  k.add(new THREE.SphereGeometry(0.035, 5, 4), 0xd8352a, 0, 0.1, -1.18); // gagadaki kırmızı benek
  for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(0.05, 6, 4), C.eye, s * 0.19, 0.28, -0.86);
  // kuyruk: siyah uçlu yelpaze
  const ts = new THREE.Shape(); ts.moveTo(-0.14, 0); ts.lineTo(0.14, 0); ts.lineTo(0.3, 0.62); ts.lineTo(-0.3, 0.62); ts.closePath();
  const tail = new THREE.ExtrudeGeometry(ts, { depth: 0.05, bevelEnabled: false }); tail.rotateX(Math.PI / 2);
  k.add(tail, (f, y) => C.wing, 0, 0.08, 0.7);
  k.add(new THREE.BoxGeometry(0.6, 0.05, 0.1), C.tip, 0, 0.06, 1.33);
  // toplanmış ayaklar
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.06, 0.06, 0.3), 0xf08a3a, s * 0.12, -0.3, 0.45);
  const bodyGeo = k.build();
  // kol: gri yüzey + kalın beyaz ön kenar + beyaz arka kenar şeridi
  const armGeo = new Kit().add(wingShape(0.72, 0.62, 1.15, 0.08), C.wing)
    .add(edgeRoll(1.17, 0.085, 0.07), C.body, 0, -0.02, -0.25, 0, -0.126)
    .add(new THREE.BoxGeometry(1.1, 0.056, 0.09), C.body, 0.57, -0.025, 0.45, 0, -0.04).build();
  const handKit = new Kit().add(wingShape(0.62, 0.3, 0.95, 0.22), C.wing)
    .add(edgeRoll(0.98, 0.07, 0.035), C.body, 0, -0.02, -0.21, 0, -0.35);
  // uç tüyleri: dıştaki dümdüz açılır, içe doğru geriye yatar; ilk ikisinde beyaz "ayna" benek
  for (let i = 0; i < 5; i++) {
    const len = 0.78 - i * 0.08, ry = -0.08 - i * 0.17, bx = 0.6 + i * 0.03, bz = -0.04 + i * 0.075, by = -0.012 - i * 0.007;
    handKit.add(primary(len, 0.15), C.tip, bx, by, bz, 0, ry);
    if (i < 2) handKit.add(new THREE.SphereGeometry(0.045, 5, 3), 0xffffff, bx + Math.cos(ry) * len * 0.72, by + 0.012, bz - Math.sin(ry) * len * 0.72, 0, 0, 0, 1, 0.35, 1);
  }
  const handGeo = handKit.build();
  return (gullGeoCache[type] = { bodyGeo, armGeo, handGeo });
}
export function makeGull(type = 'player') {
  if (type === true) type = 'grey';
  const { bodyGeo, armGeo, handGeo } = gullGeos(type);
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, vcMat);
  body.castShadow = true;
  g.add(body);
  const wings = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.28, 0.14, -0.1); arm.scale.x = s; g.add(arm);
    const am = new THREE.Mesh(armGeo, vcMat); am.castShadow = true; arm.add(am);
    const hand = new THREE.Group(); hand.position.set(1.12, 0, 0.04); arm.add(hand);
    const hm = new THREE.Mesh(handGeo, vcMat); hm.castShadow = true; hand.add(hm);
    wings.push({ arm, hand, s });
  }
  g.userData.wings = wings;
  g.userData.body = body;
  return g;
}
// tüy rengini değiştirir: aynı ağ, önbellekteki başka geometri
export function paintGull(g, type) {
  const { bodyGeo, armGeo, handGeo } = gullGeos(type);
  g.userData.body.geometry = bodyGeo;
  for (const w of g.userData.wings) { w.arm.children[0].geometry = armGeo; w.hand.children[0].geometry = handGeo; }
}
// phase: çırpış açısı; power 0 = süzülme, 1 = tam çırpış
export function flapGull(g, phase, power, glide = 0.12) {
  for (const w of g.userData.wings) {
    const a = Math.sin(phase) * 0.75 * power;
    // kol dönüşü aynadan sonra uygulanır → sol kanatta işaret ters; el, kolun aynalı uzayında kalır
    w.arm.rotation.z = w.s * (glide + a);
    w.hand.rotation.z = glide * 0.6 + Math.sin(phase - 0.9) * 0.55 * power;
    w.arm.rotation.y = w.s * (-0.05 + Math.cos(phase) * 0.06 * power);
  }
}

// ---------------- simit ----------------
// Tek geometri: üst yüzler kızarmış, alt yüzler koyu, rastgele yüzler susam
function simitGeo() {
  const tor = new THREE.TorusGeometry(0.32, 0.13, 9, 22);
  return new Kit().add(tor, (f, y) => {
    const r = Math.random();
    if (r < 0.2) return 0xf6e2b3; // susam
    return r < 0.55 ? 0xb8642a : r < 0.8 ? 0xc97835 : 0x9c4f1f;
  }).build();
}
// simit parçası: halkanın üçte biri, kırık uçları içi açık hamur rengi
function pieceGeo() {
  const arc = new THREE.TorusGeometry(0.32, 0.13, 8, 8, Math.PI * 0.7);
  const k = new Kit().add(arc, () => { const r = Math.random(); return r < 0.2 ? 0xf6e2b3 : r < 0.6 ? 0xb8642a : 0xc97835; });
  for (const a of [0, Math.PI * 0.7]) {
    const cap = new THREE.CircleGeometry(0.13, 8).rotateX(a ? -Math.PI / 2 : Math.PI / 2).rotateZ(a); // halkanın teğetine dik, dışa bakar
    k.add(cap, 0xf3dcae, Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0);
  }
  return k.build();
}
export const GEO = {
  simit: simitGeo(),
  piece: pieceGeo(),
  bubble: new THREE.IcosahedronGeometry(0.85, 2),
  blob: new THREE.CircleGeometry(1, 20),
};
export const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xc77a00, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.3, flatShading: true });
export function makeSimitPiece(gold = false) {
  const m = new THREE.Mesh(GEO.piece, gold ? goldMat : vcMat);
  m.scale.setScalar(1.25);
  return m;
}
export function makeSimit(gold = false) {
  const m = new THREE.Mesh(GEO.simit, gold ? goldMat : vcMat);
  m.castShadow = false;
  return m;
}

// ---------------- yolcu ----------------
// Görünüm = gömlek, pantolon/etek, ten, saç, şapka, atkı, duruş. Değişkenler önceden birleştirilir (görünüm × simit var/yok × kızgın).
const SHIRTS = [0x3a6ea5, 0xd9544f, 0x4f9d69, 0xe3b23c, 0x7d5ba6, 0x2f3b4c, 0xe07a5f, 0x5fa8d3, 0xf2efe6, 0xe89bb0, 0x8fbf9f, 0xc98b5a];
const PANTS = [0x262c3a, 0x3b4a66, 0x5a4636, 0x4d5560, 0x2f4f6f, 0x8a7a64];
const SKINS = [0xf1c9a5, 0xe8b896, 0xd49b74, 0xb7785a, 0x8d5a3c];
const HAIRS = [0x2e211a, 0x5a3b26, 0x1a1a1a, 0xc9c3b8, 0xb5652e, 0xe0c27a];
const HATS = ['', 'kasket', 'bere', 'hasir', 'esarp', 'fes', 'kep'];
const HAT_COLS = [0x3b3b3b, 0xc8352e, 0x3a6ea5, 0xe8d8a8, 0x7d5ba6, 0x4f9d69, 0xe89bb0];
const personCache = new Map();
// mode: '' ayakta · 'sit' bankta oturur, denize bakar (elinde çay ya da boş) · 'feed' küpeşteye yaslanmış, simidi martıya uzatır
function personGeo(L, hold, angry, mode = '') {
  const key = L.id + '|' + hold + '|' + angry + '|' + mode;
  if (personCache.has(key)) return personCache.get(key);
  const k = new Kit(), sit = mode === 'sit', dy = sit ? -0.32 : 0;
  const head = angry ? 0xe2584e : L.skin;
  const up = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, sx, sy, sz) => k.add(geo, c, x, y + dy, z, rx, ry, rz, sx, sy, sz); // gövdeden yukarısı oturunca alçalır
  // kafa takımı (kafa, saç, şapka, yüz) kafanın merkezine göre bir boy büyük: tatlı, iri kafalı yolcular, uzaktan da yüzleri okunur
  const HS = 1.25, HY = 1.95;
  const hd = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => up(geo, c, x * HS, HY + (y - HY) * HS, z * HS, rx, ry, rz, sx * HS, sy * HS, sz * HS);
  const cyl = (rt, rb, h, c, x, y, z, rz = 0, rx = 0) => up(new THREE.CylinderGeometry(rt, rb, h, 6), c, x, y, z, rx, 0, rz);
  if (sit) { // uyluk öne, baldır aşağı
    for (const x of [-0.12, 0.12]) {
      k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6), L.pants, x, 0.5, 0.2, Math.PI / 2);
      k.add(new THREE.CylinderGeometry(L.skirt ? 0.06 : 0.1, L.skirt ? 0.06 : 0.1, 0.46, 6), L.skirt ? L.skin : L.pants, x, 0.25, 0.44);
      k.add(new THREE.BoxGeometry(0.2, 0.08, 0.3), 0x2a221c, x, 0.04, 0.52);
    }
  } else {
    if (L.skirt) {
      k.add(new THREE.CylinderGeometry(0.24, 0.4, 0.62, 8), L.pants, 0, 0.62, 0);
      for (const x of [-0.1, 0.1]) cyl(0.06, 0.06, 0.4, L.skin, x, 0.2, 0);
    } else for (const x of [-0.12, 0.12]) cyl(0.11, 0.12, 0.8, L.pants, x, 0.4, 0);
    for (const x of [-0.12, 0.12]) k.add(new THREE.BoxGeometry(0.2, 0.08, 0.3), 0x2a221c, x, 0.04, 0.04); // ayakkabı (yüzler +z'ye, gelen martıya bakar)
  }
  up(new THREE.CylinderGeometry(0.25, 0.32, 0.95, 8), L.shirt, 0, 1.25, 0);
  if (L.jacket) for (const x of [-0.17, 0.17]) up(new THREE.BoxGeometry(0.16, 0.9, 0.05), L.jacket, x, 1.27, 0.28);
  hd(new THREE.SphereGeometry(0.23, 12, 9), head, 0, 1.95, 0);
  // yüz: iki parlak göz, pembe yanaklar, gülümseme; kızgınken çatık kaş ve açık ağız
  for (const x of [-0.085, 0.085]) {
    hd(new THREE.SphereGeometry(0.042, 6, 5), 0x1a1a22, x, 1.94, 0.205, 0, 0, 0, 1, 1.25, 0.7);
    hd(new THREE.SphereGeometry(0.014, 4, 3), 0xffffff, x + 0.015, 1.955, 0.235);
    hd(new THREE.SphereGeometry(0.05, 6, 4), angry ? 0xb8322c : 0xf28c8c, x * 1.65, 1.885, 0.17, 0, 0, 0, 1, 0.7, 0.5);
    if (angry) hd(new THREE.BoxGeometry(0.09, 0.025, 0.03), 0x2a1a14, x, 2.0, 0.215, 0, 0, x > 0 ? 0.45 : -0.45);
  }
  if (angry) hd(new THREE.SphereGeometry(0.045, 6, 4), 0x5a1a1a, 0, 1.855, 0.21, 0, 0, 0, 1, 0.8, 0.6);
  else hd(new THREE.TorusGeometry(0.04, 0.012, 3, 8, Math.PI), 0x7a2e2a, 0, 1.88, 0.222, 0, 0, Math.PI);
  if (L.hair >= 0 && L.hat !== 'esarp') {
    hd(new THREE.SphereGeometry(0.245, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2.2), HAIRS[L.hair], 0, 1.99, -0.02);
    if (L.long) hd(new THREE.BoxGeometry(0.42, 0.42, 0.14), HAIRS[L.hair], 0, 1.82, -0.17);
  }
  // şapka ve aksesuarlar uzaktan, telefonda da seçilsin diye bir boy büyük ve doygun renkli
  const hc = L.hatCol;
  if (L.hat === 'kasket') { hd(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), hc, 0, 2.14, 0.01); hd(new THREE.BoxGeometry(0.34, 0.04, 0.22), hc, 0, 2.09, 0.3); }
  else if (L.hat === 'bere') { hd(new THREE.SphereGeometry(0.28, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), hc, 0, 2.0, 0); hd(new THREE.SphereGeometry(0.1, 5, 4), 0xf2efe6, 0, 2.3, 0); }
  else if (L.hat === 'hasir') { hd(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 12), 0xf0dc9c, 0, 2.12, 0); hd(new THREE.CylinderGeometry(0.2, 0.23, 0.2, 10), 0xf0dc9c, 0, 2.22, 0); hd(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 10), hc, 0, 2.17, 0); }
  else if (L.hat === 'esarp') { hd(new THREE.SphereGeometry(0.27, 10, 7, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.62), hc, 0, 1.95, -0.03); hd(new THREE.TorusGeometry(0.235, 0.035, 4, 12, Math.PI * 1.1), hc, 0, 1.95, 0.12, 0, 0, -0.05 * Math.PI); hd(new THREE.ConeGeometry(0.2, 0.32, 8), hc, 0, 1.62, -0.12); }
  else if (L.hat === 'fes') { hd(new THREE.CylinderGeometry(0.17, 0.21, 0.3, 10), 0xd42a33, 0, 2.22, 0); hd(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 4), 0x1a1a1a, 0.12, 2.26, 0, 0, 0, 0.6); }
  else if (L.hat === 'kep') { hd(new THREE.SphereGeometry(0.26, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), hc, 0, 2.0, 0); hd(new THREE.BoxGeometry(0.3, 0.04, 0.26), hc, 0, 2.02, 0.32); }
  if (L.scarf) { up(new THREE.CylinderGeometry(0.22, 0.27, 0.17, 8), L.scarfCol, 0, 1.68, 0); up(new THREE.BoxGeometry(0.13, 0.42, 0.05), L.scarfCol, 0.1, 1.48, 0.28); }
  if (L.glasses) { // iki koyu cam, açık renk çerçeve: ten renginden ayrılsın
    hd(new THREE.BoxGeometry(0.46, 0.05, 0.04), L.glassFrame, 0, 2.01, 0.22);
    for (const x of [-0.1, 0.1]) hd(new THREE.BoxGeometry(0.17, 0.13, 0.05), 0x101218, x, 1.97, 0.23);
  }
  if (L.belly) hd(new THREE.SphereGeometry(0.3, 9, 7), L.shirt, 0, 1.08, 0.08, 0, 0, 0, 1, 0.9, 0.95); // amca göbeği
  if (L.beard) hd(new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), L.beard, 0, 1.9, 0.07, 0, 0, 0, 1, 1.1, 1);
  if (L.must) { // pala bıyık: iki yana sarkan, uzaktan seçilsin diye kalın
    for (const s of [-1, 1]) hd(new THREE.BoxGeometry(0.15, 0.06, 0.07), L.must, s * 0.08, 1.87, 0.22, 0, 0, s * 0.35);
  }
  if (L.bun) hd(new THREE.SphereGeometry(0.12, 7, 5), HAIRS[L.hair], 0, 2.14, -0.16);
  if (L.cane && !sit && mode !== 'feed' && L.pose === 'down') { // dedenin bastonu: sol elde, yere dayalı
    k.add(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 5), 0x5a3a22, -0.46, 0.47, 0.08);
    up(new THREE.BoxGeometry(0.16, 0.05, 0.05), 0x5a3a22, -0.4, 0.96, 0.08);
  }
  if (L.bag) { up(new THREE.BoxGeometry(0.16, 0.5, 0.44), L.bag, 0.38, 1.0, -0.05); up(new THREE.BoxGeometry(0.04, 0.6, 0.04), L.bag, 0.24, 1.55, 0.05, 0, 0, -0.5); }
  // kollar: sol duruşa göre (aşağı / belde / telefon), sağ simit tutuyorsa ya da kızgınsa havada
  const arm = L.shirt;
  if (sit) { // iki el kucakta; çaycı ise kucakta ince belli çay bardağı
    for (const x of [-0.27, 0.27]) cyl(0.06, 0.06, 0.62, arm, x, 1.12, 0.18, 0, 0.75);
    if (L.tea) { up(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 10), 0xf6f3ea, 0, 0.92, 0.42); up(new THREE.CylinderGeometry(0.075, 0.055, 0.2, 8), 0xb8401c, 0, 1.03, 0.42); }
  } else if (mode === 'feed') { // küpeşteye yaslanmış: sol el küpeştede, sağ kol simitle öne ve yukarı
    cyl(0.06, 0.06, 0.7, arm, -0.3, 1.25, 0.25, 0, 0.6);
    cyl(0.06, 0.06, 0.78, arm, 0.3, 1.93, 0.33, 0, 0.75);
  } else {
    if (L.pose === 'hip') { cyl(0.06, 0.06, 0.42, arm, -0.42, 1.36, 0, -0.9); cyl(0.06, 0.06, 0.4, arm, -0.38, 1.02, 0, 0.9); }
    else if (L.pose === 'phone') { cyl(0.06, 0.06, 0.42, arm, -0.33, 1.4, 0.08, 0.2); cyl(0.06, 0.06, 0.4, arm, -0.27, 1.62, 0.2, 0, -1.3); up(new THREE.BoxGeometry(0.12, 0.2, 0.03), 0x1b1c22, -0.22, 1.82, 0.36); }
    else cyl(0.06, 0.06, 0.78, arm, -0.34, 1.22, 0, 0.18);
    if (hold || angry) cyl(0.06, 0.06, 0.78, arm, 0.3, 2.0, 0, -0.12);
    else if (L.pose === 'wave') cyl(0.06, 0.06, 0.78, arm, 0.42, 1.95, 0, -0.55);
    else cyl(0.06, 0.06, 0.78, arm, 0.34, 1.22, 0, -0.18);
  }
  const g = k.build();
  personCache.set(key, g);
  return g;
}
// sınırlı sayıda görünüm: önbellek en fazla 40 × birkaç geometride doyar.
// Tipler: amca (bıyık, göbek, kasket/fes), dede (beyaz saç, sakal, baston, gözlük), teyze (etek, eşarp ya da topuz, çanta),
// abla (uzun saç, telefon, güneş gözlüğü), genç (bere/kep). Tip, simidi kapılınca ne bağıracağını da belirler (main.js).
const KINDS = ['amca', 'amca', 'amca', 'dede', 'dede', 'teyze', 'teyze', 'teyze', 'abla', 'genc'];
const LOOKS = Array.from({ length: 40 }, (_, id) => {
  const kind = KINDS[id % KINDS.length], r = Math.random;
  const L = {
    id, kind, shirt: SHIRTS[(id * 7) % SHIRTS.length], pants: pick(PANTS), skin: pick(SKINS), skirt: false,
    hair: (r() * 3) | 0, long: false, hat: '', hatCol: pick(HAT_COLS), scarf: false, scarfCol: pick([0xd8352e, 0x2f7fd0, 0xf2b81c, 0xf2efe6, 0x2bb3a3]),
    jacket: 0, glasses: false, glassFrame: pick([0xf2efe6, 0xe3b23c, 0xd8352e, 0x1b1c22]),
    bag: 0, tea: r() < 0.8, pose: pick(['down', 'down', 'hip', 'phone', 'wave']),
  };
  const bag = () => pick([0xd8352e, 0xf2b81c, 0x2bb3a3, 0x8a5a32, 0x7d5ba6]);
  if (kind === 'amca') {
    Object.assign(L, { shirt: pick([0xf2efe6, 0x8fbf9f, 0x5fa8d3, 0xc98b5a, 0xe3b23c, 0x3a6ea5]), hair: pick([0, 2, 3]), must: pick([0x1a1a1a, 0x2e211a, 0x8a8178]),
      belly: r() < 0.55, hat: pick(['kasket', 'kasket', 'fes', 'hasir', '']), jacket: r() < 0.45 ? pick([0x2f3b4c, 0x5a4636, 0x6b7a5a]) : 0, glasses: r() < 0.45, pose: pick(['down', 'hip', 'hip', 'wave', 'phone']) });
  } else if (kind === 'dede') {
    Object.assign(L, { shirt: pick([0xf2efe6, 0xc9c3b8, 0x8fbf9f, 0xe8d8a8]), hair: 3, must: 0xece8e0, beard: r() < 0.55 ? 0xece8e0 : 0, cane: r() < 0.75,
      hat: pick(['kasket', 'kasket', 'fes', 'hasir', '']), hatCol: pick([0x3b3b3b, 0x5a4636, 0x2f3b4c]), jacket: pick([0x6b5a4a, 0x2f3b4c, 0x8a7a64, 0x5a6b5a]), glasses: r() < 0.7, pose: 'down' });
  } else if (kind === 'teyze') {
    const esarp = r() < 0.5;
    Object.assign(L, { skirt: r() < 0.8, hair: pick([0, 1, 4, 5]), long: !esarp && r() < 0.3, bun: !esarp && r() < 0.5, hat: esarp ? 'esarp' : r() < 0.2 ? 'hasir' : '',
      hatCol: pick([0xe89bb0, 0x7d5ba6, 0x2bb3a3, 0xd8352e, 0xe8d8a8, 0x3a6ea5]), shirt: pick([0xe89bb0, 0x7d5ba6, 0xd9544f, 0x4f9d69, 0xe07a5f, 0xe3b23c]),
      pants: pick([0x2f4f6f, 0x5a4636, 0x7d5ba6, 0x262c3a]), bag: r() < 0.6 ? bag() : 0, glasses: r() < 0.35, scarf: r() < 0.25, pose: pick(['down', 'hip', 'wave', 'down']) });
  } else if (kind === 'abla') {
    Object.assign(L, { skirt: r() < 0.5, hair: pick([0, 1, 2, 4, 5]), long: true, hat: r() < 0.25 ? pick(['hasir', 'bere']) : '', bag: r() < 0.5 ? bag() : 0,
      glasses: r() < 0.4, glassFrame: pick([0xe3b23c, 0xd8352e, 0x1b1c22]), scarf: r() < 0.2, pose: pick(['phone', 'phone', 'wave', 'down']) });
  } else {
    Object.assign(L, { hair: pick([0, 1, 2, 4]), hat: r() < 0.6 ? pick(['bere', 'kep', 'kep']) : '', scarf: r() < 0.3, glasses: r() < 0.25, pose: pick(['phone', 'wave', 'down']) });
  }
  return L;
});
const SIMITCI_LOOK = { id: 'simitci', shirt: 0xf2efe6, pants: 0x262c3a, skin: 0xd49b74, hair: 1, hat: 'kasket', hatCol: 0x3b3b3b, scarf: true, scarfCol: 0xc8352e, pose: 'down' };
// simidin elde durduğu yer (yolcunun yerel ekseninde)
const SIMIT_AT = { '': [0.34, 2.56, 0], feed: [0.3, 2.3, 0.66] };
export function makePerson(hold, look = pick(LOOKS), mode = '') {
  const mesh = new THREE.Mesh(personGeo(look, hold, false, mode), vcMat);
  mesh.castShadow = true;
  mesh.rotation.y = rand(-0.6, 0.6);
  // simit tutanların boyu sabit (elindeki simidin yeri main.js'te hesaplanır); ötekiler biraz uzun/kısa, arada çocuk
  const kid = !hold && Math.random() < 0.08;
  if (!hold) mesh.scale.setScalar(kid ? 0.68 : rand(0.92, 1.08));
  let simit = null;
  if (hold) { simit = makeSimit(); simit.position.set(...SIMIT_AT[mode] || SIMIT_AT['']); mesh.add(simit); }
  const angryGeo = () => personGeo(look, false, true, mode === 'sit' ? 'sit' : '');
  return { mesh, simit, sy: simit ? simit.position.y : 0, angryGeo, calmGeo: mesh.geometry, angry: 0, ph: Math.random() * 6, feeder: mode === 'feed', sit: mode === 'sit', kind: kid ? 'cocuk' : look.kind || 'amca' };
}
// bütün yolcu kalıplarını boşta parça parça hazırla: simit kapıldığı an (kızgın yüz) ya da yeni vapur gelince üretim takılması olmasın
export function warmPeople() {
  const jobs = [];
  for (const L of LOOKS) for (const [h, a, m] of [[true, false, ''], [false, false, ''], [false, true, ''], [false, false, 'sit'], [false, true, 'sit'], [true, false, 'feed']]) jobs.push(() => personGeo(L, h, a, m));
  jobs.push(() => personGeo(SIMITCI_LOOK, true, false, ''));
  const next = () => { for (let i = 0; i < 4 && jobs.length; i++) jobs.shift()(); if (jobs.length) setTimeout(next, 30); };
  setTimeout(next, 300);
}
// güverte bankı: küpeşte boyunca, sırtı içe dönük; oturanlar denize bakar
export const BENCH = new Kit()
  .add(new THREE.BoxGeometry(0.5, 0.07, 2.1), 0xa8743e, 0, 0.47, 0)
  .add(new THREE.BoxGeometry(0.06, 0.4, 2.1), 0xa8743e, -0.27, 0.78, 0, 0, 0, 0.12)
  .add(new THREE.BoxGeometry(0.42, 0.45, 0.06), 0x2b3a4c, 0, 0.22, -0.9)
  .add(new THREE.BoxGeometry(0.42, 0.45, 0.06), 0x2b3a4c, 0, 0.22, 0.9)
  .build();

// can simidi: turuncu-beyaz dilimli halka; tekne kenarlarına asılır (ry: yüzü dışa baksın)
const BUOY_RING = (f) => (f % 8 < 4 ? 0xff7a1a : 0xffffff);
const lifeRing = (k, r, x, y, z, ry = Math.PI / 2) => k.add(new THREE.TorusGeometry(r, r * 0.32, 5, 12), BUOY_RING, x, y, z, 0, ry);
// dekor teknelerinin tayfası: güvertede duran yolcular; main.js martı yakınken zıplatır, el sallatır (userData.crew)
function addCrew(g, spots) {
  g.userData.crew = spots.map(([x, y, z, ry, sit]) => {
    const p = makePerson(false, undefined, sit ? 'sit' : ''); p.mesh.position.set(x, y, z); p.mesh.rotation.y = ry; p.mesh.scale.setScalar(0.85);
    g.add(p.mesh);
    return { m: p.mesh, y, ph: Math.random() * 6, sit: !!sit };
  });
}

// ---------------- simitçi kayığı ----------------
// Kenarda sallanan sandal; simitçi tepsiden alıp martıya simit fırlatır. Tepsideki yığın atıldıkça azalır.
function boatHull(depth = 0.75) {
  const s = new THREE.Shape();
  s.moveTo(0, -2.4); s.quadraticCurveTo(1.05, -1.2, 1, 0.4); s.quadraticCurveTo(0.95, 1.8, 0, 2.3);
  s.quadraticCurveTo(-0.95, 1.8, -1, 0.4); s.quadraticCurveTo(-1.05, -1.2, 0, -2.4);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  return g;
}
// gövde renk şeritleri ayrı katmanlar (tek kalıpta yüz rengi testere dişi gibi kırılır); bands: [[kalınlık, renk], ...] alttan üste
function hullBands(k, bands, y0, sx = 1, sz = 1) {
  let y = y0;
  for (const [h, c] of bands) { k.add(boatHull(h), c, 0, y, 0, 0, 0, 0, sx, 1, sz); y += h; }
  return k;
}
const BOAT = hullBands(new Kit(), [[0.4, 0xf3efe6], [0.22, 0x3a7fc2], [0.13, 0xc8352e]], -0.25)
  .add(new THREE.BoxGeometry(1.75, 0.08, 4), 0x9c6a3e, 0, 0.32, 0)
  .add(new THREE.BoxGeometry(1.9, 0.1, 0.32), 0xa8774a, 0, 0.45, -1.1)
  .add(new THREE.BoxGeometry(1.9, 0.1, 0.32), 0xa8774a, 0, 0.45, 1.2)
  .add(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4), 0x8a5a32, 1.1, 0.55, 0.3, 0.4, 0, 1.35)
  .add(new THREE.CylinderGeometry(0.5, 0.42, 0.08, 10), 0x7a4a26, 0, 0.62, -1.1)
  .build();
const BOAT_TRAY = [[0, 0], [0.22, 0.14], [-0.2, 0.16], [0.02, -0.24], [0.1, 0.05, 1], [-0.12, -0.04, 1]];
// side: kayığın durduğu kenar (+1 sağ); simitçi koridora döner
export function makeSimitBoat(side) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(BOAT, vcMat); hull.castShadow = true; g.add(hull);
  const p = makePerson(true, SIMITCI_LOOK);
  p.mesh.position.set(0, 0.36, 0.25); p.mesh.rotation.y = side > 0 ? Math.PI : 0; g.add(p.mesh);
  const tray = BOAT_TRAY.map(([x, z, up]) => {
    const m = makeSimit(); m.position.set(x, 0.72 + (up ? 0.1 : 0), -1.1 + z); m.rotation.x = -Math.PI / 2 + rand(-0.2, 0.2); m.scale.setScalar(0.75);
    g.add(m); return m;
  });
  return { g, person: p, tray };
}

// ---------------- balıkçı teknesi ----------------
// Koridorun dışında demirli; kamaralı, direkli, oltalı balıkçı. Renk çiftleri pastel.
const FISH_COLS = [[0xf3efe6, 0x5fa8d3, 0xe07a5f], [0xf3efe6, 0x4f9d69, 0xe3b23c], [0x8fc3d9, 0xf3efe6, 0xd9544f], [0xf6e7c8, 0x3a6ea5, 0xc8352e]];
const fishCache = [];
function fishingBoatGeo(ci) {
  if (fishCache[ci]) return fishCache[ci];
  const [hullC, band, roof] = FISH_COLS[ci];
  const k = hullBands(new Kit(), [[0.4, 0x2b3a4c], [0.5, hullC], [0.22, band]], -0.3, 1.7, 1.9)
    .add(new THREE.BoxGeometry(2.9, 0.08, 7), 0xa8774a, 0, 0.55, 0)
    .add(new THREE.BoxGeometry(1.7, 1.3, 1.8), 0xf3efe6, 0, 1.2, 1.3)
    .add(new THREE.BoxGeometry(1.74, 0.35, 1.84), band, 0, 1.35, 1.3)
    .add(new THREE.BoxGeometry(2, 0.12, 2.1), roof, 0, 1.92, 1.3)
    .add(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 5), 0xf3efe6, 0, 2.6, -1)
    .add(new THREE.BoxGeometry(1.6, 0.05, 0.05), 0xf3efe6, 0, 3.6, -1)
    .add(new THREE.SphereGeometry(0.16, 6, 4), 0xffe07a, 0, 4.75, -1)
    .add(new THREE.SphereGeometry(0.55, 7, 5), 0x7d8f6a, 0.5, 0.65, -2.3, 0, 0, 0, 1.2, 0.45, 1) // ağ yığını
    ;
  for (const s of [-1, 1]) lifeRing(k, 0.36, s * 1.5, 0.85, 0.2);
  return (fishCache[ci] = k.build());
}
const ROD = new Kit().add(new THREE.CylinderGeometry(0.025, 0.04, 3.2, 4), 0x3a2a1c, 0, 1.6, 0).build();
const rodLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
const ROD_LINE = new THREE.CylinderGeometry(0.008, 0.008, 3.4, 3);
// side: hangi kıyıda (+1 sağ); balıkçı koridora doğru olta sallar
export function makeFishingBoat(side) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(fishingBoatGeo((Math.random() * FISH_COLS.length) | 0), vcMat); hull.castShadow = true; g.add(hull);
  const p = makePerson(false); p.mesh.position.set(-side * 0.7, 0.58, -1.2); p.mesh.rotation.y = rand(-0.4, 0.4); g.add(p.mesh);
  addCrew(g, Math.random() < 0.6 ? [[side * 0.5, 0.58, 2.6, 0]] : []);
  const rod = new THREE.Mesh(ROD, vcMat); rod.position.set(-side * 0.95, 1.7, -1.2); rod.rotation.z = side * 0.9; g.add(rod);
  const line = new THREE.Mesh(ROD_LINE, rodLineMat); line.position.set(-side * 3.35, 2, -1.2); g.add(line);
  return g;
}

// ---------------- yelkenli ve küçük yat ----------------
// Yelken üçgeni direğin arkasına doğru uzanır; pruva -z. Renkler pastel, yelkenler kırık beyaz ya da çizgili.
const SAIL_COLS = [[0xf3efe6, 0x3a6ea5, 0xfdf7ec], [0x2b3a4c, 0xe07a5f, 0xf6e7c8], [0xf3efe6, 0x4f9d69, 0xfdf7ec], [0xf6e7c8, 0xc8352e, 0xf3efe6]];
const sailCache = [];
function sailTri(w, h) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }); g.rotateY(Math.PI / 2); // yelken y-z düzleminde, +z'ye uzanır
  return g;
}
export function sailboatGeo(ci) {
  if (sailCache[ci]) return sailCache[ci];
  const [hullC, band, sail] = SAIL_COLS[ci];
  const k = hullBands(new Kit(), [[0.35, 0x2b3a4c], [0.45, hullC], [0.16, band]], -0.3, 1.25, 1.35)
    .add(new THREE.BoxGeometry(2.1, 0.07, 5.4), 0xb98a5a, 0, 0.62, 0)
    .add(new THREE.BoxGeometry(1.3, 0.55, 1.6), 0xf3efe6, 0, 0.9, 0.6)
    .add(new THREE.CylinderGeometry(0.07, 0.09, 8, 5), 0xf3efe6, 0, 4.6, -0.6)
    .add(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 4), 0xf3efe6, 0, 1.55, 1.2, Math.PI / 2)
    .add(sailTri(3.5, 7), (f, y) => (ci % 2 && y > 3 && y < 4.4 ? band : sail), 0, 1.25, -0.5)   // ana yelken
    .add(sailTri(2.4, 6.2), sail, 0, 1.0, -0.75, 0, Math.PI, 0)                                   // flok
    .add(new THREE.BoxGeometry(0.05, 0.4, 0.7), band, 0, 8.7, -0.3);                               // flama
  for (const s of [-1, 1]) lifeRing(k, 0.32, s * 1.12, 0.55, 1.6);
  return (sailCache[ci] = k.build());
}
export function makeSailboat(ci = (Math.random() * SAIL_COLS.length) | 0) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(sailboatGeo(ci), vcMat); h.castShadow = true; g.add(h);
  addCrew(g, [[0.35, 0.66, 2.0, 0], ...(Math.random() < 0.5 ? [[-0.4, 0.66, -1.8, 0.4]] : [])]);
  return g;
}
const YACHT_K = hullBands(new Kit(), [[0.35, 0x2b3a4c], [0.55, 0xfdf7ec], [0.12, 0x5fa8d3]], -0.3, 1.5, 1.6)
  .add(new THREE.BoxGeometry(2.6, 0.07, 6.6), 0xb98a5a, 0, 0.72, 0)
  .add(new THREE.BoxGeometry(2.1, 0.9, 3.2), 0xfdf7ec, 0, 1.2, 0.6)
  .add(new THREE.BoxGeometry(2.14, 0.32, 3.24), 0x2b3a4c, 0, 1.3, 0.6)
  .add(new THREE.BoxGeometry(1.6, 0.7, 1.8), 0xfdf7ec, 0, 2, 0.9)
  .add(new THREE.BoxGeometry(1.64, 0.26, 1.84), 0x2b3a4c, 0, 2.05, 0.9)
  .add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 4), 0xfdf7ec, 0, 3, 1.2)
  .add(new THREE.BoxGeometry(0.04, 0.3, 0.5), 0xe30a17, 0, 3.5, 1.4);
for (const s of [-1, 1]) for (const z of [-1.4, 2.4]) lifeRing(YACHT_K, 0.34, s * 1.48, 0.6, z);
const YACHT = YACHT_K.build();
export function makeYacht() {
  const g = new THREE.Group(), h = new THREE.Mesh(YACHT, vcMat); h.castShadow = true; g.add(h);
  addCrew(g, [[-0.5, 0.76, -2.2, 0], [0.5, 0.76, -1.5, 0.3], ...(Math.random() < 0.6 ? [[0.3, 2.36, 0.4, 0, true]] : [])]);
  return g;
}

// ---------------- dev yolcu gemisi (uzakta, sağ kıyıda) ----------------
// Beyaz gövde, kat kat pencere bantları, balkon sıraları, iki kalın baca. Pruva -z.
// Uzakta olduğu için sis yarı güçte: yoksa ufkun rengine gömülüp şekilsiz bir bloğa döner.
export const cruiseMat = vcMat.clone();
cruiseMat.onBeforeCompile = function (sh) {
  THREE.Material.prototype.onBeforeCompile.call(this, sh);
  sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth) * 0.5);
#endif`);
};
cruiseMat.customProgramCacheKey = () => 'cruise';
export const CRUISE = (() => {
  const k = new Kit(), L = 96;
  const hull = new THREE.Shape(); hull.moveTo(-7, -L / 2 + 6); hull.quadraticCurveTo(-7, -L / 2 - 2, 0, -L / 2 - 6); hull.quadraticCurveTo(7, -L / 2 - 2, 7, -L / 2 + 6);
  hull.lineTo(7, L / 2 - 2); hull.quadraticCurveTo(7, L / 2, 5, L / 2); hull.lineTo(-5, L / 2); hull.quadraticCurveTo(-7, L / 2, -7, L / 2 - 2); hull.closePath();
  const band = (h) => { const g = new THREE.ExtrudeGeometry(hull, { depth: h, bevelEnabled: false, curveSegments: 4 }); g.rotateX(Math.PI / 2); g.translate(0, h, 0); return g; };
  let y = -1.5;
  for (const [h, c] of [[2.2, 0x22324a], [0.5, 0xc8352e], [4.2, 0xfdf9f2], [0.9, 0x2f5f8f], [1.3, 0xfdf9f2]]) { k.add(band(h), c, 0, y, 0); y += h; }
  // üst katlar: geriye doğru kısalan bloklar, her katta koyu cam şeridi
  for (let i = 0; i < 5; i++) {
    const w = 13 - i * 0.6, len = L - 22 - i * 8, z = 6 + i * 2.5, base = y + i * 2.2;
    k.add(new THREE.BoxGeometry(w, 2.2, len), 0xfdf9f2, 0, base + 1.1, z);
    k.add(new THREE.BoxGeometry(w + 0.08, 0.7, len - 2), i === 4 ? 0x5fa8d3 : 0x3b5578, 0, base + 1.25, z);
  }
  const top = y + 11;
  k.add(new THREE.BoxGeometry(9, 1.4, 12), 0xfdf9f2, 0, top + 0.7, -14);          // köprü üstü
  k.add(new THREE.BoxGeometry(9.1, 0.6, 12.1), 0x22324a, 0, top + 0.8, -14);
  for (const zf of [16, 28]) {
    k.add(new THREE.CylinderGeometry(1.9, 2.3, 6, 10), 0xfdf9f2, 0, top + 3, zf, 0, 0, 0, 1, 1, 1.5);
    k.add(new THREE.CylinderGeometry(1.95, 1.95, 1.4, 10), 0xc8352e, 0, top + 5, zf, 0, 0, 0, 1, 1, 1.5);
    k.add(new THREE.CylinderGeometry(1.85, 1.85, 0.5, 10), 0x22324a, 0, top + 6.1, zf, 0, 0, 0, 1, 1, 1.5);
  }
  // havuz güvertesi: mavi dikdörtgen ve şemsiyeler
  k.add(new THREE.BoxGeometry(5, 0.12, 8), 0x6fd3e8, 0, top + 0.06, 2);
  for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry(0.9, 0.5, 6), i % 2 ? 0xffc23a : 0xe07a5f, (i % 2 ? 1 : -1) * 3.2, top + 1.6, -4 + i * 3);
  for (const s of [-1, 1]) for (let z = -34; z <= 42; z += 9) lifeRing(k, 0.75, s * 7.08, 3.4, z); // gövde boyunca turuncu can simitleri
  return k.build();
})();
// dev gemide yolcular: üst güvertede ve basamaklı teraslarda kalabalık; martı geçerken zıplayıp el sallarlar.
// Renk başına bir InstancedMesh (gemi başına birkaç draw call); konumlar CRUISE'un yerel ekseninde
const CROWD_COLS = [0xff5a5f, 0xffc23a, 0x2bb3a3, 0x5fa8d3, 0xf2efe6, 0xe89bb0];
const CROWD_GEOS = CROWD_COLS.map((c, i) => new Kit()
  .add(new THREE.CylinderGeometry(0.32, 0.4, 1.1, 6), c, 0, 0.75, 0)
  .add(new THREE.SphereGeometry(0.32, 7, 5), SKINS[i % SKINS.length], 0, 1.6, 0)
  .add(new THREE.SphereGeometry(0.33, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), HAIRS[i % 3], 0, 1.66, -0.03)
  .add(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 4), c, 0.42, 1.55, 0, 0, 0, -0.5) // el sallayan kol
  .add(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 4), 0x2b3a4c, 0, 0.1, 0).build().scale(1.5, 1.5, 1.5)); // uzaktan seçilsin diye iri
const CROWD_SPOTS = (() => {
  const out = [], y0 = 7.6;
  for (let i = 0; i < 26; i++) { // üst güverte (havuzun çevresi)
    const x = rand(-4.6, 4.6), z = rand(-4, 13);
    if (Math.abs(x) < 3 && z > -2.5 && z < 6.5) continue;
    out.push([x, y0 + 11, z]);
  }
  for (let i = 0; i < 4; i++) { // teraslar: her katın önünde açıkta kalan şerit
    const z0 = 6 + i * 2.5 - (74 - 8 * i) / 2, z1 = 6 + (i + 1) * 2.5 - (74 - 8 * (i + 1)) / 2;
    for (let n = 0; n < 5; n++) out.push([rand(-5.2, 5.2), y0 + 2.2 * (i + 1), rand(z0 + 0.6, z1 - 0.6)]);
  }
  return out;
})();
export function makeCruise() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(CRUISE, cruiseMat));
  const crowd = [];
  CROWD_GEOS.forEach((geo, c) => {
    const spots = CROWD_SPOTS.filter((_, i) => i % CROWD_GEOS.length === c);
    const im = new THREE.InstancedMesh(geo, cruiseMat, spots.length);
    im.frustumCulled = false; // örnekler gövdenin üstüne yayılıyor; sınır küresi tek kişilik kalır
    g.add(im);
    crowd.push({ im, spots: spots.map(([x, y, z]) => ({ x, y, z, ph: Math.random() * 6, ry: rand(-0.6, 0.6) })) });
  });
  g.userData.crowd = crowd;
  animCrowd(g, 0);
  return g;
}
const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler(), _cp = new THREE.Vector3(), _cs = new THREE.Vector3(1, 1, 1);
// kalabalık zıplar: her biri kendi ritminde, el sallarken hafifçe sallanır
export function animCrowd(g, t) {
  for (const { im, spots } of g.userData.crowd) {
    spots.forEach((s, i) => {
      const j = Math.max(0, Math.sin(t * 7 + s.ph * 3)) * 1.1;
      _cm.compose(_cp.set(s.x, s.y + j, s.z), _cq.setFromEuler(_ce.set(0, s.ry + (g.userData.face ?? -Math.PI / 2), Math.sin(t * 5 + s.ph) * 0.15)), _cs);
      im.setMatrixAt(i, _cm);
    });
    im.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- Kız Kulesi (yakın, kıyıdan geçerken) ----------------
export const MAIDEN = (() => {
  const k = new Kit();
  k.add(new THREE.DodecahedronGeometry(9, 0), (f, y) => (y > 0.5 ? 0xb7a58f : 0x8d7f70), 0, -3.5, 0, 0, 0, 0, 1.25, 0.5, 1);
  k.add(new THREE.BoxGeometry(14, 0.5, 10), 0xd8cdb8, 0, 1.2, 0);
  k.add(new THREE.BoxGeometry(10, 4.5, 7), 0xf6eee0, -1.5, 3.6, 0.5);
  k.add(new THREE.BoxGeometry(10.3, 0.4, 7.3), 0xcfa58c, -1.5, 5.95, 0.5);
  for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.9, 1.4, 0.1), 0x5f7fa8, -5 + i * 2.3, 3.8, 4.06);
  k.add(new THREE.CylinderGeometry(2, 2.2, 12, 10), 0xf6eee0, 3.5, 7, -0.5);
  k.add(new THREE.CylinderGeometry(2.35, 2.35, 0.5, 10), 0xcfa58c, 3.5, 10.5, -0.5);
  k.add(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10), 0xf6eee0, 3.5, 12.9, -0.5);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.add(new THREE.BoxGeometry(0.5, 1, 0.1), 0x5f7fa8, 3.5 + Math.sin(a) * 1.62, 12.9, -0.5 + Math.cos(a) * 1.62, 0, a); }
  k.add(new THREE.ConeGeometry(2, 3.4, 10), 0x8fa9c4, 3.5, 15.8, -0.5);
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 4), 0xd9b24a, 3.5, 18.2, -0.5);
  k.add(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0xe30a17, 4, 18.6, -0.5); // bayrak
  return k.build();
})();

// ---------------- hat iskeleleri ----------------
// İskele binası: krem duvar, kiremit çatı, saat kulesi, suya uzanan ahşap iskele. Ön yüz -x'e (koridora) bakar; sol kıyıda Math.PI döndürülür.
export const PIER = (() => {
  const k = new Kit(), cream = 0xf3e6cc, tile = 0xc0533a, wood = 0x8a6242, glassC = 0x5f7fa8;
  k.add(new THREE.BoxGeometry(6, 0.35, 12), wood, -6.2, 1.1, 0); // iskele tahtası
  for (let z = -5; z <= 5; z += 2.5) for (const x of [-8.8, -3.8]) k.add(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 6), 0x5b4130, x, 0, z);
  k.add(new THREE.BoxGeometry(5.2, 0.18, 11), tile, -6, 4.3, 0, 0, 0, 0.08); // iskele saçağı
  for (const z of [-5, 0, 5]) k.add(new THREE.CylinderGeometry(0.1, 0.1, 3.1, 6), 0xe8e2d6, -8.4, 2.75, z);
  k.add(new THREE.BoxGeometry(7, 5, 15), cream, 0, 3.5, 0); // bina
  k.add(new THREE.BoxGeometry(7.3, 0.35, 15.3), 0xd9c7a5, 0, 3.6, 0); // kat silmesi
  for (let z = -6; z <= 6; z += 2) { k.add(new THREE.BoxGeometry(0.1, 1.3, 0.9), glassC, -3.52, 5, z); if (Math.abs(z) > 1) k.add(new THREE.BoxGeometry(0.1, 1.4, 0.9), glassC, -3.52, 2.3, z); }
  k.add(new THREE.BoxGeometry(0.1, 2, 2), 0x6b4a33, -3.52, 2.1, 0); // kapı
  k.add(new THREE.ConeGeometry(5.6, 2.6, 4), tile, 0, 7.3, 0, 0, Math.PI / 4, 0, 0.9, 1, 1.95); // kırma çatı
  k.add(new THREE.BoxGeometry(2.4, 4.2, 2.4), cream, -1.2, 9.4, 0); // saat kulesi
  k.add(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 16), 0xfdfaf2, -2.45, 10.3, 0, 0, 0, Math.PI / 2);
  k.add(new THREE.BoxGeometry(0.06, 0.55, 0.08), 0x222222, -2.53, 10.45, 0);
  k.add(new THREE.ConeGeometry(2, 1.8, 4), tile, -1.2, 12.4, 0, 0, Math.PI / 4);
  k.add(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 4), 0xd9b24a, -1.2, 13.9, 0);
  k.add(new THREE.BoxGeometry(0.05, 0.5, 0.75), 0xe30a17, -1.2, 14.3, 0.4); // bayrak
  return k.build();
})();
// Karadeniz ağzı: iskele yerine fener
export const LIGHTHOUSE = (() => {
  const k = new Kit();
  k.add(new THREE.DodecahedronGeometry(5, 0), (f, y) => (y > 0.3 ? 0x9d927f : 0x6f6a60), 0, -1.5, 0, 0, 0, 0, 1.3, 0.5, 1.2);
  k.add(new THREE.CylinderGeometry(1.5, 2, 11, 12), (f, y) => (Math.floor((y + 5.5) / 2.75) % 2 ? 0xd8423a : 0xfaf6ee), 0, 6.5, 0);
  k.add(new THREE.CylinderGeometry(2, 2, 0.3, 12), 0x333a44, 0, 12.1, 0);
  k.add(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 10), 0xfff0a8, 0, 13, 0);
  k.add(new THREE.ConeGeometry(1.4, 1.4, 10), 0x333a44, 0, 14.5, 0);
  return k.build();
})();
// durak kapısı: koridorun iki yanında lacivert-beyaz direkler, tepede Şehir Hatları tabelası (kameranın üstünde, engel değil)
export const GATE_Y = 13;
export const GATE_POSTS = (() => {
  const k = new Kit();
  for (const s of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(0.32, 0.38, GATE_Y + 1.6, 8), (f, y) => (Math.floor((y + 8) / 1.6) % 2 ? 0x1d3c78 : 0xf6f3ea), s * 8.6, (GATE_Y + 1.6) / 2, 0);
    k.add(new THREE.SphereGeometry(0.45, 8, 6), 0xffc23a, s * 8.6, GATE_Y + 1.8, 0);
  }
  return k.build();
})();
const BOARD = new THREE.PlaneGeometry(16.4, 2.6);
const gateMats = new Map(); // durak başına bir kez: tekrar varışta aynı doku
export function makeStopGate(name) {
  if (!gateMats.has(name)) gateMats.set(name, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: canvasTex(512, 82, (g, w, h) => {
    g.fillStyle = '#1d3c78'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f6f3ea'; g.lineWidth = 5; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#f6f3ea'; g.font = '800 46px "Baloo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name.toLocaleUpperCase('tr'), w / 2, h / 2 + 3, w - 50);
  }) }));
  const g = new THREE.Group();
  const posts = new THREE.Mesh(GATE_POSTS, vcMat); posts.castShadow = true; g.add(posts);
  const b = new THREE.Mesh(BOARD, gateMats.get(name)); b.position.y = GATE_Y + 0.6; g.add(b);
  return g;
}

// ---------------- yunus ----------------
// Boğaz yunusu: burun +x yönünde; sırtı koyu gri-mavi, karnı açık. Tek geometri, bütün yunuslar paylaşır.
export const DOLPHIN = (() => {
  const k = new Kit(), back = 0x7a97ae, flank = 0xa9bfcf, belly = 0xf1f4f5;
  k.add(new THREE.SphereGeometry(0.5, 12, 8), (f, y) => (y < -0.1 ? belly : y < 0.08 ? flank : back), 0, 0, 0, 0, 0, 0, 1.8, 0.7, 0.64);
  k.add(new THREE.ConeGeometry(0.14, 0.36, 7), (f, y) => (y < -0.04 ? belly : back), 0.98, -0.06, 0, 0, 0, -Math.PI / 2); // gaga
  k.add(new THREE.SphereGeometry(0.035, 5, 4), 0x111418, 0.72, 0.06, 0.24);
  k.add(new THREE.SphereGeometry(0.035, 5, 4), 0x111418, 0.72, 0.06, -0.24);
  const fin = new THREE.Shape(); fin.moveTo(-0.3, 0); fin.lineTo(0.12, 0); fin.quadraticCurveTo(-0.05, 0.25, -0.32, 0.46); fin.quadraticCurveTo(-0.22, 0.2, -0.3, 0);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false }); finG.translate(0, 0, -0.03);
  k.add(finG, back, 0.0, 0.27, 0); // sırt yüzgeci
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.34, 0.04, 0.16), back, 0.35, -0.2, s * 0.3, s * 0.5, 0.5 * s, -0.3); // yan yüzgeçler
  k.add(new THREE.ConeGeometry(0.2, 0.7, 7), back, -1.15, 0.02, 0, 0, 0, Math.PI / 2, 1, 1, 0.75); // kuyruk sapı
  const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.lineTo(-0.28, 0.42); fl.lineTo(-0.12, 0); fl.lineTo(-0.28, -0.42); fl.closePath();
  const flG = new THREE.ExtrudeGeometry(fl, { depth: 0.05, bevelEnabled: false }); flG.rotateX(Math.PI / 2);
  k.add(flG, back, -1.45, 0.05, 0); // kuyruk yüzgeci (yatay)
  return k.build();
})();

// ---------------- güverte eşyaları ----------------
// çöp kutusu: gövde ve kapak ayrı (kapak fırlar, içinden simit kırığı zıplar); kasalar, halat kangalı, kasanın üstünde kedi
export const BIN = new Kit()
  .add(new THREE.CylinderGeometry(0.3, 0.25, 0.8, 10), 0x2f7d4a, 0, 0.4, 0)
  .add(new THREE.CylinderGeometry(0.305, 0.3, 0.12, 10), 0xf2efe6, 0, 0.55, 0)
  .add(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10), 0x1f5a35, 0, 0.79, 0)
  .build();
export const BIN_LID = new Kit()
  .add(new THREE.CylinderGeometry(0.3, 0.33, 0.1, 10), 0x2f7d4a, 0, 0.05, 0)
  .add(new THREE.BoxGeometry(0.2, 0.06, 0.06), 0xf2efe6, 0, 0.13, 0)
  .build();
export const CRATES = (() => {
  const k = new Kit(), wood = 0xb98a52, dark = 0x8a6236;
  const crate = (x, y, z, ry) => {
    k.add(new THREE.BoxGeometry(0.7, 0.5, 0.55), (f, cy) => (Math.abs(cy - y - 0.25) < 0.08 ? dark : wood), x, y + 0.25, z, 0, ry);
    for (let i = 0; i < 3; i++) k.add(new THREE.TorusGeometry(0.12, 0.05, 5, 10), 0xc9762e, x - 0.2 + i * 0.2, y + 0.53, z, Math.PI / 2, 0, 0); // üstte simitler
  };
  crate(0, 0, 0, 0.1); crate(0.05, 0.5, 0.02, -0.15); crate(0.72, 0, 0.05, -0.05);
  return k.build();
})();
export const ROPE = (() => {
  const k = new Kit();
  for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(0.42 - i * 0.07, 0.07, 5, 14), i % 2 ? 0xd9c08a : 0xc9ad74, 0, 0.07 + i * 0.1, 0, Math.PI / 2);
  return k.build();
})();
export const CAT = (() => {
  const k = new Kit(), c = 0xe08a3a, w = 0xfff1de;
  k.add(new THREE.SphereGeometry(0.2, 8, 6), (f, y) => (y < 0.12 ? w : c), 0, 0.2, 0, 0, 0, 0, 1, 1, 1.35);
  k.add(new THREE.SphereGeometry(0.15, 8, 6), c, 0, 0.42, 0.22);
  for (const s of [-1, 1]) k.add(new THREE.ConeGeometry(0.06, 0.12, 4), c, s * 0.08, 0.56, 0.22);
  for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(0.03, 4, 3), 0x2a4d1a, s * 0.06, 0.45, 0.35);
  k.add(new THREE.CylinderGeometry(0.035, 0.03, 0.5, 5), c, 0, 0.3, -0.36, -0.9);
  return k.build();
})();

// ---------------- Galata Köprüsü ----------------
// Koridoru boydan boya keser; tabliye kameranın üstünde (yakın kamera altından geçer). Ayaklar ve alt kattaki lokantalar şeridin dışında.
// Küpeşteden balıkçıların oltaları suya sarkar: ipler engel (main.js), her balıkçı + oltası tek geometri.
export const BRIDGE_Y = 12; // tabliyenin alt yüzü
export const bridgeMat = vcMat;
export const BRIDGE = (() => {
  const k = new Kit(), Y = BRIDGE_Y, W = 96, stone = 0xb9b0a0, steel = 0x6f8497, under = 0x4e5560;
  k.add(new THREE.BoxGeometry(W, 1, 6), (f, y) => (y < Y + 0.2 ? under : 0x9aa0a8), 0, Y + 0.5, 0);      // tabliye
  for (const s of [-1, 1]) {
    k.add(new THREE.BoxGeometry(W, 0.34, 0.24), steel, 0, Y + 0.85, s * 3.05);                             // yan kiriş
    k.add(new THREE.BoxGeometry(W, 0.08, 0.08), steel, 0, Y + 2.05, s * 2.9);                              // korkuluk
    for (let x = -W / 2; x <= W / 2; x += 1.4) k.add(new THREE.BoxGeometry(0.07, 1.05, 0.07), steel, x, Y + 1.55, s * 2.9);
    for (let x = -W / 2 + 4; x < W / 2; x += 11) {                                                        // fenerler
      k.add(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), 0x3c4652, x, Y + 2.6, s * 2.6);
      k.add(new THREE.SphereGeometry(0.26, 8, 6), 0xffe3a6, x, Y + 4.3, s * 2.6);
    }
  }
  for (const x of [-8.6, 8.6, -20, 20, -32, 32, -44, 44]) {                                                // ayaklar (sivri mahmuzlu)
    k.add(new THREE.BoxGeometry(2.2, Y + 1.5, 4.4), stone, x, (Y - 1.5) / 2, 0);
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(1.1, 1.1, Y + 1.5, 4, 1), stone, x, (Y - 1.5) / 2, s * 2.2, 0, Math.PI / 4, 0, 1, 1, 1);
  }
  for (const s of [-1, 1]) {                                                                               // alt kat lokantalar: kıyı tarafında
    const a = 9.8, b = W / 2, c = s * (a + b) / 2, w = b - a;
    k.add(new THREE.BoxGeometry(w, 2.8, 4.6), 0xe9e1d2, c, Y - 1.4, 0);
    for (const z of [-2.31, 2.31]) k.add(new THREE.BoxGeometry(w - 0.4, 1.1, 0.04), 0xffcf7e, c, Y - 1.3, z); // sıcak pencere şeridi
    k.add(new THREE.BoxGeometry(w, 0.18, 5.2), 0xc8352e, c, Y - 2.85, 0);                                  // tente
  }
  return k.build();
})();
// balıkçı: küpeştede durur, oltası dışarı (+z) uzanır. ROD_TIP: olta ucunun balıkçıya göre yeri
export const ROD_TIP = { y: 3.4, z: 2.2 };
const FISHER_COLS = [0x2f5d8a, 0x7a3b2e, 0x3d6b45, 0x5a4a7a];
export const FISHERS = FISHER_COLS.map((jacket, i) => {
  const k = new Kit(), skin = SKINS[i % SKINS.length];
  for (const x of [-0.11, 0.11]) k.add(new THREE.BoxGeometry(0.14, 0.62, 0.16), 0x2a2e36, x, 0.31, 0);
  k.add(new THREE.BoxGeometry(0.46, 0.62, 0.3), jacket, 0, 0.92, 0);
  k.add(new THREE.SphereGeometry(0.16, 8, 6), skin, 0, 1.38, 0);
  k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 8), i % 2 ? 0x2b2b30 : 0xd9c9a0, 0, 1.52, 0); // kasket
  k.add(new THREE.BoxGeometry(0.1, 0.1, 0.36), jacket, 0.16, 1.0, 0.2); // uzanan kol
  const rodLen = Math.hypot(ROD_TIP.y - 1.0, ROD_TIP.z - 0.35);
  k.add(new THREE.CylinderGeometry(0.018, 0.035, rodLen, 5), 0x2c2620, 0.16, (1.0 + ROD_TIP.y) / 2, (0.35 + ROD_TIP.z) / 2, Math.atan2(ROD_TIP.z - 0.35, ROD_TIP.y - 1.0));
  k.add(new THREE.BoxGeometry(0.4, 0.3, 0.3), 0xd8d2c4, -0.45, 0.15, 0.05); // kova
  return k.build();
});
// misina: üstten sarkar (orijin tepede); boyu scale.y ile ayarlanır. Altta kırmızı-beyaz mantar (su yüzünde işaret)
export const FLINE = (() => { const g = new THREE.CylinderGeometry(0.035, 0.035, 1, 4, 1); g.translate(0, -0.5, 0); return g; })();
export const flineMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
export const BOBBER = new Kit().add(new THREE.SphereGeometry(0.2, 8, 6), (f, y) => (y > 0 ? 0xe23a2e : 0xffffff)).add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), 0xffffff, 0, 0.3, 0).build();

// ---------------- vapur ----------------
export const DECK = 2.6;
// camlı salon: güvertede iki katlı kapalı salon, ortasından boydan boya geçit (martı içinden uçar).
// Geçidin iki yanı engel; tavanı cam, içeriden de görünür. tx: geçidin x'i (-0.6, 0, 0.6), SALON_LEN boyunca.
export const SALON_LEN = 14, SALON_GAP = 2.6, SALON_TOP = DECK + 4.3;
export const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8dcf0, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.4, depthWrite: false, side: THREE.DoubleSide });
const salonCache = new Map();
export function salonGeo(tx) {
  if (salonCache.has(tx)) return salonCache.get(tx);
  const k = new Kit(), gk = new Kit(), Lz = SALON_LEN;
  for (const [a, b] of [[-3.9, tx - SALON_GAP], [tx + SALON_GAP, 3.9]]) {
    const w = b - a, c = (a + b) / 2;
    k.add(new THREE.BoxGeometry(w, 0.8, Lz), 0xf3efe6, c, DECK + 0.4, 0);                 // alt duvar
    k.add(new THREE.BoxGeometry(w + 0.06, 0.22, Lz + 0.06), 0x2b4560, c, DECK + 2.05, 0); // katlar arası bant
    k.add(new THREE.BoxGeometry(w + 0.3, 0.2, Lz + 0.3), 0xf6f1e6, c, SALON_TOP - 0.1, 0); // çatı
    k.add(new THREE.BoxGeometry(w + 0.34, 0.09, Lz + 0.34), 0xc8352e, c, SALON_TOP - 0.24, 0); // kırmızı saçak şeridi
    for (let z = -Lz / 2; z <= Lz / 2 + 0.01; z += 2) for (const x of [a, b]) k.add(new THREE.BoxGeometry(0.1, SALON_TOP - DECK - 0.8, 0.1), 0xf3efe6, x, (DECK + 0.8 + SALON_TOP) / 2, z); // pencere dikmeleri
    gk.add(new THREE.BoxGeometry(w, 1.15, Lz), 0xffffff, c, DECK + 1.37, 0);                // 1. kat camı
    gk.add(new THREE.BoxGeometry(w, SALON_TOP - DECK - 2.4, Lz), 0xffffff, c, (DECK + 2.16 + SALON_TOP - 0.2) / 2, 0); // 2. kat camı
  }
  for (let z = -Lz / 2; z <= Lz / 2 + 0.01; z += 3.5) k.add(new THREE.BoxGeometry(SALON_GAP * 2 + 0.2, 0.12, 0.14), 0xf3efe6, tx, SALON_TOP - 0.1, z); // geçidin tavan kirişleri
  gk.add(new THREE.BoxGeometry(SALON_GAP * 2, 0.05, Lz), 0xffffff, tx, SALON_TOP - 0.15, 0); // cam tavan
  const out = { solid: k.build(), glass: gk.build() };
  salonCache.set(tx, out);
  return out;
}
export const FERRY_LENGTHS = [44, 49, 54, 58];
const ferryCache = new Map();
export function ferryGeo(L) {
  if (ferryCache.has(L)) return ferryCache.get(L);
  const k = new Kit();
  const sh = new THREE.Shape();
  sh.moveTo(-4, -L / 2 + 3); sh.quadraticCurveTo(-4, -L / 2, -1.5, -L / 2 - 1.2); sh.lineTo(1.5, -L / 2 - 1.2); sh.quadraticCurveTo(4, -L / 2, 4, -L / 2 + 3);
  sh.lineTo(4, L / 2 - 7); sh.quadraticCurveTo(3.4, L / 2 - 1, 0, L / 2 + 1.5); sh.quadraticCurveTo(-3.4, L / 2 - 1, -4, L / 2 - 7); sh.closePath();
  // gövde katmanları: altı lacivert, ortası beyaz, üstte kırmızı şerit (her biri ayrı kalıp → renk şeritleri düz)
  const layer = (y0, h, col, grow = 1) => {
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    k.add(g, col, 0, y0, 0, 0, 0, 0, grow, 1, 1 + (grow - 1) * 0.3);
  };
  layer(0, 0.95, 0x1b2738);
  layer(0.95, DECK - 0.95, 0xf3efe6);
  layer(2.05, 0.22, 0xc8352e, 1.012);
  // pencere bandı
  k.add(new THREE.BoxGeometry(8.04, 0.5, L - 16), 0x2b4560, 0, 1.5, 1.5);
  for (let z = -L / 2 + 9; z < L / 2 - 8; z += 1.6) for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.02, 0.5, 0.16), 0xf3efe6, s * 4.03, 1.5, z);
  // güverte, korkuluk
  k.add(new THREE.BoxGeometry(7.6, 0.06, L - 7), 0xa8774a, 0, DECK + 0.02, 0.8);
  for (let z = -L / 2 + 5; z < L / 2 - 5; z += 1.2) k.add(new THREE.BoxGeometry(7.65, 0.04, 0.06), 0x94673e, 0, DECK + 0.055, z);
  for (const s of [-1, 1]) {
    k.add(new THREE.BoxGeometry(0.07, 0.07, L - 9), 0xf3efe6, s * 3.85, DECK + 0.75, 1.2);
    for (let z = -L / 2 + 5; z < L / 2 - 4; z += 2.2) k.add(new THREE.BoxGeometry(0.05, 0.75, 0.05), 0xf3efe6, s * 3.85, DECK + 0.38, z);
    for (const z of [-L / 4, L / 4]) k.add(new THREE.TorusGeometry(0.34, 0.1, 5, 10), (f) => (f % 6 < 3 ? 0xf07b22 : 0xffffff), s * 4.08, 1.35, z, 0, Math.PI / 2);
  }
  // kaptan köşkü
  const bz = -L / 2 + 6;
  k.add(new THREE.BoxGeometry(3.8, 1.5, 3.2), 0xf3efe6, 0, DECK + 0.75, bz);
  k.add(new THREE.BoxGeometry(3.84, 0.5, 3.24), 0x2b4560, 0, DECK + 1.05, bz);
  k.add(new THREE.BoxGeometry(4.2, 0.12, 3.6), 0xc8352e, 0, DECK + 1.56, bz);
  const geo = k.build();
  ferryCache.set(L, geo);
  return geo;
}
export function chimneyGeo() {
  return new Kit()
    .add(new THREE.CylinderGeometry(0.85, 1, 4.6, 14), 0xf3efe6, 0, 2.3, 0)
    .add(new THREE.CylinderGeometry(0.87, 0.9, 0.5, 14), 0xc8352e, 0, 3.4, 0)
    .add(new THREE.CylinderGeometry(0.88, 0.88, 0.8, 14), 0x16171c, 0, 4.25, 0)
    .add(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 14), 0x050507, 0, 4.66, 0)
    .build();
}
export const CHIMNEY = chimneyGeo();
export const MAST = new Kit().add(new THREE.CylinderGeometry(0.1, 0.14, 6.8, 6), 0xf3efe6, 0, 3.4, 0).add(new THREE.SphereGeometry(0.16, 6, 4), 0xffd34d, 0, 6.85, 0).build();
const flagTex = canvasTex(96, 64, (g, w, h) => {
  g.fillStyle = '#e30a17'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(36, 32, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e30a17'; g.beginPath(); g.arc(40, 32, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.save(); g.translate(58, 32); g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 3.4 : 8, a = i * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.fill(); g.restore();
});
export const flagMat = new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide });
export const FLAG = new THREE.PlaneGeometry(1.5, 1, 6, 1);

// ---------------- uçurtma ----------------
const KITE_COLS = [[0xe5484d, 0xffd166], [0x2bb3a3, 0xfff4e2], [0x7d5ba6, 0xffb057], [0x3a6ea5, 0xff7b6b]];
const kiteCache = [];
const KITE_BOW = new THREE.PlaneGeometry(0.34, 0.16);
const KITE_LINE = new THREE.CylinderGeometry(0.015, 0.015, 7, 3);
const kiteLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
function kiteAssets(ci) {
  if (kiteCache[ci]) return kiteCache[ci];
  const [a, b] = KITE_COLS[ci];
  const k = new Kit();
  const half = (sign, col) => {
    const s = new THREE.Shape(); s.moveTo(0, 1.05); s.lineTo(sign * 0.75, 0.2); s.lineTo(0, -1.2); s.closePath();
    k.add(new THREE.ShapeGeometry(s), col);
  };
  half(1, a); half(-1, b);
  k.add(new THREE.BoxGeometry(0.05, 2.25, 0.05), 0x5a3b26, 0, -0.07, 0.02);
  k.add(new THREE.BoxGeometry(1.5, 0.05, 0.05), 0x5a3b26, 0, 0.2, 0.02);
  return (kiteCache[ci] = {
    geo: k.build(),
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.7 }),
    bows: [a, b].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })),
  });
}
export function makeKite() {
  const A = kiteAssets((Math.random() * KITE_COLS.length) | 0);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(A.geo, A.mat));
  // kuyruk fiyonkları
  const tail = [];
  for (let i = 0; i < 5; i++) {
    const bow = new THREE.Mesh(KITE_BOW, A.bows[i % 2 ? 0 : 1]);
    bow.position.set(0, -1.4 - i * 0.42, 0); g.add(bow); tail.push(bow);
  }
  // ip: aşağıya, denize
  const line = new THREE.Mesh(KITE_LINE, kiteLineMat);
  line.position.set(0, -4.2, 1.4); line.rotation.x = 0.35; g.add(line);
  g.userData.tail = tail;
  return g;
}

// ---------------- şamandıra ----------------
export const BUOY = new Kit()
  .add(new THREE.CylinderGeometry(0.5, 0.65, 1.1, 8), (f, y) => (y > 0.1 ? 0xf3efe6 : 0xe2463b), 0, 0.2, 0)
  .add(new THREE.ConeGeometry(0.3, 0.6, 8), 0xe2463b, 0, 1.05, 0)
  .add(new THREE.SphereGeometry(0.14, 6, 4), 0xffe07a, 0, 1.45, 0)
  .build();

// ---------------- viraj tabelası: şamandıranın üstünde kırmızı-beyaz ok levhası ----------------
const CHEV_POST = new Kit()
  .add(new THREE.CylinderGeometry(0.55, 0.7, 1, 8), (f, y) => (y > 0.1 ? 0xf3efe6 : 0xe2463b), 0, 0.2, 0)
  .add(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), 0xf3efe6, 0, 1.6, 0)
  .build();
const CHEV_BOARD = new THREE.PlaneGeometry(2.2, 1.3);
const chevMat = new THREE.MeshBasicMaterial({
  side: THREE.DoubleSide,
  map: canvasTex(128, 76, (g) => {
    g.fillStyle = '#e2463b'; g.fillRect(0, 0, 128, 76);
    g.fillStyle = '#fff4e2';
    for (const x of [14, 60]) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 24, 8); g.lineTo(x + 50, 38); g.lineTo(x + 24, 68); g.lineTo(x, 68); g.lineTo(x + 26, 38); g.closePath(); g.fill(); }
  }),
});
// dir: virajın yönü (+1 sağ); ok o yönü gösterir
export function makeChevron(dir) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(CHEV_POST, vcMat));
  const b = new THREE.Mesh(CHEV_BOARD, chevMat); b.position.y = 3.2; b.scale.x = dir; g.add(b);
  return g;
}

// ---------------- güçlendirmeler ----------------
export const POWER = {
  magnet: { name: 'Mıknatıs', color: '#e5484d', dur: 8 },
  shield: { name: 'Kalkan', color: '#3aa7ff', dur: 12 },
  double: { name: '2x Puan', color: '#ffc23a', dur: 9 },
};
// HUD ve 3D baloncuk aynı ikonları kullanır
export const ICON_SVG = {
  magnet: '<svg viewBox="0 0 24 24"><path d="M6 3h4v8a2 2 0 0 0 4 0V3h4v8a6 6 0 0 1-12 0z" fill="currentColor"/><path d="M6 3h4v3H6zM14 3h4v3h-4z" fill="#fff"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="currentColor"/><path d="M12 5.2l5 1.9V11c0 3.4-2.1 6.5-5 7.8z" fill="#fff" opacity=".45"/></svg>',
  double: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><text x="12" y="16.2" text-anchor="middle" font-size="11" font-weight="900" font-family="Arial,sans-serif" fill="#5a3500">2x</text></svg>',
};
function iconTexture(kind) {
  const tex = canvasTex(128, 128, () => {});
  const img = new Image();
  img.onload = () => {
    const g = tex.image.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.drawImage(img, 14, 14, 100, 100);
    tex.needsUpdate = true;
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICON_SVG[kind].replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" style="color:${POWER[kind].color}" `).replaceAll('currentColor', POWER[kind].color));
  return tex;
}
const iconMats = {}, bubbleMats = {};
export function makePowerUp(kind) {
  const g = new THREE.Group();
  const col = new THREE.Color(POWER[kind].color);
  bubbleMats[kind] ||= new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, transparent: true, opacity: 0.32, roughness: 0.15, metalness: 0.1, flatShading: true, depthWrite: false });
  const bubble = new THREE.Mesh(GEO.bubble, bubbleMats[kind]);
  g.add(bubble);
  iconMats[kind] ||= new THREE.SpriteMaterial({ map: iconTexture(kind), depthWrite: false });
  const icon = new THREE.Sprite(iconMats[kind]); icon.scale.setScalar(1.15); g.add(icon);
  return g;
}
// martının etrafındaki kalkan küresi
export function makeShieldOrb() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 2), new THREE.MeshBasicMaterial({ color: 0x6cc4ff, transparent: true, opacity: 0.22, depthWrite: false, wireframe: false }));
  const w = new THREE.Mesh(new THREE.IcosahedronGeometry(1.72, 1), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  m.add(w);
  return m;
}

// ---------------- kostümler ----------------
// Simit cüzdanıyla alınır; yalnızca oyuncunun martısına takılır. Her biri tek Kit geometrisi,
// bir kez üretilir ve görünürlüğü açılıp kapanır (giyip çıkarınca yeni tampon açılmaz).
export const COSTUMES = [
  { id: 'fes', name: 'Fes', slot: 'head', price: 60 },
  { id: 'glasses', name: 'Güneş gözlüğü', slot: 'eyes', price: 120 },
  { id: 'scarf', name: 'Atkı', slot: 'neck', price: 200 },
  { id: 'captain', name: 'Kaptan şapkası', slot: 'head', price: 350 },
  { id: 'crown', name: 'Altın taç', slot: 'head', price: 900 },
  { id: 'mustache', name: 'Bıyık', slot: 'face', price: 90 },
  { id: 'pink', name: 'Pembe tüy', slot: 'body', price: 250 },
  { id: 'night', name: 'Gece martısı', slot: 'body', price: 450 },
  { id: 'golden', name: 'Altın martı', slot: 'body', price: 1500 },
  { id: 'beanie', name: 'Bere', slot: 'head', price: 150 },
  { id: 'tray', name: 'Simitçi tablası', slot: 'head', price: 700 },
  { id: 'hearts', name: 'Kalpli gözlük', slot: 'eyes', price: 220 },
  { id: 'bowtie', name: 'Papyon', slot: 'neck', price: 160 },
  { id: 'nazar', name: 'Nazar boncuğu', slot: 'neck', price: 400 },
  { id: 'mint', name: 'Nane martı', slot: 'body', price: 380 },
  { id: 'sunset', name: 'Gün batımı', slot: 'body', price: 650 },
  { id: 'ice', name: 'Buz martısı', slot: 'body', price: 900 },
];
// kalp: gözlük camı ve simge için (x-y düzleminde, ortası 0)
function heartGeo(r) {
  const s = new THREE.Shape();
  s.moveTo(0, -r); s.bezierCurveTo(r * 0.2, -r * 0.6, r * 1.1, -r * 0.2, r * 1.0, r * 0.35);
  s.bezierCurveTo(r * 0.9, r * 0.95, r * 0.2, r * 0.95, 0, r * 0.45);
  s.bezierCurveTo(-r * 0.2, r * 0.95, -r * 0.9, r * 0.95, -r * 1.0, r * 0.35);
  s.bezierCurveTo(-r * 1.1, -r * 0.2, -r * 0.2, -r * 0.6, 0, -r);
  return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false, curveSegments: 6 });
}
// baş merkezi (0, 0.2, −0.72), yarıçap 0.3; gaga −z yönünde
function costumeGeo(id) {
  const k = new Kit();
  if (id === 'fes') {
    k.add(new THREE.CylinderGeometry(0.15, 0.2, 0.27, 12), (f, y) => (y > 0.69 ? 0x9e1b24 : 0xc62a33), 0, 0.57, -0.74, -0.18);
    k.add(new THREE.BoxGeometry(0.025, 0.025, 0.2), 0x1a1a1a, 0, 0.7, -0.62, -0.5);
    k.add(new THREE.ConeGeometry(0.05, 0.16, 6), 0x1a1a1a, 0, 0.6, -0.53);
  } else if (id === 'captain') {
    k.add(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 14), 0x1b2738, 0, 0.5, -0.72);
    k.add(new THREE.CylinderGeometry(0.27, 0.24, 0.13, 14), 0xf6f4ee, 0, 0.59, -0.72);
    k.add(new THREE.CylinderGeometry(0.32, 0.29, 0.06, 14), 0xffffff, 0, 0.67, -0.73, -0.08);
    k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12, 1, false, Math.PI * 0.5, Math.PI), 0x111111, 0, 0.48, -0.86, 0.3);
    k.add(new THREE.OctahedronGeometry(0.055), 0xffc23a, 0, 0.6, -0.98, 0, 0, 0, 1, 1, 0.5);
  } else if (id === 'crown') {
    k.add(new THREE.CylinderGeometry(0.22, 0.21, 0.12, 12), 0xf2b22c, 0, 0.53, -0.72);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.add(new THREE.ConeGeometry(0.06, 0.16, 5), 0xffcb45, Math.sin(a) * 0.18, 0.66, -0.72 + Math.cos(a) * 0.18);
      k.add(new THREE.SphereGeometry(0.03, 5, 4), 0xfff2b0, Math.sin(a) * 0.18, 0.75, -0.72 + Math.cos(a) * 0.18);
    }
    k.add(new THREE.OctahedronGeometry(0.05), 0xe5484d, 0, 0.53, -0.94);
    for (const s of [-1, 1]) k.add(new THREE.OctahedronGeometry(0.04), 0x3aa7ff, s * 0.21, 0.53, -0.72);
  } else if (id === 'glasses') {
    // camlar gözlerin (±0.19, 0.28, −0.86) önünde, yüzün yanlarına yaslı; köprü gaganın üstünden geçer
    for (const s of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.2, 0.14, 0.035), 0x14161c, s * 0.2, 0.29, -0.93, 0, s * 0.75);
      k.add(new THREE.BoxGeometry(0.025, 0.025, 0.28), 0x14161c, s * 0.29, 0.31, -0.74);
    }
    k.add(new THREE.BoxGeometry(0.16, 0.03, 0.03), 0x14161c, 0, 0.33, -1.0);
  } else if (id === 'mustache') { // gaganın üstünde, iki yana kıvrık pala bıyık
    for (const s of [-1, 1]) {
      k.add(new THREE.CapsuleGeometry(0.05, 0.2, 3, 6), 0x2a1a12, s * 0.13, 0.19, -1.0, 0, 0, -s * 1.3);
      k.add(new THREE.SphereGeometry(0.055, 6, 4), 0x2a1a12, s * 0.26, 0.26, -0.97);
    }
  } else if (id === 'beanie') { // örgü bere: çizgili kubbe, beyaz ponpon
    k.add(new THREE.SphereGeometry(0.3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), (f, y) => ((y * 30) % 2 < 1 ? 0x2f7fd0 : 0x3a93e8), 0, 0.3, -0.72, -0.12, 0, 0, 1.04, 1.05, 1.04);
    k.add(new THREE.TorusGeometry(0.29, 0.05, 6, 16), 0xf6f0e4, 0, 0.32, -0.72, Math.PI / 2 - 0.12);
    k.add(new THREE.SphereGeometry(0.085, 8, 6), 0xffffff, 0, 0.64, -0.68);
  } else if (id === 'tray') { // simitçi tablası: başta tahta tepsi, üstünde simitler
    k.add(new THREE.TorusGeometry(0.16, 0.045, 6, 12), 0xf6f0e4, 0, 0.5, -0.72, Math.PI / 2); // altındaki bez simit (yastık)
    k.add(new THREE.CylinderGeometry(0.46, 0.44, 0.05, 18), 0xb57a3c, 0, 0.57, -0.72);
    k.add(new THREE.TorusGeometry(0.45, 0.025, 4, 22), 0x8a5626, 0, 0.6, -0.72, Math.PI / 2);
    const tor = new THREE.TorusGeometry(0.1, 0.04, 6, 12);
    for (const [x, z, ry] of [[0, 0, 0], [0.24, 0.1, 0.6], [-0.22, 0.14, 1.2], [0.1, -0.24, 2], [-0.16, -0.2, 2.6], [0.26, -0.14, 0.3]])
      k.add(tor, () => (Math.random() < 0.25 ? 0xf6e2b3 : 0xb8642a), x, 0.63, -0.72 + z, Math.PI / 2, ry);
  } else if (id === 'hearts') { // kalpli gözlük: pembe camlar gözlerin önünde
    for (const s of [-1, 1]) {
      k.add(heartGeo(0.1), 0xff4f8b, s * 0.2, 0.29, -0.95, 0, Math.PI + s * 0.75);
      k.add(new THREE.BoxGeometry(0.025, 0.025, 0.28), 0xd12f6a, s * 0.29, 0.31, -0.74);
    }
    k.add(new THREE.BoxGeometry(0.16, 0.03, 0.03), 0xd12f6a, 0, 0.33, -1.0);
  } else if (id === 'bowtie') { // papyon: gerdanın önünde iki kanat ve düğüm
    for (const s of [-1, 1]) k.add(new THREE.ConeGeometry(0.1, 0.2, 4), 0xd62f3a, s * 0.1, -0.08, -0.84, 0, 0, s * Math.PI / 2, 1, 1, 0.5);
    k.add(new THREE.SphereGeometry(0.045, 6, 4), 0x9e1b24, 0, -0.08, -0.87);
  } else if (id === 'nazar') { // ince kolye, ucunda mavi nazar boncuğu
    k.add(new THREE.TorusGeometry(0.3, 0.014, 4, 20), 0xffc23a, 0, 0.07, -0.5, 0, 0, 0, 1, 0.9, 1);
    const disc = (r, c, dz) => k.add(new THREE.CylinderGeometry(r, r, 0.03, 14), c, 0, -0.24, -0.56 - dz, Math.PI / 2);
    disc(0.1, 0x1f4fbf, 0); disc(0.068, 0xffffff, 0.012); disc(0.045, 0x5fb4ff, 0.024); disc(0.022, 0x111111, 0.036);
  } else if (id === 'scarf') {
    const ring = new THREE.TorusGeometry(0.3, 0.075, 6, 16);
    k.add(ring, (f) => (f % 8 < 4 ? 0xd23a33 : 0xf6f0e4), 0, 0.07, -0.5, 0, 0, 0, 1, 0.9, 1);
    const tail = (x, z, ry) => k.add(new THREE.BoxGeometry(0.13, 0.035, 0.42, 1, 1, 4), (f, y) => (f % 8 < 4 ? 0xd23a33 : 0xf6f0e4), x, 0.12, z, -0.25, ry);
    tail(0.2, -0.22, 0.25); tail(0.28, -0.2, 0.5);
  }
  return k.build();
}
// martıya bütün kostümleri gizli olarak takar; { id: mesh } döner
export function dressGull(gull) {
  const out = {};
  for (const c of COSTUMES) {
    if (c.slot === 'body') continue; // tüy rengi ayrı (paintGull)
    const m = new THREE.Mesh(costumeGeo(c.id), vcMat);
    m.castShadow = true; m.visible = false;
    gull.add(m); out[c.id] = m;
  }
  return out;
}
export const COSTUME_SVG = {
  beanie: '<svg viewBox="0 0 48 48"><path d="M8 32a16 16 0 0 1 32 0z" fill="#2f7fd0"/><path d="M12 22h24M9.5 27h29" stroke="#3a93e8" stroke-width="3"/><rect x="6" y="30" width="36" height="8" rx="4" fill="#f6f0e4"/><circle cx="24" cy="12" r="5" fill="#fff"/></svg>',
  tray: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="30" rx="21" ry="7" fill="#8a5626"/><ellipse cx="24" cy="28" rx="20" ry="6" fill="#b57a3c"/><g fill="none" stroke="#b8642a" stroke-width="3.4"><ellipse cx="15" cy="24" rx="5" ry="3"/><ellipse cx="25" cy="22" rx="5" ry="3"/><ellipse cx="34" cy="25" rx="5" ry="3"/><ellipse cx="22" cy="28" rx="5" ry="3"/></g><path d="M18 36h12l-2 6h-8z" fill="#f6f0e4"/></svg>',
  hearts: '<svg viewBox="0 0 48 48"><path d="M4 19h40" stroke="#d12f6a" stroke-width="3"/><path d="M13 33l-8-8a4.6 4.6 0 0 1 8-5 4.6 4.6 0 0 1 8 5z" fill="#ff4f8b"/><path d="M35 33l-8-8a4.6 4.6 0 0 1 8-5 4.6 4.6 0 0 1 8 5z" fill="#ff4f8b"/></svg>',
  bowtie: '<svg viewBox="0 0 48 48"><path d="M24 24L6 13v22zM24 24l18-11v22z" fill="#d62f3a"/><rect x="19" y="19" width="10" height="10" rx="3" fill="#9e1b24"/></svg>',
  nazar: '<svg viewBox="0 0 48 48"><path d="M8 6q16 22 32 0" fill="none" stroke="#ffc23a" stroke-width="2"/><circle cx="24" cy="29" r="13" fill="#1f4fbf"/><circle cx="24" cy="29" r="9" fill="#fff"/><circle cx="24" cy="29" r="6" fill="#5fb4ff"/><circle cx="24" cy="29" r="3" fill="#111"/></svg>',
  mint: '<svg viewBox="0 0 48 48"><path d="M4 22q10-8 20 2 10-10 20-2-9 0-14 6l-6 4-6-4q-5-6-14-6z" fill="#5cc9a7"/><ellipse cx="24" cy="29" rx="7" ry="9" fill="#dcfff2"/><circle cx="24" cy="21" r="5" fill="#dcfff2"/><path d="M24 23l3 4h-6z" fill="#f4b52a"/></svg>',
  sunset: '<svg viewBox="0 0 48 48"><path d="M4 22q10-8 20 2 10-10 20-2-9 0-14 6l-6 4-6-4q-5-6-14-6z" fill="#9b5fc0"/><ellipse cx="24" cy="29" rx="7" ry="9" fill="#ffbb85"/><circle cx="24" cy="21" r="5" fill="#ffcf9e"/><path d="M24 23l3 4h-6z" fill="#ffd34d"/></svg>',
  ice: '<svg viewBox="0 0 48 48"><path d="M4 22q10-8 20 2 10-10 20-2-9 0-14 6l-6 4-6-4q-5-6-14-6z" fill="#8fc9ef"/><ellipse cx="24" cy="29" rx="7" ry="9" fill="#eaf6ff"/><circle cx="24" cy="21" r="5" fill="#f6fbff"/><path d="M24 23l3 4h-6z" fill="#bfe6ff"/><path d="M38 34v8M34 38h8M35.2 35.2l5.6 5.6M40.8 35.2l-5.6 5.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  mustache: '<svg viewBox="0 0 48 48"><path d="M24 22q-6-4-12 0-5 4-9 1 2 8 10 7 7-1 11-6 4 5 11 6 8 1 10-7-4 3-9-1-6-4-12 0z" fill="#2a1a12"/></svg>',
  pink: '<svg viewBox="0 0 48 48"><path d="M4 22q10-8 20 2 10-10 20-2-9 0-14 6l-6 4-6-4q-5-6-14-6z" fill="#f08fb0"/><ellipse cx="24" cy="29" rx="7" ry="9" fill="#ffd6e2"/><circle cx="24" cy="21" r="5" fill="#ffd6e2"/><path d="M24 23l3 4h-6z" fill="#f4b52a"/></svg>',
  night: '<svg viewBox="0 0 48 48"><path d="M4 22q10-8 20 2 10-10 20-2-9 0-14 6l-6 4-6-4q-5-6-14-6z" fill="#1e2129"/><ellipse cx="24" cy="29" rx="7" ry="9" fill="#3a3f4c"/><circle cx="24" cy="21" r="5" fill="#3a3f4c"/><path d="M24 23l3 4h-6z" fill="#f4b52a"/></svg>',
  golden: '<svg viewBox="0 0 48 48"><path d="M4 22q10-8 20 2 10-10 20-2-9 0-14 6l-6 4-6-4q-5-6-14-6z" fill="#e0a53a"/><ellipse cx="24" cy="29" rx="7" ry="9" fill="#ffd77a"/><circle cx="24" cy="21" r="5" fill="#ffd77a"/><path d="M24 23l3 4h-6z" fill="#f4b52a"/></svg>',
  fes: '<svg viewBox="0 0 48 48"><path d="M14 40l4-26h12l4 26z" fill="#c62a33"/><path d="M18 14h12l.6 4H17.4z" fill="#9e1b24"/><path d="M24 14q8-2 9 10" stroke="#1a1a1a" stroke-width="2" fill="none"/><path d="M31 23l4 9h-6z" fill="#1a1a1a"/><rect x="11" y="38" width="26" height="4" rx="2" fill="#7a141b"/></svg>',
  glasses: '<svg viewBox="0 0 48 48"><path d="M4 18h40" stroke="#14161c" stroke-width="3"/><rect x="5" y="17" width="16" height="13" rx="5" fill="#14161c"/><rect x="27" y="17" width="16" height="13" rx="5" fill="#14161c"/><path d="M8 20l5 0M30 20l5 0" stroke="#5d6b86" stroke-width="2" stroke-linecap="round"/></svg>',
  scarf: '<svg viewBox="0 0 48 48"><path d="M8 14q16 8 32 0v8q-16 8-32 0z" fill="#d23a33"/><path d="M15 18.5v8M24 20v8M33 18.5v8" stroke="#f6f0e4" stroke-width="3"/><path d="M28 24l6 18h-8l-3-16z" fill="#d23a33"/><path d="M26.6 31h6.4M27.8 36h6.6" stroke="#f6f0e4" stroke-width="3"/></svg>',
  captain: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="17" rx="19" ry="7" fill="#fff"/><path d="M9 18h30v9H9z" fill="#f6f4ee"/><rect x="9" y="25" width="30" height="6" fill="#1b2738"/><path d="M10 31q14 9 28 0z" fill="#111"/><path d="M24 19l3 3-3 3-3-3z" fill="#ffc23a"/></svg>',
  crown: '<svg viewBox="0 0 48 48"><path d="M8 36l-2-22 10 9 8-14 8 14 10-9-2 22z" fill="#f2b22c"/><rect x="8" y="34" width="32" height="6" rx="2" fill="#d99a1c"/><circle cx="24" cy="29" r="3.2" fill="#e5484d"/><circle cx="14" cy="30" r="2.2" fill="#3aa7ff"/><circle cx="34" cy="30" r="2.2" fill="#3aa7ff"/></svg>',
};
