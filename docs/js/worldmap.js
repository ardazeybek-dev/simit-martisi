// ---------------- dünya haritası ----------------
// Şehir seçme ekranı: denizde yüzen adalar, her şehir kendi minyatür dioramasıyla. Kendi sahnesi ve kamerası var ama oyunun tek renderer'ını
// paylaşır (kostüm podyumu gibi): main.js döngüsü harita açıkken dünya yerine mapDraw çağırır.
// Kamera: hedef noktaya (tx, tz) sabit eğimle bakar, uzaklık d. Tek parmak kaydırır, iki parmak / tekerlek yakınlaştırır; bırakınca kayma söner.
// Ayar: D_MIN / D_MAX (yakınlaşma sınırı), PITCH (bakış eğimi), BOUNDS (kaydırma sınırı, adalar büyüdükçe genişler).
import * as THREE from 'three';
import { BEND, BEND2, LEVEL, LAMP_N } from './scene.js';
import { Kit, vcMat } from './util.js';
import { makeGull, flapGull } from './models.js';
import { DIORAMA, fit, islandDecor } from './mapsets.js';

const D_MIN = 11, D_MAX = 95, D_HOME = 25, PITCH = 0.98; // ~56° yukarıdan
const BOUNDS = { x0: -16, x1: 16, z0: -24, z1: 20 };
const SEA = 0x3aa7d6, SKY = 0x7fd0ee;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 170);
const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
cam.layers.enable(1); // toplu çizime alınmış model parçaları (models.js syncBatches) burada tek tek çizilir
scene.add(new THREE.HemisphereLight(0xffffff, 0x88aacc, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(10, 22, 9); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0015;
scene.add(sun, sun.target);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: SEA }));
sea.rotation.x = -Math.PI / 2; sea.receiveShadow = true; scene.add(sea);

export const map = { scene, cam, on: false, tx: 0, tz: 0.4, d: D_HOME, vx: 0, vz: 0, pickables: [], onTap: null, onTick: null };

