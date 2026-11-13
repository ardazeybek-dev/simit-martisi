import * as THREE from 'three';
import { canvasTex } from './util.js';
import { LAMPS, LAMP_N, LAMP_C } from './scene.js';

// ---------------- gemi ışıkları ----------------
// Yer yer yanan pencereler, direk tepesinde beyaz, iskele kırmızı / sancak yeşil seyir feneri, yolcu gemisi bacasında yanıp sönen kırmızı.
// Hepsi tek Points (tek çizim çağrısı), gerçek ışık kaynağı yok. Işık yalnızca yağmurda yanar.
// Işık sisin içinden cisimlerden daha uzağa görünür (gerçekte de öyle).
const MAX = 1600;
const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), siz = new Float32Array(MAX);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('lcol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('lsize', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage));
const mat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: true, // fog: sahnenin viraj bükmesi (project_vertex) sisli malzemelere uygulanıyor; ışık gemiyle birlikte bükülsün
  // çekirdek zemini biraz örter (açık gökte de seçilsin), hale eklenir
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  uniforms: {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uHalfH: { value: 400 }, uMinPx: { value: 2.5 },
    map: { value: canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.24, 'rgba(255,255,255,.92)'); r.addColorStop(0.5, 'rgba(255,255,255,.3)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }) },
  },
  vertexShader: `attribute vec3 lcol; attribute float lsize; uniform float uHalfH, uMinPx; varying vec3 vC;
    #include <fog_pars_vertex>
    void main() {
      vec3 transformed = position;
      #include <project_vertex>
      float px = lsize * projectionMatrix[1][1] * uHalfH / max(-mvPosition.z, 0.5);
      gl_PointSize = clamp(px, uMinPx, uHalfH * 0.3); vC = lcol * min(1.0, px / uMinPx * 0.6 + 0.4); // uzakta küçülen ışık kaybolmaz, yalnız söner
    }`,
  fragmentShader: `uniform sampler2D map; varying vec3 vC;
    void main() { float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC * a, smoothstep(0.35, 0.9, a) * min(0.9, max(vC.r, vC.g))); }`,
});
const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 4;

// tür: 0 pencere (sıcak, hafif kıpırtı, bazıları ağır ağır söner yanar), 1 beyaz direk/demir feneri, 2 kırmızı, 3 yeşil, 4 yanıp sönen kırmızı, 5 korkuluk LED'i,
// 6 gaz feneri (turuncu, alev gibi titrer), 7 renkli LED (rengi lambada: l.c; sırayla koşar), 8 deniz feneri (çift çakar)
const COL = [[1, 0.7, 0.34], [1, 0.96, 0.88], [1, 0.16, 0.1], [0.25, 1, 0.45], [1, 0.12, 0.08], [1, 0.84, 0.55], [1, 0.58, 0.2], [1, 1, 1], [1, 0.95, 0.75]];
const BASE = [1.7, 1.2, 1.2, 1.2, 1.3, 1.25, 1.6, 1.1, 1.6], SIZE = [1.5, 1.35, 1.05, 1.7, 1.7, 0.42, 1.15, 0.6, 3.2]; // uçurtma LED'i (7) kısık ve küçük: uçurtmanın biçimi seçilsin
const LED = [[1, 0.25, 0.6], [0.2, 0.9, 1], [1, 0.85, 0.15], [0.35, 1, 0.35]];
const WEATHER_K = { rain: 1 }; // yalnız yağmurda yanar: gündüz açık havada ışık olmaz
const LED_K = { rain: 1, fog: 0.9, snow: 0.8 }; // uçurtma LED'i siste de yanar: engel puslu havada seçilsin

const ships = new Set();
const L = (x, y, z, k, size) => ({ x, y, z, k, s: (size || SIZE[k]), ph: Math.random() * 40, r: 0.6 + Math.random() * 0.8, lazy: k === 0 && Math.random() < 0.18 });
// LED: i sıradaki yeri (koşan ışık), ref: konumu her kare bu çocuktan alınır (sallanan uçurtma kuyruğu)
const D = (x, y, z, i, ref) => Object.assign(L(x, y, z, 7), { i, c: LED[i % LED.length], ref });
// pencere sırası: z0..z1 arası adım adım, her yuvada p olasılıkla yanar (tamamı değil)
function row(out, x, y, z0, z1, step, p) { for (let z = z0; z <= z1; z += step) if (Math.random() < p) out.push(L(x, y, z, 0)); }
// seyir fenerleri: pruva yönü bow (-1: -z, +1: +z). Pruvaya bakana göre sol iskele (kırmızı), sağ sancak (yeşil)
function nav(out, hx, y, z, bow) { out.push(L(bow < 0 ? -hx : hx, y, z, 2), L(bow < 0 ? hx : -hx, y, z, 3)); }

