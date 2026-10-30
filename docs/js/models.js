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
// yemin boyası: [halka yarıçapı, kalınlık, yüz rengi]. Dekor simitler de aynı boyayla kendi kalıplarına gömülür
const PAINT = {
  simit: [0.32, 0.13, () => { const r = Math.random(); return r < 0.2 ? 0xf6e2b3 : r < 0.55 ? 0xb8642a : r < 0.8 ? 0xc97835 : 0x9c4f1f; }], // susam, kızarmış, koyu
  gevrek: [0.34, 0.1, () => { const r = Math.random(); return r < 0.34 ? 0xf3dcaa : r < 0.6 ? 0x9a4a1c : r < 0.85 ? 0xb05a26 : 0x7c3814; }],
};
let baitKind = 'simit';
// Tek geometri: üst yüzler kızarmış, alt yüzler koyu, rastgele yüzler susam
function simitGeo() {
  const [r, t, col] = PAINT.simit;
  return new Kit().add(new THREE.TorusGeometry(r, t, 9, 22), col).build();
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
// İzmir gevreği: daha ince, daha koyu, susamı bol
function gevrekGeo() {
  const [r, t, col] = PAINT.gevrek;
  return new Kit().add(new THREE.TorusGeometry(r, t, 9, 22), col).build();
}
function gevrekPieceGeo() {
  const arc = new THREE.TorusGeometry(0.34, 0.1, 8, 8, Math.PI * 0.7);
  const k = new Kit().add(arc, () => { const r = Math.random(); return r < 0.34 ? 0xf3dcaa : r < 0.65 ? 0x9a4a1c : 0xb05a26; });
  for (const a of [0, Math.PI * 0.7]) k.add(new THREE.CircleGeometry(0.1, 8).rotateX(a ? -Math.PI / 2 : Math.PI / 2).rotateZ(a), 0xf3dcae, Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0);
  return k.build();
}
const BAIT = { simit: [simitGeo(), pieceGeo()], gevrek: [gevrekGeo(), gevrekPieceGeo()] };
// şehrin yemi: bundan sonra yaratılan simitler bu geometriyi alır (dünya her uçuşta baştan kurulur)
export function setBait(kind) { baitKind = BAIT[kind] ? kind : 'simit'; [GEO.simit, GEO.piece] = BAIT[baitKind]; }
// ---------------- dekor simitleri (yenmez) ----------------
// Kalıba gömülü, hareketsiz simitler: simit arabasının camlı kasasında, simitçi tablasında, sırıkta.
// simits[]'e hiç girmezler; şeride düşenler uçuş yüksekliğinin altında kalır. Kalıplar şehrin yemine göre bir kez üretilir.
const decorCache = new Map();
const decorGeo = (name, build) => { const key = name + '|' + baitKind; if (!decorCache.has(key)) decorCache.set(key, build()); return decorCache.get(key); };
const decorSimit = (k, x, y, z, rx = 0, ry = 0, rz = 0, s = 0.72) => { const [r, t, col] = PAINT[baitKind]; k.add(new THREE.TorusGeometry(r, t, 6, 14), col, x, y, z, rx, ry, rz, s); };
// simit arabası: kırmızı kasa, iki teker, itme kolu, tepesinde camlı vitrin (içinde dizili simitler), çizgili tente. Boy 1.9: vapur güvertesinde uçuş yüksekliğinin altında
function simitCartGeo() {
  const k = new Kit(), gk = new Kit(), red = 0xc8352e, wood = 0x8a6242;
  k.add(new THREE.BoxGeometry(1.0, 0.62, 1.6), red, 0, 0.66, 0);
  k.add(new THREE.BoxGeometry(1.06, 0.08, 1.66), 0xf3efe6, 0, 0.99, 0); // tezgâh kenarı
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.33, 0.33, 0.08, 12), 0x2a2a30, s * 0.55, 0.33, 0.3, 0, 0, Math.PI / 2);
  k.add(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), 0x3a3a40, 0, 0.18, -0.6); // ön ayak
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 5), wood, s * 0.35, 1.0, 1.05, -0.9); // itme kolu
  k.add(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5), wood, 0, 1.33, 1.38, 0, 0, Math.PI / 2);
  // vitrin çerçevesi + cam
  for (const x of [-0.46, 0.46]) for (const z of [-0.74, 0.74]) k.add(new THREE.BoxGeometry(0.05, 0.62, 0.05), 0xf3efe6, x, 1.34, z);
  k.add(new THREE.BoxGeometry(0.98, 0.05, 1.54), 0xf3efe6, 0, 1.66, 0);
  gk.add(new THREE.BoxGeometry(0.92, 0.6, 1.48), 0xffffff, 0, 1.34, 0);
  // içerde: üç sütun halinde üst üste simit
  for (const z of [-0.45, 0, 0.45]) for (let i = 0; i < 4; i++) decorSimit(k, rand(-0.04, 0.04), 1.08 + i * 0.12, z + rand(-0.04, 0.04), -Math.PI / 2, 0, 0, 0.62);
  // çizgili tente
  for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(1.2, 0.05, 0.3), i % 2 ? 0xf3efe6 : red, 0, 1.86 - Math.abs(i - 2.5) * 0.03, -0.75 + i * 0.3);
  for (const x of [-0.5, 0.5]) k.add(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 4), 0xf3efe6, x, 1.76, 0);
  return { solid: k.build(), glass: gk.build() };
}
export function makeSimitCart() {
  const geo = decorGeo('cart', simitCartGeo), g = new THREE.Group();
  const s = new THREE.Mesh(geo.solid, vcMat); s.castShadow = true; g.add(s);
  const gl = new THREE.Mesh(geo.glass, glassMat); gl.renderOrder = 3; g.add(gl);
  return g;
}
// simitçi tablası: X ayaklı sehpa, yuvarlak tepsi, tepsinin ortasında simit dizili sırık
function simitStandGeo() {
  const k = new Kit(), wood = 0x8a6242;
  for (const ry of [Math.PI / 4, -Math.PI / 4]) for (const rz of [0.42, -0.42]) k.add(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 5), wood, 0, 0.45, 0, 0, ry, rz);
  k.add(new THREE.CylinderGeometry(0.62, 0.58, 0.07, 14), 0xc9a26a, 0, 0.92, 0);
  k.add(new THREE.TorusGeometry(0.6, 0.03, 4, 16), 0xa8743e, 0, 0.96, 0, Math.PI / 2);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; decorSimit(k, Math.sin(a) * 0.36, 1.0, Math.cos(a) * 0.36, -Math.PI / 2 + rand(-0.15, 0.15), 0, 0, 0.6); }
  k.add(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), wood, 0, 1.7, 0); // sırık
  for (let i = 0; i < 8; i++) decorSimit(k, 0, 1.08 + i * 0.13, 0, -Math.PI / 2 + rand(-0.12, 0.12), 0, rand(-0.12, 0.12), 0.56);
  return k.build();
}
export function makeSimitStand() { const m = new THREE.Mesh(decorGeo('stand', simitStandGeo), vcMat); m.castShadow = true; return m; }
export const GEO = {
  simit: BAIT.simit[0],
  piece: BAIT.simit[1],
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
export const SIMITCI_LOOK = { id: 'simitci', shirt: 0xf2efe6, pants: 0x262c3a, skin: 0xd49b74, hair: 1, hat: 'kasket', hatCol: 0x3b3b3b, scarf: true, scarfCol: 0xc8352e, pose: 'down' };
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
  for (const [h, a] of [[true, false], [false, false], [false, true]]) jobs.push(() => personGeo(SIMITCI_LOOK, h, a, ''));
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
// Kayalık adacık, korkuluklu teras (koridora bakan -x yakası), şemsiyeli masalar, küçük fener, sandallı ahşap iskele.
// Terastakiler yolcu gemisindeki gibi el sallayıp zıplar; köşede simit arabası ve simitçi (dekor, yenmez).
const MAIDEN_TOP = 1.45;
const MAIDEN = (() => {
  const k = new Kit(), rock = (f, y) => (y > 0.2 ? 0xb7a58f : 0x8d7f70), stone = 0xd8cdb8, rail = 0xf3efe6;
  k.add(new THREE.DodecahedronGeometry(9, 0), rock, -1, -3.5, 0, 0, 0, 0, 1.5, 0.5, 1.25);
  for (const [x, z, r, sy] of [[-13, -8, 2.6, 0.5], [-14, 7.5, 2, 0.45], [9, 9, 2.8, 0.55], [12, -2, 2.2, 0.5], [-4, 11, 2.4, 0.4], [3, -11, 2.2, 0.45], [10, -8, 3, 0.6]])
    k.add(new THREE.DodecahedronGeometry(r, 0), rock, x, -0.2, z, rand(0, 3), rand(0, 3), 0, 1.2, sy, 1);
  k.add(new THREE.BoxGeometry(20, 0.5, 13), stone, -2, 1.2, 0); // teras
  k.add(new THREE.BoxGeometry(20.3, 0.25, 13.3), 0xb9ad98, -2, 0.85, 0);
  // korkuluk: dikmeler ve iki kat lata
  const ex = [-11.85, 7.85], ez = 6.35;
  for (const x of ex) for (let z = -ez; z <= ez + 0.01; z += ez / 4.5) k.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), rail, x, MAIDEN_TOP + 0.45, z);
  for (const z of [-ez, ez]) for (let x = ex[0]; x <= ex[1] + 0.01; x += (ex[1] - ex[0]) / 13) k.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), rail, x, MAIDEN_TOP + 0.45, z);
  for (const y of [MAIDEN_TOP + 0.5, MAIDEN_TOP + 0.9]) {
    for (const x of ex) k.add(new THREE.BoxGeometry(0.08, 0.07, ez * 2), rail, x, y, 0);
    for (const z of [-ez, ez]) k.add(new THREE.BoxGeometry(ex[1] - ex[0], 0.07, 0.08), rail, (ex[0] + ex[1]) / 2, y, z);
  }
  // şemsiyeli masalar (kırmızı-beyaz dilimli)
  for (const z of [-4.6, -0.2, 4.4]) {
    const x = -9.6;
    k.add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5), 0xe8e2d6, x, MAIDEN_TOP + 1.25, z);
    k.add(new THREE.ConeGeometry(1.45, 0.65, 8), (f) => (f % 2 ? 0xf3efe6 : 0xc8352e), x, MAIDEN_TOP + 2.55, z);
    k.add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), 0xf3efe6, x, MAIDEN_TOP + 0.75, z);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.4, 0.45, 0.4), 0x8a6242, x + s * 0.85, MAIDEN_TOP + 0.22, z);
  }
  for (const z of [-ez + 0.35, ez - 0.35]) { // fener direkleri
    k.add(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), 0x2a2f38, -11.5, MAIDEN_TOP + 1.6, z);
    k.add(new THREE.SphereGeometry(0.28, 8, 6), 0xfff0b8, -11.5, MAIDEN_TOP + 3.3, z);
  }
  // küçük fener: kayalığın ucunda kırmızı bantlı beyaz kule
  k.add(new THREE.CylinderGeometry(1.1, 1.3, 1, 10), stone, 10, 1, -8);
  k.add(new THREE.CylinderGeometry(0.6, 0.78, 3.6, 10), (f, y) => (y > 3.6 && y < 4.3 ? 0xc8352e : 0xf6f3ea), 10, 3.3, -8);
  k.add(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 10), 0x2a2f38, 10, 5.15, -8);
  k.add(new THREE.CylinderGeometry(0.48, 0.48, 0.7, 8), 0xffe58a, 10, 5.55, -8);
  k.add(new THREE.ConeGeometry(0.62, 0.6, 8), 0xc8352e, 10, 6.2, -8);
  // ahşap iskele ve bağlı sandal
  k.add(new THREE.BoxGeometry(5.4, 0.22, 2), 0x8a6242, -14.6, 0.95, 4.4);
  for (const x of [-12.6, -14.6, -16.9]) for (const z of [3.5, 5.3]) k.add(new THREE.CylinderGeometry(0.16, 0.16, 2, 6), 0x5b4130, x, 0.1, z);
  k.add(new THREE.BoxGeometry(1.5, 0.55, 3.6), (f, y) => (y > 0.45 ? 0xf3efe6 : 0x3a7fc2), -15.2, 0.35, 7.1);
  k.add(new THREE.ConeGeometry(0.75, 1.2, 4), 0x3a7fc2, -15.2, 0.35, 5.0, -Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.55);
  k.add(new THREE.BoxGeometry(1.2, 0.08, 2.8), 0xa8774a, -15.2, 0.6, 7.2);
  // bina
  k.add(new THREE.BoxGeometry(10, 4.5, 7), 0xf6eee0, -1.5, 3.6, 0.5);
  k.add(new THREE.BoxGeometry(10.3, 0.4, 7.3), 0xcfa58c, -1.5, 5.95, 0.5);
  for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.9, 1.4, 0.1), 0x5f7fa8, -5 + i * 2.3, 3.8, 4.06);
  for (const z of [-1.8, 2.8]) k.add(new THREE.BoxGeometry(0.1, 1.4, 0.9), 0x5f7fa8, -6.55, 3.8, z);
  k.add(new THREE.BoxGeometry(0.1, 2.2, 1.3), 0x6b4a33, -6.55, MAIDEN_TOP + 1.1, 0.5); // teras kapısı
  k.add(new THREE.CylinderGeometry(2, 2.2, 12, 10), 0xf6eee0, 3.5, 7, -0.5);
  k.add(new THREE.CylinderGeometry(2.35, 2.35, 0.5, 10), 0xcfa58c, 3.5, 10.5, -0.5);
  k.add(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10), 0xf6eee0, 3.5, 12.9, -0.5);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.add(new THREE.BoxGeometry(0.5, 1, 0.1), 0x5f7fa8, 3.5 + Math.sin(a) * 1.62, 12.9, -0.5 + Math.cos(a) * 1.62, 0, a); }
  k.add(new THREE.ConeGeometry(2, 3.4, 10), 0x8fa9c4, 3.5, 15.8, -0.5);
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 4), 0xd9b24a, 3.5, 18.2, -0.5);
  k.add(new THREE.BoxGeometry(0.04, 0.6, 0.95), 0xe30a17, 3.5, 18.6, -0.02); // bayrak
  return k.build();
})();
const MAIDEN_SPOTS = (() => {
  const out = [];
  for (let n = 0; out.length < 13 && n < 200; n++) {
    const x = rand(-11.3, -7.1), z = rand(-5.9, 5.9);
    if ([-4.6, -0.2, 4.4].some(uz => Math.hypot(x + 9.6, z - uz) < 1.3) || (x > -9.3 && z < -4)) continue; // masalar, araba köşesi
    if (out.some(([ox, , oz]) => Math.hypot(ox - x, oz - z) < 1.1)) continue;
    out.push([x, MAIDEN_TOP + 0.15, z]);
  }
  out.push([-15.8, 1.2, 4.2], [-13.5, 1.2, 4.6]); // iskelede
  return out;
})();
export function makeMaiden() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(MAIDEN, vcMat); m.castShadow = true; g.add(m);
  const crowd = [];
  CROWD_GEOS.forEach((geo, c) => {
    const spots = MAIDEN_SPOTS.filter((_, i) => i % CROWD_GEOS.length === c);
    const im = new THREE.InstancedMesh(geo, vcMat, spots.length);
    im.frustumCulled = false;
    g.add(im);
    crowd.push({ im, spots: spots.map(([x, y, z]) => ({ x, y, z, ph: Math.random() * 6, ry: rand(-0.6, 0.6) })) });
  });
  g.userData.crowd = crowd;
  animCrowd(g, 0);
  const cart = makeSimitCart(); cart.position.set(-7.7, MAIDEN_TOP, -5.3); cart.rotation.y = Math.PI / 2; cart.scale.setScalar(1.4); g.add(cart);
  const v = makePerson(false, SIMITCI_LOOK); v.mesh.position.set(-6.3, MAIDEN_TOP, -5.3); v.mesh.rotation.y = -Math.PI / 2; v.mesh.scale.setScalar(1.4); g.add(v.mesh);
  return g;
}

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