// ---- kamera ----
function clampView() {
  // uzaklaştıkça kaydırma sınırı daralır: dünya ekrana sığınca ortada kalsın
  const k = THREE.MathUtils.clamp((map.d - D_MIN) / (D_MAX - D_MIN), 0, 1), sx = 1 - k * 0.8, sz = 1 - k * 0.6;
  map.tx = THREE.MathUtils.clamp(map.tx, BOUNDS.x0 * sx, BOUNDS.x1 * sx);
  map.tz = THREE.MathUtils.clamp(map.tz, BOUNDS.z0 * sz, BOUNDS.z1 * sz);
  map.d = THREE.MathUtils.clamp(map.d, D_MIN, D_MAX);
}
function placeCam(w, h) {
  cam.aspect = w / h;
  cam.fov = w < h ? 40 : 34;
  cam.position.set(map.tx, map.d * Math.sin(PITCH), map.tz + map.d * Math.cos(PITCH));
  cam.lookAt(map.tx, 0, map.tz);
  cam.updateProjectionMatrix();
}
const worldPerPx = h => (2 * map.d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / h; // ekranın ortasında bir pikselin dünyadaki boyu

export function mapHome() { map.tx = 0; map.tz = 0.4; map.d = D_HOME; map.vx = map.vz = 0; }
export function mapFocus(x, z, d) { map.tx = x; map.tz = z; if (d) map.d = d; map.vx = map.vz = 0; clampView(); }

// ---- dokunma ----
const ptrs = new Map(); // pointerId → {x, y}
let pinch0 = 0, d0 = 0, mid0 = null, tap = null;
function pt(e) { return { x: e.clientX, y: e.clientY }; }
function midOf() { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) }; }
function pan(dx, dy) { const k = worldPerPx(innerHeight); map.tx -= dx * k; map.tz -= dy * k / Math.sin(PITCH); clampView(); }
function zoomAt(f, sx, sy) {
  // yakınlaşma parmağın altındaki noktaya doğru: o nokta ekranda yerinde kalır (yaklaşık)
  const before = map.d; map.d = THREE.MathUtils.clamp(map.d * f, D_MIN, D_MAX); const r = 1 - map.d / before;
  const k = worldPerPx(innerHeight) * (before / map.d);
  map.tx += (sx - innerWidth / 2) * k * r; map.tz += (sy - innerHeight / 2) * k * r / Math.sin(PITCH);
  clampView();
}
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function pickAt(x, y) {
  _ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, cam); _ray.layers.enableAll();
  const hit = _ray.intersectObjects(map.pickables, true)[0];
  if (!hit) return null;
  let o = hit.object; while (o && o.userData.pick === undefined) o = o.parent;
  return o ? o.userData.pick : null;
}
export function bindMapInput(el, isUi) {
  el.addEventListener('pointerdown', e => {
    if (!map.on || isUi(e)) return;
    ptrs.set(e.pointerId, pt(e)); try { el.setPointerCapture(e.pointerId); } catch (_) {}
    map.vx = map.vz = 0;
    if (ptrs.size === 1) tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    else { tap = null; const m = midOf(); pinch0 = m.dist; d0 = map.d; mid0 = m; }
  });
  el.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const nx = e.clientX, ny = e.clientY;
    if (ptrs.size === 1) {
      const dx = nx - p.x, dy = ny - p.y; pan(dx, dy);
      const k = worldPerPx(innerHeight); map.vx = -dx * k * 60; map.vz = -dy * k / Math.sin(PITCH) * 60; // savrulma için hız (≈60 kare/sn)
      if (tap && Math.hypot(nx - tap.x, ny - tap.y) > 9) tap = null;
    }
    p.x = nx; p.y = ny;
    if (ptrs.size === 2) {
      const m = midOf();
      if (pinch0 > 0 && m.dist > 0) { const want = d0 * pinch0 / m.dist; zoomAt(want / map.d, m.x, m.y); }
      pan(m.x - mid0.x, m.y - mid0.y); mid0 = m;
    }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (tap && tap.id === e.pointerId && e.type === 'pointerup' && performance.now() - tap.t < 450) {
      const id = pickAt(e.clientX, e.clientY); map.vx = map.vz = 0;
      if (map.onTap) map.onTap(id);
    }
    tap = null;
    if (ptrs.size < 2) { mid0 = null; pinch0 = 0; }
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { if (!map.on) return; e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
}
export function mapZoom(f) { zoomAt(f, innerWidth / 2, innerHeight / 2); }

// ---- çizim ----
// Oyunun malzemeleri viraj bükmesi ve fener ışıkları için ortak uniform'lar taşır (scene.js): harita çizilirken bunlar nötr olur, sonra geri konur.
const _b = new THREE.Vector4(), _b2 = new THREE.Vector4(), _lv = new THREE.Matrix3(), _id3 = new THREE.Matrix3();
export function mapDraw(renderer, dt, t) {
  if (!ptrs.size && (map.vx || map.vz)) { // savrulma
    map.tx += map.vx * dt; map.tz += map.vz * dt; clampView();
    const f = Math.exp(-5 * dt); map.vx *= f; map.vz *= f; if (Math.abs(map.vx) + Math.abs(map.vz) < 0.01) map.vx = map.vz = 0;
  }
  const w = innerWidth, h = innerHeight;
  placeCam(w, h);
  sun.position.set(map.tx + 10, 22, map.tz + 9); sun.target.position.set(map.tx, 0, map.tz); sun.target.updateMatrixWorld();
  tickCities(dt, t);
  if (map.onTick) map.onTick(dt, t);
  _b.copy(BEND.value); _b2.copy(BEND2.value); _lv.copy(LEVEL.value);
  BEND.value.x = 0; BEND2.value.x = 0; LEVEL.value.copy(_id3);
  const ln = LAMP_N.value; LAMP_N.value = 0; // gece fenerlerinin ışığı haritaya düşmesin
  renderer.render(scene, cam);
  BEND.value.copy(_b); BEND2.value.copy(_b2); LEVEL.value.copy(_lv); LAMP_N.value = ln;
}
// dünya → ekran (etiketler için)
const _p = new THREE.Vector3();
export function mapToScreen(v) { _p.copy(v).project(cam); return { x: (_p.x + 1) / 2 * innerWidth, y: (1 - _p.y) / 2 * innerHeight, back: _p.z > 1 }; }

// ---- adalar ----
const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
function islandGeo(pts, depth) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.35, bevelSegments: 3, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); return g;
}
// köpük halkası + kum + çimen; pts: ada sınırı (x, -z), ox/oz: adanın yeri
export function addIsland(pts, ox, oz, grass = 0x7cc95a) {
  const g = new THREE.Group(); g.position.set(ox, 0, oz);
  const foam = new THREE.Mesh(islandGeo(pts.map(([x, y]) => [x * 1.08, y * 1.06]), 0.05), lam(0xe8f7ff)); foam.position.y = 0.02;
  const sand = new THREE.Mesh(islandGeo(pts, 0.35), lam(0xf2d79a)); sand.castShadow = sand.receiveShadow = true;
  const top = new THREE.Mesh(islandGeo(pts.map(([x, y]) => [x * 0.9, y * 0.92]), 0.55), lam(grass)); top.position.y = 0.15; top.receiveShadow = true;
  g.add(foam, sand, top); scene.add(g);
  return g;
}
export const GROUND_Y = 0.72; // çimenin üstü
export const TR_SHAPE = [[-1.2, -6.0], [1.6, -5.8], [3.4, -4.6], [3.9, -2.4], [3.6, 0.0], [3.9, 2.2], [3.2, 4.4], [1.2, 5.8], [-1.4, 5.9], [-3.3, 4.6], [-3.6, 2.4], [-3.9, 0.2], [-3.5, -2.2], [-3.6, -4.4]];
addIsland(TR_SHAPE, 0, 0);