function lampsOf(kind, o = {}) {
  const a = [];
  if (kind === 'fishing') {
    a.push(L(0, 2.2, 1.3, 1, 0.9)); nav(a, 1.55, 0.95, -2.6, -1);
    for (const s of [-1, 1]) if (Math.random() < 0.7) a.push(L(s * 0.9, 1.25, 1.3, 0));
  } else if (kind === 'sail') {
    a.push(L(0, 8.65, -0.6, 1, 1)); nav(a, 1.2, 0.75, -2.3, -1);
    for (const s of [-1, 1]) row(a, s * 0.68, 0.95, 0.2, 1.0, 0.8, 0.5);
  } else if (kind === 'yacht') {
    a.push(L(0, 3.7, 1.2, 1, 1)); nav(a, 1.6, 0.85, -2.4, -1);
    for (const s of [-1, 1]) { row(a, s * 1.08, 1.3, -0.6, 1.8, 0.8, 0.6); row(a, s * 0.85, 2.05, 0.5, 1.3, 0.8, 0.6); }
  } else if (kind === 'cruise') {
    const top = 18.6;
    for (let i = 0; i < 5; i++) {
      const hw = (13 - i * 0.6) / 2 + 0.1, len = 74 - i * 8, z = 6 + i * 2.5;
      for (const s of [-1, 1]) row(a, s * hw, 7.6 + i * 2.2 + 1.25, z - len / 2 + 1.5, z + len / 2 - 1.5, 3.2, 0.32);
    }
    for (const s of [-1, 1]) row(a, s * 7.15, 3.3, -38, 42, 2.6, 0.22); // gövde lombozları
    a.push(L(0, top + 3.4, -14, 1, 1.8)); nav(a, 4.7, top + 1, -19, -1);
    for (const zf of [16, 28]) a.push(L(0, top + 6.6, zf, 4));
  } else if (kind === 'cargo') { // pruva +z, köprüüstü kıçta (-18)
    for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) if (Math.random() < 0.6) a.push(L(x, 9.2, -15.4, 0));
    for (const s of [-1, 1]) { row(a, s * 3.6, 9.2, -19.5, -16.5, 1.5, 0.5); row(a, s * 3.6, 7, -19.5, -16.5, 1.5, 0.3); }
    a.push(L(0, 14.1, -16.5, 1, 1.6), L(0, 4.6, 22, 1, 1.4)); nav(a, 4.35, 10.2, -16.6, 1);
  } else if (kind === 'tanker') { // pruva +z
    for (const y of [5.6, 7.6, 9.6]) {
      for (const x of [-3, -1.5, 0, 1.5, 3]) if (Math.random() < 0.45) a.push(L(x, y, 20.4, 0));
      for (const s of [-1, 1]) row(a, s * 4.05, y, 22, 26, 2, 0.35);
    }
    a.push(L(0, 15.1, 17, 1, 1.6), L(0, 9.7, -27, 1, 1.4)); nav(a, 5.4, 10.8, 16.4, 1);
  } else if (kind === 'ferry') { // pruva -z
    const len = o.L || 50, ys = o.type === 'buyuk' ? [1.07, 1.62] : o.type === 'motor' ? [1.55] : [1.5];
    for (const y of ys) for (const s of [-1, 1]) row(a, s * 4.07, y, -len / 2 + 9, len / 2 - 8, 3.2, 0.45);
    nav(a, 4.1, 2.45, -len / 2 + 4, -1); a.push(L(0, 2.5, len / 2 + 1.4, 1, 1));
    if (o.mast) a.push(L(o.mast[0], o.mast[1], o.mast[2], 1, 1.3));
    for (const s of [-1, 1]) for (let z = -len / 2 + 5; z < len / 2 - 4; z += 1.1) a.push(L(s * 3.85, DECK_Y + 0.8, z, 5)); // korkuluk boyunca LED dizisi
  } else if (kind === 'simitboat') { // pruvada gaz feneri: yağmurda simidin nereden atılacağı uzaktan seçilir
    a.push(L(0, 1.3, -1.95, 6), L(0, 0.95, 1.85, 6, 0.7));
  } else if (kind === 'kite') { // köşelerde dört kısık LED (sırayla yanar); uçurtmanın kendisi de kötü havada parlar (models.js setKiteGlow)
    const e = [[0, 1.05], [0.75, 0.2], [0, -1.2], [-0.75, 0.2]]; // yalnız dört köşe: kenar boyu LED dizisi uçurtmanın biçimini örtüyordu
    e.forEach(([x, y], i) => a.push(D(x, y, 0.06, i * 3)));
  } else if (kind === 'bridge') { // tabliye fenerleri, alt kat lokanta pencereleri, köprü altında koridoru aydınlatan lambalar
    for (const s of [-1, 1]) {
      for (let x = -44; x <= 44; x += 11) a.push(L(x, 16.3, s * 2.6, 1, 1.25));
      for (const sx of [-1, 1]) for (let x = 10.6; x < 47.5; x += 2.3) if (Math.random() < 0.75) a.push(L(sx * x, 10.7, s * 2.38, 0, 1.2));
      for (let x = -7.5; x <= 7.6; x += 3) a.push(L(x, 11.75, s * 2.1, 6, 0.8));
    }
  } else if (kind === 'pier') { // iskele binası (koridora bakan yüz -x): pencereler, saçakta fenerler, iskele ucunda beyaz, saat kadranı
    for (let z = -6; z <= 6; z += 2) { if (Math.random() < 0.7) a.push(L(-3.62, 5, z, 0, 1.3)); if (Math.abs(z) > 1 && Math.random() < 0.6) a.push(L(-3.62, 2.3, z, 0, 1.3)); }
    for (const z of [-5, 0, 5]) a.push(L(-8.4, 3.95, z, 6));
    for (const z of [-5.8, 5.8]) a.push(L(-9.1, 1.6, z, 1, 1));
    a.push(L(-2.56, 10.3, 0, 1, 1.4));
  } else if (kind === 'lighthouse') {
    a.push(L(0, 13, 0, 8));
  } else if (kind === 'pirate') { // korsan gemisi (pruva -z): kıç köşkü feneri, köşk pencereleri, seyir fenerleri, direk tepesinde beyaz
    a.push(L(0, 6.45, 6.3, 6, 1.6), L(0, 11.3, -4.5, 1, 1.2)); nav(a, 1.75, 1.9, -5.5, -1);
    for (const s of [-1, 1]) for (const z of [4.6, 5.9]) a.push(L(s * 1.6, 3.6, z, 0, 1.2));
    for (const s of [-1, 1]) for (let z = -5; z <= 3.5; z += 1.7) a.push(L(s * 1.62, 1.75, z, 6, 0.75)); // küpeşte fenerleri
  } else if (kind === 'gate') { // durak kapısının sarı topları
    for (const s of [-1, 1]) a.push(L(s * 8.6, 14.8, 0, 6, 1.4));
  }
  return a;
}