// ---------------- şilep: uzaktan geçen konteyner gemisi (yalnız manzara) ----------------
// Pruva +z; köprüüstü kıçta. Üç renk çeşidi, her biri bir kez üretilir.
const CARGO_COLS = [0x7a2a26, 0x24425e, 0x2f5d3a];
const BOX_COLS = [0xc8352e, 0x2f6f9f, 0xe0a53a, 0x4f9d69, 0xd9d4c8, 0x7a4a8f, 0xe07a5f];
const cargoCache = [];
export function cargoGeo(ci) {
  if (cargoCache[ci]) return cargoCache[ci];
  const k = new Kit(), L = 46, W = 7.5;
  const sh = new THREE.Shape(); sh.moveTo(-W / 2, L / 2); sh.lineTo(-W / 2, -L / 2 + 7); sh.quadraticCurveTo(-W / 2, -L / 2, 0, -L / 2 - 2.5);
  sh.quadraticCurveTo(W / 2, -L / 2, W / 2, -L / 2 + 7); sh.lineTo(W / 2, L / 2); sh.closePath();
  const layer = (y0, h, col) => { const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 5 }); g.rotateX(-Math.PI / 2); k.add(g, col, 0, y0, 0); };
  layer(0, 1.6, 0x1b2738); layer(1.6, 2.4, CARGO_COLS[ci]);
  for (let z = -13; z < 20; z += 3.1) { // konteyner yığınları, düzensiz yükseklik
    const n = 1 + ((Math.random() * 3) | 0);
    for (let h = 0; h < n; h++) k.add(new THREE.BoxGeometry(6.6, 1.22, 2.9), BOX_COLS[(Math.random() * BOX_COLS.length) | 0], 0, 4.65 + h * 1.3, z);
  }
  k.add(new THREE.BoxGeometry(7, 6, 5), 0xf3efe6, 0, 7, -18);   // köprüüstü
  k.add(new THREE.BoxGeometry(7.1, 0.6, 5.1), 0x2b4560, 0, 9.2, -18);
  k.add(new THREE.BoxGeometry(8.6, 0.25, 2), 0xf3efe6, 0, 10, -16.6); // köprü kanatları
  k.add(new THREE.CylinderGeometry(0.9, 1.05, 3.2, 8), CARGO_COLS[ci], 0, 11.6, -20); // baca
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), 0xf3efe6, 0, 12, -16.5);       // anten direği
  return (cargoCache[ci] = k.build());
}
// tanker: alçak, uzun koyu gövde, güvertede boru hattı ve manifold, kıçta yüksek beyaz köprüüstü
const TANKER_COLS = [0x8a2f2a, 0x2a3f5a, 0x3d4a3a];
const tankerCache = [];
export function tankerGeo(ci) {
  if (tankerCache[ci]) return tankerCache[ci];
  const k = new Kit(), L = 58, W = 8.5;
  const sh = new THREE.Shape(); sh.moveTo(-W / 2, L / 2); sh.lineTo(-W / 2, -L / 2 + 8); sh.quadraticCurveTo(-W / 2, -L / 2, 0, -L / 2 - 3);
  sh.quadraticCurveTo(W / 2, -L / 2, W / 2, -L / 2 + 8); sh.lineTo(W / 2, L / 2); sh.closePath();
  const layer = (y0, h, col) => { const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 5 }); g.rotateX(-Math.PI / 2); k.add(g, col, 0, y0, 0); };
  layer(0, 1.4, 0x5a1f1c); layer(1.4, 2.2, TANKER_COLS[ci]); layer(3.6, 0.15, 0xf3efe6);
  k.add(new THREE.BoxGeometry(W - 0.4, 0.1, L - 4), 0x6f7a6a, 0, 3.7, 0); // güverte
  for (const x of [-1.2, 0, 1.2]) k.add(new THREE.CylinderGeometry(0.22, 0.22, L - 18, 6), 0xb9b2a4, x, 4.1, -2, Math.PI / 2); // boru hattı
  for (let z = -16; z < 16; z += 8) k.add(new THREE.BoxGeometry(5.5, 1.2, 0.8), 0xd9d4c8, 0, 4.3, z); // geçitler
  k.add(new THREE.BoxGeometry(5, 0.8, 1.4), 0xe0a53a, 0, 4.4, 0); // manifold vinci
  k.add(new THREE.CylinderGeometry(0.15, 0.15, 5, 5), 0xe0a53a, 1.8, 6.4, 0, 0, 0, 0.5);
  k.add(new THREE.BoxGeometry(W - 0.6, 7, 7), 0xf3efe6, 0, 7.3, L / 2 - 5); // köprüüstü (kıçta)
  for (const y of [5.6, 7.6, 9.6]) k.add(new THREE.BoxGeometry(W - 0.5, 0.5, 7.05), 0x2b4560, 0, y, L / 2 - 5);
  k.add(new THREE.BoxGeometry(W + 2.4, 0.25, 2), 0xf3efe6, 0, 10.6, L / 2 - 7.6); // köprü kanatları
  k.add(new THREE.CylinderGeometry(1.0, 1.15, 3.4, 8), TANKER_COLS[ci], 0, 12.3, L / 2 - 3.2); // baca
  k.add(new THREE.CylinderGeometry(1.02, 1.02, 0.6, 8), 0x16171c, 0, 13.8, L / 2 - 3.2);
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), 0xf3efe6, 0, 13, L / 2 - 7);
  k.add(new THREE.CylinderGeometry(0.08, 0.08, 6, 4), 0xf3efe6, 0, 6.6, -L / 2 + 2); // pruva direği
  return (tankerCache[ci] = k.build());
}