// ---- şehirler ----
// Türkiye adasında şehirlerin yeri (açılış sırasıyla aşağıdan yukarı kıvrılan yol): [x, z]
export const CITY_POS = { istanbul: [-2.0, 4.2], izmir: [1.9, 3.2], antalya: [-1.9, 1.5], mugla: [2.2, 0.3], canakkale: [-1.7, -1.1], trabzon: [1.9, -2.5], samsun: [-0.4, -4.1] };
const PAD_R = 0.82;
const padGeo = (() => { const k = new Kit(); k.add(new THREE.CylinderGeometry(PAD_R, PAD_R * 1.06, 0.14, 28), 0xfff1c9, 0, 0.07, 0); k.add(new THREE.CylinderGeometry(PAD_R * 1.07, PAD_R * 1.1, 0.06, 28), 0xd9b98a, 0, 0.0, 0); return k.build(); })();
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
export const cities = []; // { id, g, pos, label, tick }
let labelsEl = null;
export function buildCities(list, el) {
  labelsEl = el;
  for (const c of list) {
    const p = CITY_POS[c.id]; if (!p || !DIORAMA[c.id]) continue;
    const { g: model, h } = DIORAMA[c.id](), d = fit(model, h);
    const root = new THREE.Group(); root.position.set(p[0], GROUND_Y, p[1]);
    const pad = new THREE.Mesh(padGeo, vcMat); pad.receiveShadow = true; root.add(pad);
    d.position.y = 0.14; root.add(d);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R * 1.15, PAD_R * 1.15, h + 0.4, 10), hitMat); hit.position.y = (h + 0.4) / 2; root.add(hit);
    root.userData.pick = c.id; scene.add(root); map.pickables.push(root);
    const label = document.createElement('div'); label.className = 'map-lbl'; label.textContent = c.name; el.appendChild(label);
    cities.push({ id: c.id, g: root, pos: new THREE.Vector3(p[0], GROUND_Y + 0.1, p[1] + PAD_R * 0.95), label, tick: model.userData.tick || null });
  }
  scene.add(islandDecor(3.4, 5.4, Object.values(CITY_POS).map(([x, z]) => [x, z, PAD_R + 0.15])));
}
// martı adanın üstünde tur atar
const gull = makeGull(); { const b = new THREE.Box3().setFromObject(gull), s = new THREE.Vector3(); b.getSize(s); gull.scale.multiplyScalar(0.7 / Math.max(s.x, s.z)); } scene.add(gull);
gull.traverse(o => { if (o.isMesh) o.castShadow = true; });
function tickCities(dt, t) {
  for (const c of cities) if (c.tick) c.tick(dt, t);
  const a = t * 0.32; gull.position.set(Math.sin(a) * 3.1, 3.2 + Math.sin(t * 0.9) * 0.25, Math.cos(a) * 4.6); gull.rotation.set(0, a + Math.PI, -0.35); flapGull(gull, t * 1.4, 0.6, 0.4);
  const far = map.d > 42;
  for (const c of cities) {
    const s = mapToScreen(c.pos), off = far || s.back || s.x < -60 || s.x > innerWidth + 60 || s.y < -30 || s.y > innerHeight + 30;
    c.label.style.display = off ? 'none' : '';
    if (!off) c.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -30%)`;
  }
}
