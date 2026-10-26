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
function featherTip(len, chord) {
  const s = new THREE.Shape();
  s.moveTo(0, -chord * 0.3); s.lineTo(len * 0.55, -chord * 0.1); s.lineTo(len, chord * 0.55); s.lineTo(len * 0.3, chord * 0.75); s.lineTo(0, chord * 0.7); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.052, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  return g;
}

// geometriler türe göre bir kez üretilir; her yeni martı aynı tamponları paylaşır (bellek sızmasın)
const gullGeoCache = {};
function gullGeos(rival) {
  if (gullGeoCache[rival]) return gullGeoCache[rival];
  const C = rival
    ? { body: 0x6f7682, head: 0x5d6470, wing: 0x474d58, tip: 0x15161a, beak: 0xd9862a, eye: 0xff4a3a }
    : { body: 0xfbfaf6, head: 0xffffff, wing: 0xaab4c0, tip: 0x1b1c22, beak: 0xf4b52a, eye: 0x111111 };
  const k = new Kit();
  // gövde: ileri (−z) doğru incelen damla
  k.add(new THREE.SphereGeometry(0.42, 9, 7), C.body, 0, 0, 0, 0, 0, 0, 0.95, 0.82, 1.85);
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
  const armGeo = new Kit().add(wingShape(0.72, 0.62, 1.15, 0.08), C.wing).build();
  const handKit = new Kit().add(wingShape(0.62, 0.3, 0.95, 0.22), C.wing).add(featherTip(0.7, 0.32), C.tip, 0.82, 0, 0.18);
  // uçtaki beyaz benekler
  handKit.add(new THREE.SphereGeometry(0.05, 4, 3), 0xffffff, 1.25, 0.03, 0.42, 0, 0, 0, 1, 0.4, 1);
  const handGeo = handKit.build();
  return (gullGeoCache[rival] = { bodyGeo, armGeo, handGeo });
}
export function makeGull(rival = false) {
  const { bodyGeo, armGeo, handGeo } = gullGeos(rival);
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
export const GEO = {
  simit: simitGeo(),
  bubble: new THREE.IcosahedronGeometry(0.85, 2),
  blob: new THREE.CircleGeometry(1, 20),
};
export const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xc77a00, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.3, flatShading: true });
export function makeSimit(gold = false) {
  const m = new THREE.Mesh(GEO.simit, gold ? goldMat : vcMat);
  m.castShadow = false;
  return m;
}

// ---------------- yolcu ----------------
// Değişkenler önceden birleştirilir: gömlek × elinde simit var/yok × saç × kızgın
const SHIRTS = [0x3a6ea5, 0xd9544f, 0x4f9d69, 0xe3b23c, 0x7d5ba6, 0x2f3b4c, 0xe07a5f, 0x5fa8d3, 0xf2efe6];
const SKINS = [0xe8b896, 0xd49b74, 0xb7785a];
const HAIRS = [0x2e211a, 0x5a3b26, 0x1a1a1a, 0xc9c3b8];
const personCache = new Map();
function personGeo(shirt, skin, hair, hold, angry, scarf) {
  const key = [shirt, skin, hair, hold, angry, scarf].join();
  if (personCache.has(key)) return personCache.get(key);
  const k = new Kit();
  const head = angry ? 0xe2584e : skin;
  k.add(new THREE.CylinderGeometry(0.11, 0.12, 0.8, 6), 0x262c3a, -0.12, 0.4, 0);
  k.add(new THREE.CylinderGeometry(0.11, 0.12, 0.8, 6), 0x262c3a, 0.12, 0.4, 0);
  k.add(new THREE.CylinderGeometry(0.25, 0.32, 0.95, 8), shirt, 0, 1.25, 0);
  k.add(new THREE.SphereGeometry(0.23, 9, 7), head, 0, 1.95, 0);
  if (hair >= 0) k.add(new THREE.SphereGeometry(0.245, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2.2), HAIRS[hair], 0, 1.99, 0.02);
  if (scarf) k.add(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 8), 0xc8352e, 0, 1.72, 0);
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 5), shirt, -0.34, 1.22, 0, 0, 0, 0.18);
  if (hold || angry) k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 5), shirt, 0.3, 2.0, 0, 0, 0, -0.12);
  else k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 5), shirt, 0.34, 1.22, 0, 0, 0, -0.18);
  const g = k.build();
  personCache.set(key, g);
  return g;
}
// sınırlı sayıda görünüm: önbellek en fazla 24 × 3 geometride doyar
const LOOKS = Array.from({ length: 24 }, (_, i) => ({ shirt: SHIRTS[i % SHIRTS.length], skin: pick(SKINS), hair: Math.random() < 0.8 ? (Math.random() * HAIRS.length) | 0 : -1, scarf: Math.random() < 0.15 }));
export function makePerson(hold) {
  const look = pick(LOOKS);
  const mesh = new THREE.Mesh(personGeo(look.shirt, look.skin, look.hair, hold, false, look.scarf), vcMat);
  mesh.castShadow = true;
  mesh.rotation.y = rand(-0.6, 0.6);
  let simit = null;
  if (hold) { simit = makeSimit(); simit.position.set(0.34, 2.56, 0); mesh.add(simit); }
  const angryGeo = () => personGeo(look.shirt, look.skin, look.hair, false, true, look.scarf);
  return { mesh, simit, angryGeo, calmGeo: mesh.geometry, angry: 0, ph: Math.random() * 6 };
}