// gemiyi ışıklarıyla kaydet: obj sahneden çıkınca (parent yok) kendiliğinden düşer
// vapur güvertesi: tickLamps'ın aydınlattığı noktalar (güverte ortası boyunca, yolcuların başının üstünde)
const DECK_Y = 2.6; // models.js DECK
function litOf(kind, o = {}) {
  if (kind === 'simitboat') return [new THREE.Vector3(0, 1.6, -1.4)]; // simitçi ve tablası
  if (kind === 'bridge') return [-5, 0, 5].map(x => new THREE.Vector3(x, 10.6, 0)); // köprü altı: martı ışığın altından geçer
  if (kind !== 'ferry') return null;
  const len = o.L || 50, a = []; for (let z = -len / 2 + 7; z <= len / 2 - 6; z += 10) a.push(new THREE.Vector3(0, DECK_Y + 2, z)); return a;
}
// ext: lambaların gemi merkezinden en uzak yatay uzaklığı (gemi tamamen geçti mi?)
export function addShipLights(obj, kind, o) { const lamps = lampsOf(kind, o); ships.add({ obj, kind, lamps, lit: litOf(kind, o), ext: lamps.reduce((m, l) => Math.max(m, Math.hypot(l.x, l.z)), 0) + 2 }); return obj; }
export function clearShipLights() { ships.clear(); }
// test: kayıtlı ışıklı nesneler (tür, dünya konumu, görünür mü, park mı)
export function shipLightsInfo() { return [...ships].map(sh => { const e = worldOf(sh.obj, _m).elements; return { kind: sh.kind, x: +e[12].toFixed(1), z: +e[14].toFixed(1), hidden: hidden(sh.obj), park: !!rootOf(sh.obj).userData.park, n: sh.lamps.length }; }); }
export function initShipLights(scene) { scene.add(points); }