// ---------------- zıplayan balık ----------------
// Boğaz istavriti: burun +x, sırtı mavi-yeşil, yanları gümüş. Tek geometri, bütün balıklar paylaşır.
export const FISH = (() => {
  const k = new Kit(), back = 0x2f7f9a, side = 0xc9d8e0, belly = 0xf4f7f8;
  k.add(new THREE.SphereGeometry(0.3, 10, 7), (f, y) => (y > 0.05 ? back : y > -0.06 ? side : belly), 0, 0, 0, 0, 0, 0, 1.7, 0.75, 0.5);
  k.add(new THREE.SphereGeometry(0.045, 5, 4), 0x111418, 0.36, 0.06, 0.12);
  k.add(new THREE.SphereGeometry(0.045, 5, 4), 0x111418, 0.36, 0.06, -0.12);
  const tl = new THREE.Shape(); tl.moveTo(0, 0); tl.lineTo(-0.3, 0.26); tl.lineTo(-0.2, 0); tl.lineTo(-0.3, -0.26); tl.closePath();
  const tlG = new THREE.ExtrudeGeometry(tl, { depth: 0.04, bevelEnabled: false }); tlG.translate(0, 0, -0.02);
  k.add(tlG, back, -0.46, 0, 0); // kuyruk (dikey)
  k.add(new THREE.BoxGeometry(0.26, 0.12, 0.03), back, -0.02, 0.24, 0, 0, 0, 0.35); // sırt yüzgeci
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
// Vapur çeşitleri. Genişlik hep ±4: şerit = gövde, martı küpeşte içinde kalır (main.js EDGE). Boy, pruva/kıç, bantlar, pencere sırası, köşk ve baca değişir.
// Baş -z'de (vapur da martı da -z'ye gider); her tip gövdenin uçlarını aynı yerde bitirir: baş -L/2-1.2, kıç L/2+1.5.
const FERRY_STYLE = {
  hat: { bottom: [0.95, 0x1b2738], stripe: 0xc8352e },    // klasik hat vapuru: sivri yuvarlak kıç, tek pencere bandı
  motor: { bottom: [0.95, 0x22262e], stripe: 0x2f6fb4 },  // kısa motor: küt baş, ayna kıç, lomboz pencereler, mavi bant
  buyuk: { bottom: [0.7, 0x1b2738], stripe: 0xc8352e },   // büyük vapur: iki sıra pencere, altın yaldız şerit, köprü kanatları, filikalar
};
const ferryCache = new Map();
export function ferryGeo(L, type = 'hat') {
  const key = type + L;
  if (ferryCache.has(key)) return ferryCache.get(key);
  const k = new Kit(), S = FERRY_STYLE[type];
  const sh = new THREE.Shape();
  if (type === 'motor') {
    sh.moveTo(-4, -L / 2 + 2); sh.quadraticCurveTo(-4, -L / 2 - 0.6, -2.2, -L / 2 - 1.2); sh.lineTo(2.2, -L / 2 - 1.2); sh.quadraticCurveTo(4, -L / 2 - 0.6, 4, -L / 2 + 2);
    sh.lineTo(4, L / 2 - 1.5); sh.quadraticCurveTo(4, L / 2 + 1.5, 2.6, L / 2 + 1.5); sh.lineTo(-2.6, L / 2 + 1.5); sh.quadraticCurveTo(-4, L / 2 + 1.5, -4, L / 2 - 1.5); sh.closePath();
  } else {
    sh.moveTo(-4, -L / 2 + 3); sh.quadraticCurveTo(-4, -L / 2, -1.5, -L / 2 - 1.2); sh.lineTo(1.5, -L / 2 - 1.2); sh.quadraticCurveTo(4, -L / 2, 4, -L / 2 + 3);
    sh.lineTo(4, L / 2 - 7); sh.quadraticCurveTo(3.4, L / 2 - 1, 0, L / 2 + 1.5); sh.quadraticCurveTo(-3.4, L / 2 - 1, -4, L / 2 - 7); sh.closePath();
  }
  // gövde katmanları: altı koyu, ortası beyaz, üstte renkli şerit (her biri ayrı kalıp → renk şeritleri düz)
  const layer = (y0, h, col, grow = 1) => {
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    k.add(g, col, 0, y0, 0, 0, 0, 0, grow, 1, 1 + (grow - 1) * 0.3);
  };
  const [bh, bc] = S.bottom;
  layer(0, bh, bc);
  layer(bh, DECK - bh, 0xf3efe6);
  layer(2.05, 0.22, S.stripe, 1.012);
  if (type === 'buyuk') layer(1.93, 0.07, 0xd9b24a, 1.008);
  // pencereler: bant + dikmeler; motorda tek tek lomboz
  if (type === 'motor') {
    for (let z = -L / 2 + 6; z < L / 2 - 4; z += 1.9) for (const s of [-1, 1]) {
      k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), 0xf3efe6, s * 4.01, 1.55, z, 0, 0, Math.PI / 2);
      k.add(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 10), 0x2b4560, s * 4.02, 1.55, z, 0, 0, Math.PI / 2);
    }
  } else {
    for (const y of type === 'buyuk' ? [1.07, 1.62] : [1.5]) {
      const h = type === 'buyuk' ? 0.36 : 0.5;
      k.add(new THREE.BoxGeometry(8.04, h, L - 16), 0x2b4560, 0, y, 1.5);
      for (let z = -L / 2 + 9; z < L / 2 - 8; z += 1.6) for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.02, h, 0.16), 0xf3efe6, s * 4.03, y, z);
    }
  }
  // güverte, korkuluk
  k.add(new THREE.BoxGeometry(7.6, 0.06, L - 7), 0xa8774a, 0, DECK + 0.02, 0.8);
  for (let z = -L / 2 + 5; z < L / 2 - 5; z += 1.2) k.add(new THREE.BoxGeometry(7.65, 0.04, 0.06), 0x94673e, 0, DECK + 0.055, z);
  for (const s of [-1, 1]) {
    k.add(new THREE.BoxGeometry(0.07, 0.07, L - 9), 0xf3efe6, s * 3.85, DECK + 0.75, 1.2);
    for (let z = -L / 2 + 5; z < L / 2 - 4; z += 2.2) k.add(new THREE.BoxGeometry(0.05, 0.75, 0.05), 0xf3efe6, s * 3.85, DECK + 0.38, z);
    for (const z of [-L / 4, L / 4]) k.add(new THREE.TorusGeometry(0.34, 0.1, 5, 10), (f) => (f % 6 < 3 ? 0xf07b22 : 0xffffff), s * 4.08, 1.35, z, 0, Math.PI / 2);
  }
  // kaptan köşkü (uçuş yüksekliğinin altında)
  if (type === 'motor') {
    const bz = -L / 2 + 5;
    k.add(new THREE.BoxGeometry(3.2, 1.3, 2.6), 0xf3efe6, 0, DECK + 0.65, bz);
    k.add(new THREE.BoxGeometry(3.24, 0.45, 2.64), 0x2b4560, 0, DECK + 0.95, bz);
    k.add(new THREE.BoxGeometry(3.5, 0.12, 2.9), S.stripe, 0, DECK + 1.36, bz);
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), 0xf3efe6, s * 3.2, DECK + 0.32, -L / 2 + 8.5, Math.PI / 2); // can salı kapları
  } else {
    const bz = -L / 2 + 6;
    k.add(new THREE.BoxGeometry(3.8, 1.5, 3.2), 0xf3efe6, 0, DECK + 0.75, bz);
    k.add(new THREE.BoxGeometry(3.84, 0.5, 3.24), 0x2b4560, 0, DECK + 1.05, bz);
    k.add(new THREE.BoxGeometry(4.2, 0.12, 3.6), S.stripe, 0, DECK + 1.56, bz);
    if (type === 'buyuk') {
      k.add(new THREE.BoxGeometry(8.4, 0.1, 1.1), 0xf3efe6, 0, DECK + 1.5, bz + 0.6); // köprü kanatları
      for (const s of [-1, 1]) {
        k.add(new THREE.BoxGeometry(0.06, 0.5, 1.1), 0xf3efe6, s * 4.15, DECK + 1.75, bz + 0.6);
        for (const z of [-L / 2 + 16, L / 2 - 14]) { // küpeştenin dışında asılı turuncu filikalar
          k.add(new THREE.BoxGeometry(0.9, 0.5, 3.6), (f, y) => (y > DECK + 1.05 ? 0xf3efe6 : 0xf07b22), s * 4.55, DECK + 0.85, z);
          for (const dz of [-1.4, 1.4]) k.add(new THREE.BoxGeometry(0.08, 1.4, 0.08), 0x8a8f99, s * 4.15, DECK + 1.0, z + dz, 0, 0, s * 0.35);
        }
      }
    }
  }
  const geo = k.build();
  ferryCache.set(key, geo);
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
// tip tanımları: chim kalıbı ile çarpma kutusu (hw, hd, top) birebir eşleşir; salon: camlı salon gelebilir mi
export const FERRY_TYPES = [
  { id: 'hat', w: 0.55, lengths: [44, 49, 54, 58], chim: CHIMNEY, hw: 0.95, hd: 0.95, top: 4.7, salon: true },
  { id: 'motor', w: 0.25, lengths: [34, 38], hw: 0.75, hd: 1.15, top: 3.6, salon: false,
    chim: new Kit() // kısa, oval, kıça yatık baca
      .add(new THREE.CylinderGeometry(0.6, 0.7, 3.0, 12), 0xf3efe6, 0, 1.5, 0, 0.15, 0, 0, 1, 1, 1.3)
      .add(new THREE.CylinderGeometry(0.58, 0.6, 0.45, 12), 0x2f6fb4, 0, 2.55, 0.2, 0.15, 0, 0, 1, 1, 1.3)
      .add(new THREE.CylinderGeometry(0.57, 0.57, 0.5, 12), 0x16171c, 0, 3.15, 0.27, 0.15, 0, 0, 1, 1, 1.3).build() },
  { id: 'buyuk', w: 0.2, lengths: [60, 64], hw: 1.12, hd: 1.12, top: 5.1, salon: true,
    chim: new Kit() // geniş baca: lacivert bant, altın yaldız, siyah ağız
      .add(new THREE.CylinderGeometry(1.0, 1.12, 5.0, 16), 0xf3efe6, 0, 2.5, 0)
      .add(new THREE.CylinderGeometry(1.02, 1.04, 0.6, 16), 0x1d3c78, 0, 3.55, 0)
      .add(new THREE.CylinderGeometry(1.03, 1.03, 0.12, 16), 0xd9b24a, 0, 3.95, 0)
      .add(new THREE.CylinderGeometry(1.01, 1.01, 0.9, 16), 0x16171c, 0, 4.6, 0)
      .add(new THREE.CylinderGeometry(0.82, 0.82, 0.1, 16), 0x050507, 0, 5.06, 0).build() },
];
export function pickFerryType() { let r = Math.random(); for (const t of FERRY_TYPES) if ((r -= t.w) < 0) return t; return FERRY_TYPES[0]; }
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
// gözlük camının merkezi ve açısı: kafa yüzeyine teğet (normal yatayda −z'den 0.9 rad dışa), merkezden 0.36 uzakta
const EYE_X = 0.27, EYE_Y = 0.31, EYE_Z = -0.93, EYE_RY = 0.9;
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
    // camlar gözlerin (±0.19, 0.28, −0.86) önünde, kafa küresine teğet ve ondan ~6 cm açıkta (EYE_* ortak); köprü gaganın üstünden geçer
    for (const s of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.17, 0.13, 0.035), 0x14161c, s * EYE_X, EYE_Y, EYE_Z, 0, -s * EYE_RY);
      k.add(new THREE.BoxGeometry(0.025, 0.025, 0.3), 0x14161c, s * 0.335, 0.32, -0.76);
    }
    k.add(new THREE.BoxGeometry(0.44, 0.03, 0.03), 0x14161c, 0, 0.32, -1.02);
  } else if (id === 'mustache') { // gaganın kökünde, iki yana sarkıp uçta yukarı kıvrılan pala bıyık; hepsi kafa küresinin dışında
    for (const s of [-1, 1]) {
      k.add(new THREE.CapsuleGeometry(0.05, 0.2, 3, 6), 0x2a1a12, s * 0.15, 0.12, -1.06, 0, 0, -s * 1.75);
      k.add(new THREE.CapsuleGeometry(0.04, 0.09, 3, 6), 0x2a1a12, s * 0.3, 0.13, -1.0, 0, -s * 0.5, -s * 0.45);
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
      k.add(heartGeo(0.095), 0xff4f8b, s * EYE_X, EYE_Y, EYE_Z, 0, Math.PI - s * EYE_RY);
      k.add(new THREE.BoxGeometry(0.025, 0.025, 0.3), 0xd12f6a, s * 0.335, 0.32, -0.76);
    }
    k.add(new THREE.BoxGeometry(0.44, 0.03, 0.03), 0xd12f6a, 0, 0.32, -1.02);
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

// ---------------- ana menü arka sahnesi: şehri tanıtan yakın manzara ----------------
// Vitrin kamerası martının önünde durup geriye bakar; bu sahne martının gerisinde (+z) onunla birlikte ilerler, yalnız başlık ekranında görünür.
// Üç katman ayrı mesh: ön (kıyı, rıhtım, tekneler), orta (yamaç evleri, simge yapılar), arka (karşı kıyı, dağlar). Kamera salınınca
// farklı hızda kayarlar (main.js TITLE_LAYERS): derinlik hissi. Koordinatlar: x=0 ortası, z=0 suya bakan ön kenar, +z içeri doğru.
// softMat ile çizilir: tepeler, kubbeler, ağaçlar yumuşak gölgeli; kutu evler köşeli kalır.
const vert = fn => Object.assign(fn, { vert: true }); // köşe başına renk: (yüz, y, x, z) => renk; tepe ve ağaçta yumuşak geçiş
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z) => {
  const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  const n0 = hash(xi, zi) + (hash(xi + 1, zi) - hash(xi, zi)) * a, n1 = hash(xi, zi + 1) + (hash(xi + 1, zi + 1) - hash(xi, zi + 1)) * a;
  return n0 + (n1 - n0) * b;
};
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.3 + 5, z * 2.3) * 0.3 + vnoise(x * 5.1, z * 5.1 + 9) * 0.1;
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mixHex = (a, b, t) => _ca.setHex(a).lerp(_cb.setHex(b), Math.min(1, Math.max(0, t))).getHex();
const bump = (x, z, cx, cz, rx, rz) => Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));
const ramp = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function terrain(k, x0, x1, z0, z1, nx, nz, hAt, colAt) { // yükseklik alanı: yumuşak normaller, renk yükseklik ve gürültüden
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  k.add(g, vert((f, y, x, z) => colAt(x, y, z)));
}
function scatter(x0, x1, z0, z1, step, keep) { // düzensiz ızgara: sıralar kayar, aralıklar oynar
  const out = [];
  for (let z = z0; z < z1; z += step * rand(0.8, 1.15)) for (let x = x0 + rand(0, step); x < x1; x += step * rand(0.7, 1.4)) {
    const px = x + rand(-0.3, 0.3) * step, pz = z + rand(-0.3, 0.3) * step;
    if (!keep || keep(px, pz)) out.push([px, pz]);
  }
  return out;
}
const HOUSE_COLS = [0xf1e3c8, 0xe9c9a6, 0xf3d9d0, 0xd9e1d0, 0xf6eee0, 0xe7b98f, 0xcfd8e3, 0xf0d58c, 0xe8a98a, 0xf4e6b8, 0xdcc6e0];
const ROOF_COLS = [0xc0533a, 0xb4482f, 0xcf6a45, 0xa9503c, 0xd27a52];
const ROOF = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4); // tabanı 1×1 kare, kutuyla hizalı
// yamaç evleri: temel toprağa gömülür, kırma çatı ya da düz dam, kıyıya bakan cephede pencereler (bazıları yanık)
function houses(k, pts, hAt, o = {}) {
  const [h0, h1] = o.h || [3.2, 7.5], flat = o.flat ?? 0.3, haze = o.haze || 0, hz = c => (haze ? mixHex(c, o.hazeCol, haze) : c);
  for (const [x, z] of pts) {
    const y = hAt(x, z), w = rand(2.8, 5.2) * (o.s || 1), d = rand(2.8, 4.6) * (o.s || 1), h = rand(h0, h1), ry = rand(-0.2, 0.2);
    k.add(new THREE.BoxGeometry(w, h + 2.5, d), hz(pick(o.cols || HOUSE_COLS)), x, y + h / 2 - 1.25, z, 0, ry);
    if (Math.random() > flat) k.add(ROOF, hz(pick(ROOF_COLS)), x, y + h + 0.75, z, 0, ry, 0, w + 0.5, rand(1.2, 2), d + 0.5);
    else k.add(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), hz(0xd9c7a5), x, y + h - 0.05, z, 0, ry);
    if (o.win === false) continue;
    const c = Math.cos(ry), s = Math.sin(ry), nw = Math.max(1, Math.floor(w / 1.7)), nf = Math.max(1, Math.floor(h / 2.3));
    for (let f = 0; f < nf; f++) for (let i = 0; i < nw; i++) {
      const lx = (i - (nw - 1) / 2) * (w / nw), lz = -d / 2 - 0.04, lit = Math.random() < (o.lit || 0.12);
      k.add(new THREE.PlaneGeometry(0.75, 1.05), hz(lit ? 0xf6d78e : 0x4d6684), x + lx * c + lz * s, y + 1.2 + f * 2.2, z - lx * s + lz * c, 0, ry + Math.PI);
    }
  }
}
function tree(k, x, y, z, s = 1, haze = 0, hc = 0) { // yuvarlak taç: iki üç top, alt yüzü gölgede koyu
  k.add(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2.2 * s, 5), 0x6b5038, x, y + 1.1 * s, z);
  const c = pick([0x4f7d3a, 0x5b8a41, 0x467334, 0x6a9046]);
  for (let i = 0; i < 3; i++) k.add(new THREE.IcosahedronGeometry(rand(1.3, 1.9) * s, 1), vert((f, yy) => mixHex(mixHex(0x2c4a24, c, (yy - y - 1.6 * s) / (2.6 * s)), hc, haze)), x + rand(-1, 1) * s, y + rand(2.6, 3.6) * s, z + rand(-1, 1) * s);
}
const cypress = (k, x, y, z, h) => k.add(new THREE.ConeGeometry(h * 0.15, h, 8), vert((f, yy) => mixHex(0x1f3a22, 0x416e3c, (yy - y) / h)), x, y + h / 2 - 0.3, z);
function mosque(k, x, y, z, s = 1, o = {}) { // kare gövde, kasnaklı ana kubbe, yarım kubbeler, şerefeli kurşun külahlı minareler
  const wall = o.wall || 0xe9e2d4, lead = o.lead || 0x8c9cad, cone = o.cone || 0x7f90a3;
  k.add(new THREE.BoxGeometry(18 * s, 7 * s, 16 * s), wall, x, y + 3.5 * s, z);
  k.add(new THREE.BoxGeometry(14 * s, 3 * s, 12 * s), wall, x, y + 8 * s, z);
  k.add(new THREE.CylinderGeometry(6.4 * s, 6.8 * s, 2.4 * s, 24), mixHex(wall, 0x000000, 0.05), x, y + 10.2 * s, z);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.add(new THREE.PlaneGeometry(0.7 * s, 1.2 * s), 0x55657a, x + Math.sin(a) * 6.62 * s, y + 10.2 * s, z + Math.cos(a) * 6.62 * s, 0, a); }
  k.add(new THREE.SphereGeometry(6.3 * s, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), lead, x, y + 11.3 * s, z);
  k.add(new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 2.4 * s, 4), 0xd9b24a, x, y + 18.6 * s, z);
  for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) k.add(new THREE.SphereGeometry(3 * s, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), lead, x + dx * s, y + 9 * s, z + dz * s);
  for (const [dx, dz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) k.add(new THREE.SphereGeometry(1.6 * s, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), lead, x + dx * s, y + 7 * s, z + dz * s);
  for (const [dx, dz, h] of o.minarets || [[-11, -9, 30], [11, -9, 30], [-11, 9, 26], [11, 9, 26]]) {
    const mx = x + dx * s, mz = z + dz * s;
    k.add(new THREE.CylinderGeometry(0.62 * s, 0.85 * s, h * s, 12), 0xf1ebdf, mx, y + h * s / 2, mz);
    for (const f of h > 28 ? [0.62, 0.8] : [0.76]) k.add(new THREE.CylinderGeometry(1.15 * s, 0.75 * s, 0.6 * s, 12), 0xd9cfbc, mx, y + h * s * f, mz);
    k.add(new THREE.ConeGeometry(0.72 * s, 4.6 * s, 12), cone, mx, y + (h + 2.3) * s, mz);
  }
}
const palm = (k, x, y, z, h) => { // eğik gövde, sarkık yapraklar
  const lean = rand(-0.12, 0.12), tx = x + Math.sin(lean) * h;
  k.add(new THREE.CylinderGeometry(0.26, 0.42, h, 7), vert((f, yy) => mixHex(0x7a5b3e, 0x9c7b55, (yy - y) / h)), x + Math.sin(lean) * h / 2, y + h / 2, z, 0, 0, -lean);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + rand(-0.3, 0.3); k.add(new THREE.ConeGeometry(0.55, 4.4, 4), (i % 2 ? 0x4f8a3c : 0x3f7a33), tx + Math.sin(a) * 1.8, y + h - 0.4, z + Math.cos(a) * 1.8, Math.cos(a) * 1.95, 0, -Math.sin(a) * 1.95, 1, 1, 0.25); }
};
function boat(k, x, z, ry) { // rıhtıma bağlı kayık: renkli gövde, beyaz kamara, kısa direk
  const c = pick([0x2f6fa8, 0xc0392b, 0x2e8b6a, 0xe0a030, 0xf4f1e8, 0x3d5a8a]), L = rand(4.5, 7);
  k.add(new THREE.BoxGeometry(2.1, 1.1, L, 1, 2, 1), (f, y) => (y < 0.15 ? 0x2a2e36 : c), x, 0.15, z, 0, ry);
  k.add(new THREE.BoxGeometry(1.6, 1, L * 0.35), 0xf4f1e8, x - Math.sin(ry) * L * 0.12, 1.2, z - Math.cos(ry) * L * 0.12, 0, ry);
  if (Math.random() < 0.6) k.add(new THREE.CylinderGeometry(0.06, 0.08, 4, 4), 0xe8e2d2, x + Math.sin(ry) * L * 0.2, 2.6, z + Math.cos(ry) * L * 0.2);
}
function quay(k, x0, x1, top, wet, stone) { // taş rıhtım: suya inen ıslak bant, kenar taşı, babalar, fenerler
  const w = x1 - x0, cx = (x0 + x1) / 2;
  k.add(new THREE.BoxGeometry(w, 2.4, 9, 1, 2, 1), (f, y) => (y < -0.2 ? wet : stone), cx, -0.2, 4.5);
  k.add(new THREE.BoxGeometry(w, 0.35, 0.9), mixHex(stone, 0xffffff, 0.25), cx, 1.15, 0.45);
  k.add(new THREE.BoxGeometry(w, 0.3, 18), top, cx, 1.05, 9); // gezinti yolu yamacın eteğinin altına girer: katmanlar kayınca aralık görünmez
  for (let x = x0 + 3; x < x1; x += rand(5, 9)) k.add(new THREE.CylinderGeometry(0.3, 0.34, 1, 8), 0x2c2f38, x, 1.5, 1.1);
  for (let x = x0 + 8; x < x1; x += rand(16, 24)) {
    k.add(new THREE.CylinderGeometry(0.14, 0.2, 5, 6), 0x2d3240, x, 3.5, 2.2);
    k.add(new THREE.SphereGeometry(0.5, 10, 8), 0xfff1c8, x, 6.2, 2.2);
  }
}
const ferryAt = (k, x, z, ry) => { // iskeleye yanaşmış vapur: beyaz gövde, siyah-kırmızı bant, baca
  k.add(new THREE.BoxGeometry(5.6, 2.4, 22), (f, y) => (y < 0.7 ? 0x22262e : y < 1.2 ? 0xc0392b : 0xf6f3ea), x, 0.6, z, 0, ry);
  k.add(new THREE.BoxGeometry(4.6, 2.6, 14), 0xf6f3ea, x, 3.1, z, 0, ry);
  for (let i = -5; i <= 5; i++) k.add(new THREE.PlaneGeometry(0.9, 0.9), 0x41556e, x + Math.sin(ry) * i * 1.2 + Math.cos(ry) * 2.33, 3.3, z + Math.cos(ry) * i * 1.2 - Math.sin(ry) * 2.33, 0, ry + Math.PI / 2);
  k.add(new THREE.CylinderGeometry(0.8, 0.9, 3.2, 14), (f, y) => (y > 5.6 ? 0x22262e : 0xf6f3ea), x, 5.6, z);
};
const SOFT = { smooth: true };
export const TITLE_SETS = {
  istanbul() { // ön: Karaköy rıhtımı, iskele, vapur, kayıklar · orta: Galata yamacı ve kulesi · arka: tarihi yarımada, Süleymaniye, Ayasofya
    const near = new Kit(), mid = new Kit(), far = new Kit();
    quay(near, -330, 330, 0xcfc4ae, 0x5f5a50, 0xb9ad98);
    for (let x = -320; x < 320; x += rand(10, 18)) if (Math.abs(x + 22) > 18) tree(near, x, 1.2, rand(10, 13), rand(0.85, 1.15));
    // Karaköy iskelesi: krem bina, kurşun çatı, saat kulesi, suya uzanan iskele
    near.add(new THREE.BoxGeometry(24, 6, 9), 0xf0e4cc, -22, 4, 8);
    near.add(new THREE.BoxGeometry(25, 0.6, 10), 0xd2c3a6, -22, 7.2, 8);
    near.add(ROOF, 0x7d8b9a, -22, 9, 8, 0, 0, 0, 24.5, 3, 9.5);
    near.add(new THREE.BoxGeometry(3, 6, 3), 0xf0e4cc, -22, 12, 6);
    near.add(new THREE.CircleGeometry(0.9, 16), 0xfdfaf2, -22, 13, 4.48, 0, Math.PI);
    near.add(ROOF, 0x7d8b9a, -22, 16, 6, 0, 0, 0, 3.6, 2.4, 3.6);
    for (let i = -4; i <= 4; i++) near.add(new THREE.PlaneGeometry(1.6, 2.6), 0x4d6684, -22 + i * 2.6, 3.4, 3.46, 0, Math.PI);
    near.add(new THREE.BoxGeometry(10, 0.8, 12), 0xb0a48e, -22, 0.6, -5);
    ferryAt(near, -22, -14.5, Math.PI / 2 - 0.05);
    for (const [x0, n] of [[-120, 5], [40, 6], [150, 4]]) for (let i = 0; i < n; i++) boat(near, x0 + i * rand(3.2, 4.4), -3.4, rand(-0.12, 0.12));
    // Galata yamacı: kıyıdan yükselen tepe, sık evler, ağaç kümeleri, servi
    const hM = (x, z) => -1 + ramp(12, 26, z) * ramp(40, 5, x) * (30 * bump(x, z, -70, 75, 110, 48) + 16 * bump(x, z, -240, 85, 95, 55) + fbm(x * 0.035, z * 0.035) * 6);
    terrain(mid, -340, 45, 10, 130, 96, 40, hM, (x, y, z) => { const n = fbm(x * 0.05 + 3, z * 0.05); return mixHex(mixHex(0xb9a684, 0xa79c78, y / 30), 0x6d8a4c, ramp(0.55, 0.7, n)); });
    const gx = -58, gz = 62, gy = hM(gx, gz);
    houses(mid, scatter(-335, 32, 16, 118, 7.2, (x, z) => hM(x, z) > 0.6 && Math.hypot(x - gx, z - gz) > 9 && fbm(x * 0.05 + 3, z * 0.05) < 0.6), hM, { lit: 0.16 });
    for (const [x, z] of scatter(-330, 30, 20, 115, 13, (x, z) => hM(x, z) > 1 && fbm(x * 0.05 + 3, z * 0.05) > 0.56)) Math.random() < 0.35 ? cypress(mid, x, hM(x, z), z, rand(6, 9)) : tree(mid, x, hM(x, z), z, rand(0.9, 1.3));
    // Galata Kulesi: taş gövde, pencereler, seyir şerefesi, kurşun külah
    mid.add(new THREE.CylinderGeometry(4.4, 4.9, 4, 24), 0xc9b79b, gx, gy + 2, gz);
    mid.add(new THREE.CylinderGeometry(3.6, 4, 22, 24), 0xd5c4a6, gx, gy + 15, gz);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; for (const yy of [8, 14, 20]) mid.add(new THREE.PlaneGeometry(0.7, 1.4), 0x3d4a5e, gx + Math.sin(a) * 3.86, gy + yy, gz + Math.cos(a) * 3.86, 0, a); }
    mid.add(new THREE.CylinderGeometry(4.3, 3.7, 1, 24), 0xb9a78b, gx, gy + 26.4, gz);
    mid.add(new THREE.CylinderGeometry(3.4, 3.4, 3.2, 24), 0xe6dccb, gx, gy + 28.4, gz);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; mid.add(new THREE.PlaneGeometry(1, 2), 0x2f3a4a, gx + Math.sin(a) * 3.42, gy + 28.4, gz + Math.cos(a) * 3.42, 0, a); }
    mid.add(new THREE.ConeGeometry(3.9, 9, 24), 0x56708c, gx, gy + 34.5, gz);
    mid.add(new THREE.SphereGeometry(0.45, 10, 8), 0xd9b24a, gx, gy + 39.3, gz);
    // tarihi yarımada: Haliç'in ardında, sise karışan tepe; Yeni Cami kıyıda, Süleymaniye tepede, Ayasofya burunda
    const HZ = 0xe2cbd0, hz = c => mixHex(c, HZ, 0.3);
    const hF = (x, z) => -1 + ramp(80, 100, z) * ramp(10, 45, x) * (20 * bump(x, z, 130, 140, 80, 50) + 15 * bump(x, z, 270, 150, 70, 50) + fbm(x * 0.03, z * 0.03) * 6);
    terrain(far, 0, 420, 78, 240, 84, 32, hF, (x, y) => hz(mixHex(0xc0ab8c, 0xa9a27e, y / 22)));
    houses(far, scatter(25, 410, 92, 220, 9, (x, z) => hF(x, z) > 0.6 && Math.hypot(x - 130, z - 140) > 18 && Math.hypot(x - 72, z - 104) > 12 && Math.hypot(x - 270, z - 150) > 18), hF, { win: false, haze: 0.3, hazeCol: HZ });
    mosque(far, 72, hF(72, 104), 104, 0.9, { wall: hz(0xe9e2d4), lead: hz(0x8c9cad), cone: hz(0x7f90a3) });
    mosque(far, 130, hF(130, 140), 140, 1.35, { wall: hz(0xece6d8), lead: hz(0x8c9cad), cone: hz(0x7f90a3) });
    mosque(far, 270, hF(270, 150), 150, 1.4, { wall: hz(0xd9a48a), lead: hz(0x8f9aa6), cone: hz(0x7f90a3), minarets: [[-12, -10, 27], [12, -10, 27], [-12, 10, 27], [12, 10, 27]] });
    for (const [x, z] of scatter(20, 410, 95, 220, 16, (x, z) => hF(x, z) > 1)) cypress(far, x, hF(x, z), z, rand(6, 10));
    // arkada uzanan tepeler (Beyoğlu'nun ardı), sise karışır
    const hR = (x, z) => -1 + ramp(150, 190, z) * (10 + 26 * fbm(x * 0.012, z * 0.02) + 14 * bump(x, z, -300, 230, 90, 50));
    terrain(far, -440, 40, 140, 280, 70, 20, hR, (x, y, z) => mixHex(mixHex(0xa49c84, 0x7f8f66, ramp(0.5, 0.65, fbm(x * 0.04, z * 0.04))), HZ, 0.2 + y / 160));
    houses(far, scatter(-430, 20, 160, 215, 10, (x, z) => hR(x, z) > 4 && fbm(x * 0.04, z * 0.04) < 0.55), hR, { win: false, haze: 0.3, hazeCol: HZ, h: [5, 14], flat: 0.75 });
    return { near: near.build(SOFT), mid: mid.build(SOFT), far: far.build(SOFT) };
  },
  izmir() { // ön: Kordon palmiyeleri, Saat Kulesi, Yalı Camii, fayton, Konak Pier · orta: Kadifekale yamacı, Asansör · arka: Bayraklı kuleleri, Yamanlar
    const near = new Kit(), mid = new Kit(), far = new Kit();
    quay(near, -330, 330, 0xddd2ba, 0x56604f, 0xc8bc9f);
    near.add(new THREE.BoxGeometry(660, 0.25, 6), 0x7fa05a, 0, 1.25, 12); // Kordon çimeni
    for (let x = -325; x < 325; x += rand(7, 13)) if (Math.abs(x + 8) > 12 && Math.abs(x - 14) > 8 && Math.abs(x - 70) > 26) palm(near, x, 1.2, rand(9.5, 12.5), rand(7, 10.5));
    const cx = -8, cz = 9, cy = 1.2; // Konak Saat Kulesi: sekizgen kaide, dört kat, kemerli pencereler, saat kadranları, kurşun kubbe
    near.add(new THREE.CylinderGeometry(6, 6.4, 1, 8), 0xcfc2a6, cx, cy + 0.5, cz);
    for (const [r, h, y] of [[3.6, 7, 1], [2.9, 6, 8], [2.3, 5, 14], [1.8, 3.6, 19]]) {
      near.add(new THREE.CylinderGeometry(r, r + 0.2, h, 8), 0xf0e3c8, cx, cy + y + h / 2, cz);
      near.add(new THREE.CylinderGeometry(r + 0.55, r + 0.55, 0.45, 8), 0xc98e5a, cx, cy + y + h, cz);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; near.add(new THREE.PlaneGeometry(r * 0.5, h * 0.5), 0x4b5a72, cx + Math.sin(a) * (r * 0.93 + 0.07), cy + y + h * 0.5, cz + Math.cos(a) * (r * 0.93 + 0.07), 0, a); }
    }
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) near.add(new THREE.CylinderGeometry(1, 1, 0.12, 20), 0xfdfaf2, cx + Math.sin(a) * 2.8, cy + 11, cz + Math.cos(a) * 2.8, Math.PI / 2, a, 0);
    near.add(new THREE.SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x8ca3b8, cx, cy + 22.6, cz);
    near.add(new THREE.CylinderGeometry(0.08, 0.08, 2, 4), 0xd9b24a, cx, cy + 25, cz);
    for (const dx of [-5, 5]) near.add(new THREE.CylinderGeometry(1.2, 1.5, 1.6, 12), 0xd6c8ab, cx + dx, cy + 0.8, cz - 4); // çeşmeler
    const my = 14, mz = 10; // Yalı Camii: çinili sekizgen, tek kubbe, tek minare
    near.add(new THREE.CylinderGeometry(4, 4, 5, 8, 4), (f, y) => (y > 4.9 ? 0x5c8fb0 : 0xf3e9d6), my, cy + 2.5, mz);
    near.add(new THREE.SphereGeometry(3.9, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x9aaabb, my, cy + 5, mz);
    near.add(new THREE.CylinderGeometry(0.5, 0.6, 15, 10), 0xf3e9d6, my + 4.6, cy + 7.5, mz + 1);
    near.add(new THREE.CylinderGeometry(0.95, 0.6, 0.5, 10), 0xd9cfbc, my + 4.6, cy + 12, mz + 1);
    near.add(new THREE.ConeGeometry(0.65, 3, 10), 0x7f90a3, my + 4.6, cy + 16.5, mz + 1);
    // fayton: kırmızı araba, siyah körük, dört tekerlek, kahverengi at
    const fx = -40, fz = 5;
    near.add(new THREE.BoxGeometry(2.4, 1.3, 3), 0x8e2a2a, fx, cy + 1.6, fz);
    near.add(new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x222222, fx, cy + 2.2, fz + 0.6, 0, 0, 0, 0.9, 1, 0.8);
    for (const [dx, dz, r] of [[-1.3, -1, 0.6], [1.3, -1, 0.6], [-1.3, 1.1, 0.85], [1.3, 1.1, 0.85]]) near.add(new THREE.CylinderGeometry(r, r, 0.15, 14), 0x3a2a1c, fx + dx, cy + r, fz + dz, 0, 0, Math.PI / 2);
    near.add(new THREE.BoxGeometry(1, 1.1, 2.6), 0x6e4a2e, fx, cy + 2, fz - 3.4);
    near.add(new THREE.BoxGeometry(0.5, 1.3, 0.6), 0x6e4a2e, fx, cy + 2.9, fz - 4.6, -0.5);
    near.add(new THREE.BoxGeometry(0.5, 0.5, 1.1), 0x6e4a2e, fx, cy + 3.4, fz - 5.1);
    for (const [dx, dz] of [[-0.3, -4.4], [0.3, -4.4], [-0.3, -2.4], [0.3, -2.4]]) near.add(new THREE.BoxGeometry(0.22, 1.5, 0.22), 0x5a3a22, fx + dx, cy + 0.75, fz + dz);
    // Konak Pier: suya uzanan uzun bina, kemerli cam çatı
    near.add(new THREE.BoxGeometry(40, 4, 10), 0xeee6d6, 70, 2, -5);
    near.add(new THREE.CylinderGeometry(5, 5, 40, 20, 1, false, 0, Math.PI), 0xa9c0cf, 70, 4, -5, 0, 0, Math.PI / 2);
    for (let i = -8; i <= 8; i++) near.add(new THREE.PlaneGeometry(1.6, 2.4), 0x4d6684, 70 + i * 2.3, 2.2, -10.04, 0, Math.PI);
    for (const [x0, n] of [[-150, 5], [-90, 3], [130, 6]]) for (let i = 0; i < n; i++) boat(near, x0 + i * rand(3.2, 4.4), -3.4, rand(-0.12, 0.12));
    // yamaç: Kadifekale'ye çıkan sık, düz damlı evler; tepede surlar; Asansör kulesi
    const hM = (x, z) => -1 + ramp(14, 30, z) * ramp(70, 25, x) * (40 * bump(x, z, -90, 90, 120, 55) + 18 * bump(x, z, -260, 80, 90, 60) + fbm(x * 0.03, z * 0.03) * 7);
    terrain(mid, -340, 75, 12, 140, 96, 40, hM, (x, y, z) => mixHex(mixHex(0xc2ad7c, 0xb39d62, y / 40), 0x7f8f4e, ramp(0.55, 0.72, fbm(x * 0.05 + 7, z * 0.05))));
    houses(mid, scatter(-335, 60, 18, 120, 6.6, (x, z) => { const h = hM(x, z); return h > 0.6 && h < 34 && fbm(x * 0.05 + 7, z * 0.05) < 0.62; }), hM, { flat: 0.65, h: [3.5, 9], lit: 0.08 });
    for (const [x, z] of scatter(-330, 60, 20, 125, 14, (x, z) => hM(x, z) > 1 && fbm(x * 0.05 + 7, z * 0.05) > 0.58)) tree(mid, x, hM(x, z), z, rand(0.9, 1.25));
    for (let x = -118; x < -62; x += 3.6) { const z = 92 + Math.sin(x * 0.11) * 3, y = hM(x, z); mid.add(new THREE.BoxGeometry(3.7, 4.5, 2.2), 0xa48e6c, x, y + 1.8, z); if (Math.random() < 0.5) mid.add(new THREE.BoxGeometry(1.4, 1.3, 2.2), 0xa48e6c, x, y + 4.6, z); }
    for (const x of [-116, -92, -64]) { const z = 92 + Math.sin(x * 0.11) * 3; mid.add(new THREE.BoxGeometry(5.5, 9, 5), 0x9c8664, x, hM(x, z) + 3.5, z); }
    const ax = -150, az = 36, ay = hM(ax, az + 14); // Asansör: tuğla kule, tepede köşk, yamaca köprü
    mid.add(new THREE.BoxGeometry(5, ay + 6, 5, 1, Math.ceil((ay + 6) / 2.5), 1), (f, y) => (Math.floor(y / 2.5) % 2 ? 0xb5603f : 0xa8573a), ax, (ay + 6) / 2 - 1, az);
    mid.add(new THREE.BoxGeometry(7, 4, 7), 0xe9dcc5, ax, ay + 7, az);
    mid.add(ROOF, 0xb4482f, ax, ay + 9.8, az, 0, 0, 0, 7.6, 1.8, 7.6);
    mid.add(new THREE.BoxGeometry(3, 1, 14), 0x6f6a62, ax, ay + 5.2, az + 9);
    // arka: Bayraklı'nın cam kuleleri (aşağıdan yukarı gökyüzü yansıması, kat bantları) ve Yamanlar dağı
    const HZ = 0xeedcc6;
    for (const [x, z, h, w] of [[120, 150, 92, 10], [136, 156, 86, 10], [165, 140, 70, 12], [190, 165, 58, 11], [214, 150, 76, 9], [100, 175, 50, 12], [240, 170, 44, 12]]) {
      far.add(new THREE.BoxGeometry(w, h, w), vert((f, y) => mixHex(mixHex(0x5f7f9c, 0xc6dbe8, y / h), HZ, 0.2)), x, h / 2, z);
      for (let y = 3; y < h - 1; y += 3.2) far.add(new THREE.BoxGeometry(w + 0.12, 0.35, w + 0.12), 0x55708a, x, y, z); // kat bantları
      far.add(new THREE.BoxGeometry(w * 0.7, 3, w * 0.7), 0xd9e3ea, x, h + 1.5, z);
    }
    far.add(new THREE.CylinderGeometry(5.5, 6.5, 66, 20), vert((f, y) => mixHex(0x6d8ba5, 0xcfe0ea, y / 66)), 262, 33, 150);
    for (let y = 3; y < 65; y += 3.2) far.add(new THREE.CylinderGeometry(5.6 + (66 - y) / 66, 5.6 + (66 - y) / 66, 0.35, 20), 0x55708a, 262, y, 150);
    far.add(new THREE.CylinderGeometry(0.25, 0.25, 12, 4), 0xd9e3ea, 120, 98, 150);
    const hL = (x, z) => -1 + ramp(95, 115, z) * ramp(70, 110, x) * (6 + fbm(x * 0.04, z * 0.04) * 5);
    terrain(far, 60, 440, 92, 210, 60, 20, hL, (x, y) => mixHex(0xc7b48e, HZ, 0.3));
    houses(far, scatter(100, 430, 105, 200, 10, (x, z) => hL(x, z) > 0.5 && !(x < 280 && z < 185)), hL, { win: false, haze: 0.3, hazeCol: HZ, flat: 0.8, h: [4, 10] });
    const ridged = (x, z) => 1 - Math.abs(fbm(x, z) * 2 - 1); // sırtlı dağ: yumuşak tepe değil, keskin bel
    const hY = (x, z) => -1 + ramp(175, 225, z) * (22 + 60 * ridged(x * 0.009, z * 0.012) * (0.6 + 0.4 * bump(x, z, -80, 270, 220, 80)));
    terrain(far, -460, 460, 165, 330, 110, 28, hY, (x, y, z) => mixHex(mixHex(0x8d8a68, 0x6f8456, ramp(0.45, 0.65, fbm(x * 0.03 + 2, z * 0.03))), 0xd8cbbf, 0.18 + y / 200));
    return { near: near.build(SOFT), mid: mid.build(SOFT), far: far.build(SOFT) };
  },
};
