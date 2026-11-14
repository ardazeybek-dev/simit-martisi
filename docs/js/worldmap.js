// ---------------- dünya haritası ----------------
// Şehir seçme ekranı: denizde yüzen adalar, her şehir kendi minyatür dioramasıyla. Kendi sahnesi ve kamerası var ama oyunun tek renderer'ını
// paylaşır (kostüm podyumu gibi): main.js döngüsü harita açıkken dünya yerine mapDraw çağırır.
// Kamera: hedef noktaya (tx, tz) sabit eğimle bakar, uzaklık d. Tek parmak kaydırır, iki parmak / tekerlek yakınlaştırır; bırakınca kayma söner.
// Ayar: D_MIN / D_MAX (yakınlaşma sınırı), PITCH (bakış eğimi), BOUNDS (kaydırma sınırı, adalar büyüdükçe genişler).
import * as THREE from 'three';
import { BEND, BEND2, LEVEL, LAMP_N } from './scene.js';
import { Kit, vcMat } from './util.js';
import { makeGull, flapGull } from './models.js';
import { DIORAMA, fit, islandDecor, HILLS } from './mapsets.js';

const D_MIN = 11, D_MAX = 95, D_HOME = 25, PITCH = 1.1; // ~63° yukarıdan: uzun maketler üstteki şehrin etiketine binmesin
const BOUNDS = { x0: -22, x1: 22, z0: -26, z1: 24 }; // uzak adalar (FAR) da kaydırılarak görülebilsin
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