const _p = new THREE.Vector3(), _sz = new THREE.Vector2(), _m = new THREE.Matrix4();
// sahnenin en üstteki atası: main.js parkFar sisin ötesini ve kameranın arkasını gizler (visible=false, matris dondurulur)
function rootOf(o) { while (o.parent && !o.parent.isScene) o = o.parent; return o; } // sahneden ayrılmış ağaçta kökün parent'ı yok
// park edilen nesnenin matrisi donuk kalır: dünya matrisini konumdan her kare kendimiz kurarız (gemi sisin içinden yaklaşırken ışığı ondan önce görünür)
function worldOf(o, m) {
  if (o.matrixAutoUpdate) o.updateMatrix(); m.copy(o.matrix);
  for (let p = o.parent; p; p = p.parent) { if (p.matrixAutoUpdate) p.updateMatrix(); m.premultiply(p.matrix); }
  return m;
}
// görünmez mi: kendisi ya da bir atası gizli; park yüzünden gizlenmiş kök sayılmaz (ışık sisin içinden görünür)
function hidden(o) { for (let p = o; p && !p.isScene; p = p.parent) if (!p.visible && !(p.userData.park && p.parent && p.parent.isScene)) return true; return false; }
let time = 0;
const wob = (t, p) => 0.5 + 0.3 * Math.sin(t + p) + 0.2 * Math.sin(t * 1.93 + p * 2.1); // iki oranlı kıpırtı, düzgün sinüs değil
export function tickShipLights(dt, scene, camera, renderer, weather, gz) {
  time += dt;
  const k = WEATHER_K[weather] || 0, kLed = LED_K[weather] || 0, fog = scene.fog;
  if (!k && !kLed) { points.visible = false; for (const sh of ships) if (!rootOf(sh.obj).parent) ships.delete(sh); return; } // yağmursuz havada da sahneden çıkan gemi kayıttan düşsün (sızıntı)
  const far = fog ? fog.far * 1.8 : 400, near = fog ? fog.far : 260; // gemi üretildiği an (~280 m) ışığı görünür, sisin sınırında tam parlak (eskiden 18 m'de doluyordu)
  renderer.getDrawingBufferSize(_sz); mat.uniforms.uHalfH.value = _sz.y / 2; mat.uniforms.uMinPx.value = 2.2 * renderer.getPixelRatio();
  const cam = camera.position;
  let n = 0;
  for (const sh of ships) {
    const o = sh.obj;
    if (!rootOf(o).parent) { ships.delete(sh); continue; } // iç içe nesne (iskele binası): kökü sahneden çıktıysa
    if (n >= MAX || hidden(o)) continue;
    const e = worldOf(o, _m).elements, sc = Math.hypot(e[0], e[1], e[2]);
    const dz = e[14] - gz; if (dz - sh.ext * sc > cam.z - gz + 2 || dz < -far - 120) continue; // gemi tamamen kameranın arkasına geçti ya da sisin çok ötesinde
    for (const l of sh.lamps) {
      if (n >= MAX) break;
      if (l.ref) _p.copy(l.ref.position).applyMatrix4(_m); else _p.set(l.x, l.y, l.z).applyMatrix4(_m);
      const kk = l.k === 7 ? kLed : k; if (!kk) continue;
      // kameraya çok yaklaşan lamba (gemiden ayrılırken yanından geçenler) koca bir leke olup birden sönmesin: yaklaştıkça yumuşakça söner
      const nf = Math.min(1, Math.max(0, (cam.z - _p.z - 1) / 5)); // martıyı geçtikten sonra da ~7 m yanık kalır if (nf <= 0) continue;
      const d = _p.distanceTo(cam), f = Math.min(1, Math.max(0, (far - d) / (far - near)));
      if (f <= 0) continue;
      const tt = time * l.r;
      let v;
      if (l.k === 0) { v = 0.72 + 0.28 * wob(tt * 1.1, l.ph); if (l.lazy) v *= Math.min(1, Math.max(0, 0.5 + 1.6 * (Math.sin(tt * 0.21 + l.ph) + 0.45 * Math.sin(tt * 0.13 + l.ph * 3)))); }
      else if (l.k === 4) { const c = (time / (1.5 + 0.5 * (l.r - 1)) + l.ph) % 1; v = c < 0.1 ? 1 : c < 0.2 ? 1 - (c - 0.1) * 9 : 0.1; }
      else if (l.k === 6) v = 0.7 + 0.3 * wob(tt * 7.3, l.ph) * (0.75 + 0.25 * wob(tt * 13.1, l.ph * 1.7)); // alev: hızlı ve düzensiz
      else if (l.k === 7) { const c = ((time * 6 - l.i) % 13 + 13) % 13; v = 0.35 + 0.65 * Math.max(0, 1 - c / 3); } // koşan ışık: başta parlak, ardında söner
      else if (l.k === 8) { const c = (time / 4.2 + l.ph) % 1; v = c < 0.06 || (c > 0.14 && c < 0.2) ? 1 : 0.18; } // çift çakar
      else v = 0.88 + 0.12 * wob(tt * 2.6, l.ph);
      const c = l.c || COL[l.k], w = v * BASE[l.k] * kk * f * nf;
      pos[n * 3] = _p.x; pos[n * 3 + 1] = _p.y; pos[n * 3 + 2] = _p.z;
      col[n * 3] = c[0] * w; col[n * 3 + 1] = c[1] * w; col[n * 3 + 2] = c[2] * w;
      siz[n] = l.s * sc * (0.8 + 0.4 * kk) * (0.4 + 0.6 * nf); n++;
    }
  }
  geo.setDrawRange(0, n); points.visible = n > 0;
  if (!n) return;
  for (const name of ['position', 'lcol', 'lsize']) { const at = geo.attributes[name]; at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
}

// güverte lambaları: martıya en yakın 8 nokta göz uzayına çevrilip shader'a gider (scene.js LAMPS). Kamera bu karenin yerine
// oturduktan sonra, çizimden hemen önce çağrılır; yoksa hızlı uçuşta ışık gemiden bir kare geride kalır.
// Her noktanın kendi açılıp sönmesi var (p.lf): gemi ~150 m'den yumuşakça yanar, martı geçtikten sonra ~60 m daha yanık kalır;
// listeye girip çıkan nokta (simitçi teknesi yer kaptı) bir anda sönmez/patlamaz, ışık çapı ağır ağır büyüyüp küçülür.
const LAMP_SLOTS = 8, LAMP_R = 10, LAMP_IN = [-150, -85], LAMP_OUT = [22, 60];
const _l = new THREE.Vector3(), cand = [], live = new Set();
const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
let lampK = 0;
export function tickLamps(dt, camera, weather, g) {
  lampK += ((WEATHER_K[weather] || 0) - lampK) * Math.min(1, dt * 2);
  if (lampK < 0.01) { LAMP_N.value = 0; for (const p of live) p.lf = 0; live.clear(); return; }
  cand.length = 0;
  for (const sh of ships) {
    const o = sh.obj; if (!sh.lit || !rootOf(o).parent) continue;
    const park = rootOf(o).userData.park || hidden(o); // sisin ötesinde gizli gemi: ışığı yanmaz, sisten çıkınca yumuşakça yanar
    const e = worldOf(o, _m).elements, dz = e[14] - g.z; if (dz > LAMP_OUT[1] + 40 || dz < LAMP_IN[0] - 40) continue;
    for (const p of sh.lit) {
      _l.copy(p).applyMatrix4(_m);
      const pz = _l.z - g.z, want = park ? 0 : ramp(pz, LAMP_IN[0], LAMP_IN[1]) * (1 - ramp(pz, LAMP_OUT[0], LAMP_OUT[1]));
      if (want <= 0 && !(p.lf > 0.01)) continue;
      p.wx = _l.x; p.wy = _l.y; p.wz = _l.z; p.seen = true;
      cand.push({ p, d: _l.distanceToSquared(g), want, x: _l.x, y: _l.y, z: _l.z });
    }
  }
  // gemisi sahneden çıkan ya da listeden düşen nokta son yerinde söner (bir anda kararmaz)
  for (const p of live) if (!p.seen && p.lf > 0.002) cand.push({ p, d: _l.set(p.wx, p.wy, p.wz).distanceToSquared(g), want: 0, x: p.wx, y: p.wy, z: p.wz });
  // en yakın 8 nokta seçilir; seçilmeyenin hedefi 0 (yavaşça söner)
  cand.sort((a, b) => a.d - b.d);
  const k = Math.min(1, dt * 1.6), seen = new Set();
  camera.updateMatrixWorld();
  let n = 0;
  for (let i = 0; i < cand.length; i++) {
    const c = cand[i], p = c.p, tgt = i < LAMP_SLOTS ? c.want : 0;
    p.lf = (p.lf || 0) + (tgt - (p.lf || 0)) * k; p.seen = false; if (p.lf > 0.002) seen.add(p);
    if (n < LAMPS.value.length && p.lf > 0.002) { _l.set(c.x, c.y, c.z).applyMatrix4(camera.matrixWorldInverse); LAMPS.value[n++].set(_l.x, _l.y, _l.z, LAMP_R * p.lf); }
  }
  live.clear(); for (const p of seen) live.add(p);
  LAMP_N.value = n; LAMP_C.value.setRGB(1.0, 0.74, 0.44).multiplyScalar(1.6 * lampK);
}
