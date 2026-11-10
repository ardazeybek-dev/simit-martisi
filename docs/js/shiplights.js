import * as THREE from 'three';
import { canvasTex } from './util.js';

// ---------------- gemi ışıkları ----------------
// Yer yer yanan pencereler, direk tepesinde beyaz, iskele kırmızı / sancak yeşil seyir feneri, yolcu gemisi bacasında yanıp sönen kırmızı.
// Hepsi tek Points (tek çizim çağrısı), gerçek ışık kaynağı yok. Işık yalnızca yağmurda yanar.
// Işık sisin içinden cisimlerden daha uzağa görünür (gerçekte de öyle).
const MAX = 900;
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
      gl_PointSize = max(px, uMinPx); vC = lcol * min(1.0, px / uMinPx * 0.6 + 0.4); // uzakta küçülen ışık kaybolmaz, yalnız söner
    }`,
  fragmentShader: `uniform sampler2D map; varying vec3 vC;
    void main() { float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC * a, smoothstep(0.35, 0.9, a) * min(0.9, max(vC.r, vC.g))); }`,
});
const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 4;

// tür: 0 pencere (sıcak, hafif kıpırtı, bazıları ağır ağır söner yanar), 1 beyaz direk/demir feneri, 2 kırmızı, 3 yeşil, 4 yanıp sönen kırmızı
const COL = [[1, 0.7, 0.34], [1, 0.96, 0.88], [1, 0.16, 0.1], [0.25, 1, 0.45], [1, 0.12, 0.08]];
const BASE = [1.7, 1.2, 1.2, 1.2, 1.3], SIZE = [1.5, 1.35, 1.05, 1.7, 1.7];
const WEATHER_K = { rain: 1 }; // yalnız yağmurda yanar: gündüz açık havada ışık olmaz

const ships = new Set();
const L = (x, y, z, k, size) => ({ x, y, z, k, s: (size || SIZE[k]), ph: Math.random() * 40, r: 0.6 + Math.random() * 0.8, lazy: k === 0 && Math.random() < 0.18 });
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
  }
  return a;
}

// gemiyi ışıklarıyla kaydet: obj sahneden çıkınca (parent yok) kendiliğinden düşer
export function addShipLights(obj, kind, o) { ships.add({ obj, lamps: lampsOf(kind, o) }); return obj; }
export function clearShipLights() { ships.clear(); }
export function initShipLights(scene) { scene.add(points); }

const _p = new THREE.Vector3(), _sz = new THREE.Vector2();
let time = 0;
const wob = (t, p) => 0.5 + 0.3 * Math.sin(t + p) + 0.2 * Math.sin(t * 1.93 + p * 2.1); // iki oranlı kıpırtı, düzgün sinüs değil
export function tickShipLights(dt, scene, camera, renderer, weather, gz) {
  time += dt;
  const k = WEATHER_K[weather] || 0, fog = scene.fog;
  if (!k) { points.visible = false; return; }
  const far = fog ? fog.far * 1.5 : 400, near = fog ? fog.near * 0.6 : 60;
  renderer.getDrawingBufferSize(_sz); mat.uniforms.uHalfH.value = _sz.y / 2; mat.uniforms.uMinPx.value = 2.2 * renderer.getPixelRatio();
  const cam = camera.position;
  let n = 0;
  for (const sh of ships) {
    const o = sh.obj;
    if (!o.parent) { ships.delete(sh); continue; }
    if (!o.visible || n >= MAX) continue;
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements, sc = Math.hypot(e[0], e[1], e[2]);
    const dz = e[14] - gz; if (dz > 60 || dz < -far - 120) continue; // martının epey arkası ya da sisin çok ötesi
    for (const l of sh.lamps) {
      if (n >= MAX) break;
      _p.set(l.x, l.y, l.z).applyMatrix4(o.matrixWorld);
      const d = _p.distanceTo(cam), f = Math.min(1, Math.max(0, (far - d) / (far - near)));
      if (f <= 0) continue;
      const tt = time * l.r;
      let v;
      if (l.k === 0) { v = 0.72 + 0.28 * wob(tt * 1.1, l.ph); if (l.lazy) v *= Math.min(1, Math.max(0, 0.5 + 1.6 * (Math.sin(tt * 0.21 + l.ph) + 0.45 * Math.sin(tt * 0.13 + l.ph * 3)))); }
      else if (l.k === 4) { const c = (time / (1.5 + 0.5 * (l.r - 1)) + l.ph) % 1; v = c < 0.1 ? 1 : c < 0.2 ? 1 - (c - 0.1) * 9 : 0.1; }
      else v = 0.88 + 0.12 * wob(tt * 2.6, l.ph);
      const c = COL[l.k], w = v * BASE[l.k] * k * f;
      pos[n * 3] = _p.x; pos[n * 3 + 1] = _p.y; pos[n * 3 + 2] = _p.z;
      col[n * 3] = c[0] * w; col[n * 3 + 1] = c[1] * w; col[n * 3 + 2] = c[2] * w;
      siz[n] = l.s * sc * (0.8 + 0.4 * k); n++;
    }
  }
  geo.setDrawRange(0, n); points.visible = n > 0;
  if (!n) return;
  for (const name of ['position', 'lcol', 'lsize']) { const at = geo.attributes[name]; at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
}