export function mapHome() { // yatay kısa ekranda kart sol altta: ada sağdaki boş alanın ortasına gelsin (kartın yarı genişliği kadar sola bakılır)
  const land = innerWidth > innerHeight && innerHeight <= 560;
  map.d = D_HOME; placeCam(innerWidth, innerHeight); map.tx = land ? -(290 + 14) / 2 * worldPerPx(innerHeight) : 0; map.tz = land ? 0.4 : 2.2; map.vx = map.vz = 0;
}
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
    if (ptrs.size === 1) tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), lbl: e.target.dataset && e.target.dataset.pick };
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
      const id = tap.lbl || pickAt(e.clientX, e.clientY); map.vx = map.vz = 0; // isim etiketine dokunmak da seçer
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
const trIsland = addIsland(TR_SHAPE, 0, 0);

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
    const label = document.createElement('div'); label.className = 'map-lbl'; label.textContent = c.name; label.dataset.pick = c.id; el.appendChild(label);
    cities.push({ id: c.id, g: root, model: d, h, pos: new THREE.Vector3(p[0], GROUND_Y + 0.1, p[1] + PAD_R * 0.95), label, tick: model.userData.tick || null });
  }
  const avoid = Object.values(CITY_POS).map(([x, z]) => [x, z, PAD_R + 0.15]);
  buildPath(avoid);
  scene.add(islandDecor(3.4, 5.4, avoid.concat(stones.map(s => [s.x, s.z, 0.1]))));
}
// seçili şehrin kaidesinde nabız gibi atan altın halka (uzun maketler ekranda komşusunun üstüne biner: işaret kaidede durur, karışmaz)
const ring = new THREE.Mesh(new THREE.TorusGeometry(PAD_R * 1.12, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffc93a }));
ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
let selC = null;
export function mapSelect(id) {
  selC = cities.find(c => c.id === id) || null; ring.visible = !!selC;
  for (const c of cities) c.label.classList.toggle('sel', c === selC);
  if (selC) selC.pop = 1;
}
// martı adanın üstünde tur atar
const gull = makeGull(); { const b = new THREE.Box3().setFromObject(gull), s = new THREE.Vector3(); b.getSize(s); gull.scale.multiplyScalar(0.7 / Math.max(s.x, s.z)); } scene.add(gull);
gull.traverse(o => { if (o.isMesh) o.castShadow = true; });
function tickCities(dt, t) {
  for (const c of cities) if (c.tick) c.tick(dt, t);
  const a = t * 0.32; gull.position.set(Math.sin(a) * 3.1, 3.2 + Math.sin(t * 0.9) * 0.25, Math.cos(a) * 4.6); gull.rotation.set(0, a + Math.PI, -0.35); flapGull(gull, t * 1.4, 0.6, 0.4);
  if (selC) { ring.position.set(selC.g.position.x, GROUND_Y + 0.16, selC.g.position.z); ring.scale.setScalar(1 + Math.abs(Math.sin(t * 3)) * 0.08); }
  tickLayer(dt, t);
  for (const c of cities) if (c.pop) { c.pop = Math.max(0, c.pop - dt * 3); const k = 1 + Math.sin(c.pop * Math.PI) * 0.12; c.g.scale.set(k, 1 / k, k); }
  const far = map.d > 42;
  for (const f of farIs) {
    f.cloud.position.y = Math.sin(t * 0.5 + f.x) * 0.15; f.cloud.rotation.y = Math.sin(t * 0.15 + f.z) * 0.08;
    const s = mapToScreen(f.pos), off = s.back || s.x < -80 || s.x > innerWidth + 80 || s.y < -30 || s.y > innerHeight + 30;
    f.label.style.display = off ? 'none' : '';
    if (!off) f.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  for (const c of cities) {
    const s = mapToScreen(c.pos), off = far || s.back || s.x < -60 || s.x > innerWidth + 60 || s.y < -30 || s.y > innerHeight + 30;
    c.label.style.display = off ? 'none' : '';
    if (!off) c.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -30%)`;
  }
}

// ---- heves katmanı ----
// Bitirilen şehirde dalgalanan bayrak; şehirleri açılış sırasıyla bağlayan yol taşları (bitirilen kısım altın);
// kilitli şehirler bulut altında: sıradaki kilitli şehir grileşmiş maketiyle hafif görünür, ötekiler tamamen bulutta.
// Yeni açılan şehrin bulutu harita açılınca bir kez dağılır (mapReveal). Durumlar main.js'ten gelir: mapState({ id: 'done' | 'open' | 'next' | 'locked' }).
const stones = []; // { x, z, seg }: seg, yolun hangi şehirden çıktığı (cities sırası)
let stoneMesh = null;
function buildPath(avoid) {
  const hills = HILLS.filter(([x, z, r]) => avoid.every(([ax, az, ar]) => Math.hypot(ax - x, az - z) >= ar + r * 0.6)); // islandDecor'un çizdiği tepeler
  for (let i = 0; i + 1 < cities.length; i++) {
    const a = cities[i].g.position, b = cities[i + 1].g.position, dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), n = Math.round(L / 0.3);
    // kavis: tepeye en az takılan seçilir (yol tepenin çevresinden dolanır); eşitlikte daha düz olan
    let best = null;
    for (const bend of [0.35, -0.35, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9]) {
      const cx = (a.x + b.x) / 2 - dz / L * bend, cz = (a.z + b.z) / 2 + dx / L * bend, pts = []; let hit = 0;
      for (let j = 0; j <= n; j++) {
        const u = j / n, x = (1 - u) * (1 - u) * a.x + 2 * u * (1 - u) * cx + u * u * b.x, z = (1 - u) * (1 - u) * a.z + 2 * u * (1 - u) * cz + u * u * b.z;
        if (Math.hypot(x - a.x, z - a.z) < PAD_R + 0.22 || Math.hypot(x - b.x, z - b.z) < PAD_R + 0.22) continue;
        if (hills.some(([hx, hz, hr]) => Math.hypot(hx - x, hz - z) < hr * 1.05) || Math.abs(x) / 3.4 + Math.abs(z) / 5.4 > 1.4) { hit++; continue; }
        pts.push({ x, z, seg: i });
      }
      if (!best || hit < best.hit) best = { hit, pts };
    }
    stones.push(...best.pts);
  }
  stoneMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), stones.length);
  const m = new THREE.Matrix4(), c0 = new THREE.Color(0xfff4d6);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0); trIsland.updateMatrixWorld(true);
  const groundAt = (x, z) => { ray.set(new THREE.Vector3(x, 5, z), down); const h = ray.intersectObject(trIsland, true)[0]; return h ? h.point.y : GROUND_Y; }; // çimenin kavisli üstü
  stones.forEach((s, i) => { m.makeRotationY(i * 1.7); m.setPosition(s.x, groundAt(s.x, s.z) + 0.01, s.z); stoneMesh.setMatrixAt(i, m); stoneMesh.setColorAt(i, c0); });
  stoneMesh.receiveShadow = true; scene.add(stoneMesh);
}
// bayrak: direk + kırmızı bez, üstünde simit; tek mesh, direğin çevresinde salınır
const flagGeo = (() => {
  const k = new Kit();
  k.add(new THREE.CylinderGeometry(0.022, 0.028, 1.0, 6), 0xf4f4f4, 0, 0.5, 0);
  k.add(new THREE.SphereGeometry(0.045, 8, 6), 0xffc93a, 0, 1.02, 0);
  k.add(new THREE.BoxGeometry(0.46, 0.28, 0.02), 0xe0303a, 0.24, 0.84, 0);
  k.add(new THREE.TorusGeometry(0.075, 0.028, 6, 14), 0xffffff, 0.25, 0.84, 0.012);
  return k.build();
})();
const greyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, color: 0xb9c1cc });
function cloudGeo(h, big) {
  // ikosahedron kümesi: kaidenin çevresinde halka; büyük bulut maketi baştan sona örter
  const k = new Kit(), n = big ? 9 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4, r = PAD_R * (big ? 0.62 : 0.95), s = (big ? 0.42 : 0.26) + ((i * 37) % 5) * 0.035;
    k.add(new THREE.IcosahedronGeometry(s, 1), i % 3 ? 0xffffff : 0xeef4fa, Math.sin(a) * r, big ? 0.35 + ((i * 53) % 4) * 0.12 * h : 0.12, Math.cos(a) * r);
  }
  if (big) { k.add(new THREE.IcosahedronGeometry(0.55, 1), 0xffffff, 0, h * 0.55 + 0.25, 0); k.add(new THREE.IcosahedronGeometry(0.4, 1), 0xf3f7fb, 0.25, h * 0.85 + 0.35, -0.1); }
  return k.build();
}
const cloudMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.9 });
function swapMat(c, grey) { // yalnız köşe renkli gövdeler grileşir; kendi malzemeli parçalar (şelale suyu) olduğu gibi kalır
  c.model.traverse(o => { if (!o.isMesh || !(o.userData.mat0 || o.material).vertexColors) return; if (!o.userData.mat0) o.userData.mat0 = o.material; o.material = grey ? greyMat : o.userData.mat0; });
}
const reveals = []; // dağılan bulutlar
export function mapState(st) {
  reveals.length = 0;
  for (const c of cities) {
    const s = st[c.id] || 'locked', locked = s === 'next' || s === 'locked', big = s === 'locked';
    c.state = s;
    if (s === 'done' && !c.flag) {
      c.flag = new THREE.Mesh(flagGeo, vcMat); c.flag.castShadow = true;
      c.flag.position.set(PAD_R * 0.72, 0.1, -PAD_R * 0.5); c.g.add(c.flag);
    }
    if (c.flag) c.flag.visible = s === 'done';
    swapMat(c, locked);
    c.model.visible = !big;
    if (locked && (!c.cloud || c.cloud.userData.big !== big)) {
      if (c.cloud) c.g.remove(c.cloud);
      c.cloud = new THREE.Mesh(cloudGeo(c.h, big), cloudMat()); c.cloud.userData.big = big; c.g.add(c.cloud);
    }
    if (c.cloud) { c.cloud.visible = locked; c.cloud.scale.setScalar(1); c.cloud.material.opacity = big ? 0.97 : 0.9; }
    c.label.classList.toggle('locked', locked);
  }
  const gold = new THREE.Color(0xffc93a), cream = new THREE.Color(0xfff4d6), dim = new THREE.Color(0xc9c6bb);
  if (stoneMesh) {
    stones.forEach((s, i) => { const a = cities[s.seg].state; stoneMesh.setColorAt(i, a === 'done' ? gold : a === 'open' ? cream : dim); });
    stoneMesh.instanceColor.needsUpdate = true;
  }
}
// yeni açılan şehir: bulut kısa bir bekleyişten sonra dağılır, maket renklenip zıplar
export function mapReveal(id, delay = 0.6) {
  const c = cities.find(q => q.id === id); if (!c) return;
  if (!c.cloud || c.cloud.userData.big) { if (c.cloud) c.g.remove(c.cloud); c.cloud = new THREE.Mesh(cloudGeo(c.h, false), cloudMat()); c.g.add(c.cloud); }
  c.cloud.visible = true; c.cloud.material.opacity = 0.9; c.model.visible = true; swapMat(c, true); c.label.classList.add('locked');
  reveals.push({ c, t: -delay });
}
export const mapRevealing = () => reveals.length > 0;
function tickLayer(dt, t) {
  for (const c of cities) {
    if (c.flag && c.flag.visible) c.flag.rotation.y = Math.sin(t * 2.2 + c.g.position.x) * 0.35 - 0.2;
    if (c.cloud && c.cloud.visible && !reveals.some(r => r.c === c)) c.cloud.position.y = Math.sin(t * 0.8 + c.g.position.z) * 0.05;
  }
  for (let i = reveals.length - 1; i >= 0; i--) {
    const r = reveals[i]; r.t += dt; if (r.t < 0) continue;
    const k = Math.min(r.t / 1.1, 1), e = 1 - (1 - k) * (1 - k);
    r.c.cloud.scale.set(1 + e * 1.4, 1 + e * 0.5, 1 + e * 1.4); r.c.cloud.position.y = e * 0.6; r.c.cloud.material.opacity = 0.9 * (1 - e);
    if (k > 0.35 && !r.swapped) { r.swapped = true; swapMat(r.c, false); r.c.pop = 1; r.c.label.classList.remove('locked'); }
    if (k >= 1) { r.c.cloud.visible = false; reveals.splice(i, 1); }
  }
}

// ---- uzak dünya ----
// Uzaklaşınca Türkiye'nin çevresinde bulutlu adalar: henüz açılmayan ülkeler, üstlerinde "Yakında". Yer: [x, z, yarıçapX, yarıçapZ, çimen rengi]
const FAR = [
  { id: 'america', at: [-11, -4, 4.0, 3.3, 0x86c95e] },
  { id: 'japan', at: [10, -16, 1.9, 4.0, 0x8fd07a] },
  { id: 'safrica', at: [4, 13, 3.5, 2.7, 0xb5c96a] },
];
const farIs = [];
function blobShape(rx, rz, seed) {
  // düzensiz ada kıyısı: yarıçap iki dalgayla oynar (düz sinüs değil, iki frekans toplamı)
  const pts = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, k = 0.84 + 0.1 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2.3); pts.push([Math.cos(a) * rx * k, Math.sin(a) * rz * k]); }
  return pts;
}
export function buildFar(items) { // items: [{ id, name, sub }]: adlar main.js'ten çevrilmiş gelir
  for (const it of items) {
    const f = FAR.find(q => q.id === it.id); if (!f) continue;
    const [x, z, rx, rz, grass] = f.at;
    addIsland(blobShape(rx, rz, x * 0.7 + z), x, z, grass);
    const k = new Kit(); let s = Math.abs(x * 13 + z * 7) | 0; const rnd = () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) { // adayı örten bulut kümesi
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.8, sz = 0.9 + rnd() * 0.9;
      k.add(new THREE.IcosahedronGeometry(sz, 1), rnd() < 0.3 ? 0xeef4fa : 0xffffff, Math.cos(a) * rx * r, 1.2 + rnd() * 1.4, Math.sin(a) * rz * r);
    }
    const cloud = new THREE.Mesh(k.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    cloud.castShadow = true; const g = new THREE.Group(); g.position.set(x, 0, z); g.add(cloud); scene.add(g);
    const label = document.createElement('div'); label.className = 'map-lbl far';
    label.innerHTML = `<b></b><small></small>`; label.firstChild.textContent = it.name; label.lastChild.textContent = it.sub; labelsEl.appendChild(label);
    farIs.push({ x, z, cloud, label, pos: new THREE.Vector3(x, 0.6, z + rz * 0.95) }); // etiket güney kıyısında: bulut görünsün
  }
}