// ---------------- vapur ----------------
export const DECK = 2.6;
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
];
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
    const m = new THREE.Mesh(costumeGeo(c.id), vcMat);
    m.castShadow = true; m.visible = false;
    gull.add(m); out[c.id] = m;
  }
  return out;
}
export const COSTUME_SVG = {
  fes: '<svg viewBox="0 0 48 48"><path d="M14 40l4-26h12l4 26z" fill="#c62a33"/><path d="M18 14h12l.6 4H17.4z" fill="#9e1b24"/><path d="M24 14q8-2 9 10" stroke="#1a1a1a" stroke-width="2" fill="none"/><path d="M31 23l4 9h-6z" fill="#1a1a1a"/><rect x="11" y="38" width="26" height="4" rx="2" fill="#7a141b"/></svg>',
  glasses: '<svg viewBox="0 0 48 48"><path d="M4 18h40" stroke="#14161c" stroke-width="3"/><rect x="5" y="17" width="16" height="13" rx="5" fill="#14161c"/><rect x="27" y="17" width="16" height="13" rx="5" fill="#14161c"/><path d="M8 20l5 0M30 20l5 0" stroke="#5d6b86" stroke-width="2" stroke-linecap="round"/></svg>',
  scarf: '<svg viewBox="0 0 48 48"><path d="M8 14q16 8 32 0v8q-16 8-32 0z" fill="#d23a33"/><path d="M15 18.5v8M24 20v8M33 18.5v8" stroke="#f6f0e4" stroke-width="3"/><path d="M28 24l6 18h-8l-3-16z" fill="#d23a33"/><path d="M26.6 31h6.4M27.8 36h6.6" stroke="#f6f0e4" stroke-width="3"/></svg>',
  captain: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="17" rx="19" ry="7" fill="#fff"/><path d="M9 18h30v9H9z" fill="#f6f4ee"/><rect x="9" y="25" width="30" height="6" fill="#1b2738"/><path d="M10 31q14 9 28 0z" fill="#111"/><path d="M24 19l3 3-3 3-3-3z" fill="#ffc23a"/></svg>',
  crown: '<svg viewBox="0 0 48 48"><path d="M8 36l-2-22 10 9 8-14 8 14 10-9-2 22z" fill="#f2b22c"/><rect x="8" y="34" width="32" height="6" rx="2" fill="#d99a1c"/><circle cx="24" cy="29" r="3.2" fill="#e5484d"/><circle cx="14" cy="30" r="2.2" fill="#3aa7ff"/><circle cx="34" cy="30" r="2.2" fill="#3aa7ff"/></svg>',
};
