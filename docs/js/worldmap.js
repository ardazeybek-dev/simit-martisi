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
const BOUNDS = { x0: -24, x1: 27, z0: -28, z1: 28 }; // uzak adalar (FAR) da kaydırılarak görülebilsin
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
  map.d = D_HOME; placeCam(innerWidth, innerHeight); map.tx = land ? -(290 + 14) / 2 * worldPerPx(innerHeight) : 0; map.tz = land ? 0.4 + ISL_ZC * 0.4 : 2.2 + ISL_ZC * 0.8; map.vx = map.vz = 0; // ada kuzeye uzadı: bakış da kayar
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
export const GROUND_Y = 0.95; // çimenin üstü (çim: 0,15 + kalınlık 0,55 + pah 0,25; eskiden 0,72 sanılıyordu, kaideler ve bayrak dipleri çime gömülüyordu)
// ada kuzeye (-z) uzar: Samsun'dan sonra Rize ve bir şehirlik daha yer (Mersin). ISL_ZC / ISL_RZ: adanın z ortası ve süs alanının yarı boyu
export const ISL_ZC = -1.65, ISL_RZ = 7.1;
export const TR_SHAPE = [[-1.2, -6.0], [1.6, -5.8], [3.4, -4.6], [3.9, -2.4], [3.6, 0.0], [3.9, 2.2], [3.4, 4.5], [3.8, 6.6], [3.1, 8.4], [1.2, 9.3], [-1.4, 9.3], [-3.2, 8.2], [-3.8, 6.3], [-3.4, 4.4], [-3.6, 2.4], [-3.9, 0.2], [-3.5, -2.2], [-3.6, -4.4]];
const trIsland = addIsland(TR_SHAPE, 0, 0);

// ---- şehirler ----
// Türkiye adasında şehirlerin yeri (açılış sırasıyla aşağıdan yukarı kıvrılan yol): [x, z]
export const CITY_POS = { istanbul: [-2.0, 4.2], izmir: [1.9, 3.2], antalya: [-1.9, 1.5], mugla: [2.2, 0.3], canakkale: [-1.7, -1.1], trabzon: [1.9, -2.5], samsun: [-0.4, -4.1], rize: [1.8, -5.8], mersin: [-1.6, -7.5] };
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
  scene.add(islandDecor(3.4, ISL_RZ, avoid.concat(stones.map(s => [s.x, s.z, 0.1])), 1, ISL_ZC));
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
  const a = t * 0.28; gull.position.set(Math.sin(a) * 3.1, 3.2 + Math.sin(t * 0.9) * 0.25, ISL_ZC + Math.cos(a) * 6.2); // martı uzayan adanın çevresinde (elips) tur atar
  gull.rotation.set(0, Math.atan2(-Math.cos(a) * 3.1, Math.sin(a) * 6.2), 0.35); flapGull(gull, t * 1.4, 0.6, 0.4); // burnu gidiş yönüne (elipsin teğeti), içe yatık
  if (selC) { ring.position.set(selC.g.position.x, GROUND_Y + 0.16, selC.g.position.z); ring.scale.setScalar(1 + Math.abs(Math.sin(t * 3)) * 0.08); }
  tickLayer(dt, t);
  for (const c of cities) if (c.pop) { c.pop = Math.max(0, c.pop - dt * 3); const k = 1 + Math.sin(c.pop * Math.PI) * 0.12; c.g.scale.set(k, 1 / k, k); }
  const far = map.d > 42;
  if (farCloud) farCloud.position.y = Math.sin(t * 0.5) * 0.15; // bulutlar hep birlikte hafifçe kabarıp iner
  tickSea(dt, t);
  const fs = THREE.MathUtils.clamp(36 / map.d, 0.5, 1); // ülke etiketleri uzaklaştıkça küçülür (yan yana ülkelerde üst üste binmesin)
  for (const f of farIs) {
    const s = mapToScreen(f.pos), off = s.back || s.x < -80 || s.x > innerWidth + 80 || s.y < -30 || s.y > innerHeight + 30;
    f.label.style.display = off ? 'none' : '';
    if (!off) f.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%) scale(${fs.toFixed(2)})`;
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
        if (hills.some(([hx, hz, hr]) => Math.hypot(hx - x, hz - z) < hr * 1.05) || Math.abs(x) / 3.4 + Math.abs(z - ISL_ZC) / ISL_RZ > 1.4) { hit++; continue; }
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
function swapMat(c, grey) { // yalnız köşe renkli gövdeler grileşir; kendi malzemeli parçalar (şelale suyu) olduğu gibi kalır. greyMat'i olan (Rize'nin LED'li bardağı) kendi grisine döner, greyHide gizlenir
  c.model.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.greyHide) { o.visible = !grey; return; }
    const gm = o.userData.greyMat; if (!gm && !(o.userData.mat0 || o.material).vertexColors) return;
    if (!o.userData.mat0) o.userData.mat0 = o.material; o.material = grey ? gm || greyMat : o.userData.mat0;
  });
}
const reveals = []; // dağılan bulutlar
export function mapState(st) {
  reveals.length = 0;
  for (const c of cities) {
    const s = st[c.id] || 'locked', locked = s === 'next' || s === 'locked', big = s === 'locked';
    c.state = s;
    if (s === 'done' && !c.flag) {
      c.flag = new THREE.Mesh(flagGeo, vcMat); c.flag.castShadow = true;
      c.flag.position.set(PAD_R * 0.95, 0, -PAD_R * 0.95); c.flag.scale.setScalar(1.75); c.g.add(c.flag); // kaidenin arka sağında, çimde, iri: bitirilen şehir uzaktan seçilsin
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
    c.label.classList.toggle('done', s === 'done');
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
// Uzaklaşınca Türkiye'nin çevresinde bulutlu adalar: henüz açılmayan ülkeler, üstlerinde "Yakında". Kabaca gerçek yerlerinde (-z kuzey, +x doğu).
// Yer: [x, z, yarıçapX, yarıçapZ, çimen rengi]. Her ülkenin çevresinde birkaç adacık, açık denizde de serpiştirilmiş adacıklar (kimi palmiyeli).
// Hepsi tek gövdede birleşir (köpük, kum, çimen, bulut, ağaç: 5 çizim): ada sayısı artsa da harita kasmaz
export const FAR = [
  { id: 'canada', at: [-15, -16, 4.2, 3.0, 0x7fbf6a] },
  { id: 'america', at: [-12, -4.5, 4.0, 3.2, 0x86c95e] },
  { id: 'mexico', at: [-16, 4.5, 2.2, 1.7, 0xb8c46a] },
  { id: 'brazil', at: [-11, 13.5, 3.4, 3.6, 0x5fb54e] },
  { id: 'argentina', at: [-13, 22.5, 1.8, 3.2, 0x9cc46a] },
  { id: 'uk', at: [-7.5, -19.5, 1.3, 2.0, 0x79c46a] },
  { id: 'spain', at: [-11.5, -10.2, 1.7, 1.3, 0xc4c070] },
  { id: 'france', at: [-7.2, -13.2, 1.7, 1.6, 0x86c95e] },
  { id: 'germany', at: [-3.4, -16.4, 1.6, 1.6, 0x7cc265] },
  { id: 'italy', at: [-7, 4.2, 1.0, 2.4, 0x9cc46a] },
  { id: 'greece', at: [-7.4, 10.4, 1.1, 1.0, 0xb5c46a] },
  { id: 'russia', at: [2.5, -23, 6.6, 2.6, 0x8cc88a] },
  { id: 'azerbaijan', at: [7.2, -8, 1.3, 1.1, 0xa8c46a] },
  { id: 'china', at: [16.5, -8, 4.2, 3.6, 0x86c95e] },
  { id: 'korea', at: [14.8, -16, 1.0, 1.8, 0x7fbf6a] },
  { id: 'japan', at: [10, -16, 1.9, 4.0, 0x8fd07a] },
  { id: 'india', at: [12.5, 3, 2.8, 3.0, 0xa8c46a] },
  { id: 'saudi', at: [7.4, 8.6, 1.8, 1.4, 0xd8c88a] },
  { id: 'egypt', at: [-2.6, 10.2, 1.7, 1.3, 0xd2c27a] },
  { id: 'africa', at: [3.6, 15.4, 4.4, 3.5, 0xb5c96a] },
  { id: 'indonesia', at: [16, 10.5, 2.4, 1.0, 0x5fb54e] },
  { id: 'australia', at: [17, 19.5, 4.4, 3.2, 0xc9b86a] },
  { id: 'nz', at: [24, 24, 0.9, 1.6, 0x79c46a] },
];
const farIs = [];
let farCloud = null;
function blobShape(rx, rz, seed) {
  // düzensiz ada kıyısı: yarıçap iki dalgayla oynar (düz sinüs değil, iki frekans toplamı)
  const pts = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, k = 0.84 + 0.1 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2.3); pts.push([Math.cos(a) * rx * k, Math.sin(a) * rz * k]); }
  return pts;
}
// geometrileri tek gövdede birleştirir (konum, normal, isteğe bağlı tek renk)
function mergeGeos(parts) {
  const ps = parts.map(({ g, x, y = 0, z, col }) => { const q = (g.index ? g.toNonIndexed() : g); q.translate(x, y, z); return { q, col }; });
  const n = ps.reduce((t, p) => t + p.q.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cols = new Float32Array(n * 3), c = new THREE.Color();
  let o = 0;
  for (const { q, col } of ps) {
    const cnt = q.attributes.position.count; pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3);
    c.setHex(col === undefined ? 0xffffff : col); for (let i = 0; i < cnt; i++) { cols[(o + i) * 3] = c.r; cols[(o + i) * 3 + 1] = c.g; cols[(o + i) * 3 + 2] = c.b; }
    o += cnt; q.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeBoundingSphere();
  return g;
}
export function buildFar(items) { // items: [{ id, name, sub }]: adlar main.js'ten çevrilmiş gelir
  let s = 12345; const rnd = () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647);
  const foam = [], sand = [], top = [], ck = new Kit(), tk = new Kit(), blobs = [];
  const island = (x, z, rx, rz, grass) => {
    const pts = blobShape(rx, rz, x * 0.7 + z);
    foam.push({ g: islandGeo(pts.map(([a, b]) => [a * 1.08 + (a > 0 ? 0.12 : -0.12), b * 1.06 + (b > 0 ? 0.12 : -0.12)]), 0.05), x, y: 0.02, z });
    sand.push({ g: islandGeo(pts, 0.35), x, z });
    top.push({ g: islandGeo(pts.map(([a, b]) => [a * 0.88, b * 0.9]), 0.55), x, y: 0.15, z, col: grass });
    blobs.push([x, z, Math.max(rx, rz)]);
  };
  const free = (x, z, r) => !blobs.some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br + r + 0.5) && !(Math.abs(x) < 5.2 && z > -11 && z < 7.5);
  const palmAt = (x, z, h) => { tk.add(new THREE.CylinderGeometry(0.04, 0.06, h, 5), 0x8a6a45, x, 0.95 + h / 2, z, 0, 0, 0.12); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; tk.add(new THREE.BoxGeometry(0.5, 0.04, 0.12), 0x3f9a4a, x + Math.sin(a) * 0.22 + 0.06, 0.95 + h, z + Math.cos(a) * 0.22, 0, a + Math.PI / 2, -0.35); } };
  for (const it of items) {
    const f = FAR.find(q => q.id === it.id); if (!f) continue;
    const [x, z, rx, rz, grass] = f.at;
    island(x, z, rx, rz, grass);
    for (let i = 0; i < 18; i++) { // adayı örten bulut kümesi (büyük adada daha çok)
      if (i > 8 + rx * rz && i > 8) break;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.8, sz = 0.6 + rnd() * 0.5 + Math.min(rx, rz) * 0.18;
      ck.add(new THREE.IcosahedronGeometry(sz, 1), rnd() < 0.3 ? 0xeef4fa : 0xffffff, x + Math.cos(a) * rx * r, 1.2 + rnd() * 1.2, z + Math.sin(a) * rz * r);
    }
    for (let i = 0, made = 0; i < 12 && made < 3; i++) { // kıyısında adacıklar
      const a = rnd() * Math.PI * 2, d = 1.25 + rnd() * 0.5, ix = x + Math.cos(a) * rx * d, iz = z + Math.sin(a) * rz * d, ir = 0.25 + rnd() * 0.45;
      if (!free(ix, iz, ir)) continue;
      island(ix, iz, ir, ir * (0.7 + rnd() * 0.5), 0x8fd07a); made++;
      if (rnd() < 0.6) palmAt(ix, iz, 0.5 + rnd() * 0.3);
    }
    const label = document.createElement('div'); label.className = 'map-lbl far';
    label.innerHTML = `<b></b><small></small>`; label.firstChild.textContent = it.name; label.lastChild.textContent = it.sub; labelsEl.appendChild(label);
    farIs.push({ x, z, label, pos: new THREE.Vector3(x, 0.6, z + rz * 0.95) }); // etiket güney kıyısında: bulut görünsün
  }
  for (let i = 0, made = 0; i < 400 && made < 26; i++) { // açık denizde serpiştirilmiş adacıklar
    const ix = -23 + rnd() * 50, iz = -27 + rnd() * 54, ir = 0.25 + rnd() * 0.5;
    if (!free(ix, iz, ir + 0.6)) continue;
    island(ix, iz, ir, ir * (0.7 + rnd() * 0.5), rnd() < 0.5 ? 0x8fd07a : 0x7cc95a); made++;
    if (rnd() < 0.5) palmAt(ix, iz, 0.5 + rnd() * 0.3);
  }
  const fm = new THREE.Mesh(mergeGeos(foam), lam(0xe8f7ff));
  const sm = new THREE.Mesh(mergeGeos(sand), lam(0xf2d79a)); sm.castShadow = sm.receiveShadow = true;
  const tm = new THREE.Mesh(mergeGeos(top), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); tm.receiveShadow = true;
  const tr = new THREE.Mesh(tk.build(), vcMat); tr.castShadow = true;
  farCloud = new THREE.Mesh(ck.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); farCloud.castShadow = true;
  scene.add(fm, sm, tm, tr, farCloud);
  buildSea(blobs, rnd);
}

// ---- denizde hayat: gemiler, kuş sürüleri, zıplayan balıklar ----
// Hepsi InstancedMesh (gemi, yelkenli, köpük izi, kuş, balık, sıçrama halkası: 6 çizim). Gemiler karaya değmeyen dar elips rotalarda gidip döner (rota kurulurken
// her noktası adalardan ve Türkiye'den pay bırakılarak denenir), kuşlar V düzeninde açık denizin üstünde tur atar, balıklar adaların çevresinde arada bir sudan zıplar.
export const sea3 = { ships: [], flocks: [], fish: [] };
const _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _sp = new THREE.Vector3(), _ss = new THREE.Vector3(), _se = new THREE.Euler();
function shipGeo(sail) {
  const k = new Kit();
  if (sail) {
    k.add(new THREE.BoxGeometry(0.62, 0.12, 0.2), 0xf6f4ee, 0, 0.06, 0).add(new THREE.BoxGeometry(0.64, 0.04, 0.21), 0x2f6fb4, 0, 0.02, 0)
      .add(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 4), 0xd8d2c4, 0.04, 0.42, 0)
      .add(new THREE.ConeGeometry(0.2, 0.54, 3), 0xfdfbf4, -0.04, 0.4, 0, 0, Math.PI / 2, 0, 0.12, 1, 1);
  } else {
    const CC = [0xc8352e, 0x2f6fb4, 0x2e8a52, 0xe0a030];
    k.add(new THREE.BoxGeometry(1.1, 0.12, 0.3), 0xb8352e, 0, 0.04, 0).add(new THREE.BoxGeometry(1.12, 0.1, 0.31), 0x2b3440, 0, 0.14, 0)
      .add(new THREE.ConeGeometry(0.155, 0.28, 4), 0x2b3440, 0.68, 0.11, 0, 0, Math.PI / 4, -Math.PI / 2, 1, 1, 0.7);
    for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(0.13, 0.1, 0.26), CC[i % 4], 0.38 - i * 0.14, 0.24, 0);
    k.add(new THREE.BoxGeometry(0.16, 0.2, 0.28), 0xf6f4ee, -0.46, 0.29, 0).add(new THREE.BoxGeometry(0.17, 0.05, 0.29), 0x2b4560, -0.46, 0.34, 0).add(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 6), 0xc8352e, -0.5, 0.45, 0);
  }
  return k.build();
}
// dümen suyu: gemi geçtiği yerde suda köpük beneği bırakır (dünyada kalır), benekler V gibi iki yana açılır, büyüyüp söner; dönüşte iz kıvrılarak arkada kalır
const wakeGeo = new Kit().add(new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), 0xffffff).build(), WAKE_N = 24, WAKE_LIFE = 2.2, WAKE_DT = WAKE_LIFE / WAKE_N;
const birdGeo = new Kit().add(new THREE.BoxGeometry(0.16, 0.05, 0.05), 0xf6f6f2).add(new THREE.BoxGeometry(0.05, 0.02, 0.26), 0xf2f2ee, 0.01, 0.05, 0.13, 0.5, 0, 0).add(new THREE.BoxGeometry(0.05, 0.02, 0.26), 0xf2f2ee, 0.01, 0.05, -0.13, -0.5, 0, 0)
  .add(new THREE.BoxGeometry(0.03, 0.02, 0.06), 0x1b1c22, 0.01, 0.1, 0.26, 0.5, 0, 0).add(new THREE.BoxGeometry(0.03, 0.02, 0.06), 0x1b1c22, 0.01, 0.1, -0.26, -0.5, 0, 0).add(new THREE.BoxGeometry(0.04, 0.02, 0.02), 0xf4b52a, 0.1, 0, 0).build();
const fishGeo = new Kit().add(new THREE.SphereGeometry(0.07, 8, 5), (f, y) => (y > 0 ? 0x3f7fb0 : 0xdde8ee), 0, 0, 0, 0, 0, 0, 1.9, 1, 0.8).add(new THREE.ConeGeometry(0.06, 0.1, 4), 0x3f7fb0, -0.17, 0, 0, 0, 0, Math.PI / 2, 1, 1, 0.3).build();
const splashGeo = new Kit().add(new THREE.TorusGeometry(0.16, 0.025, 4, 14).rotateX(Math.PI / 2), 0xffffff).build();
function inst(geo, n, shadow = false) { const m = new THREE.InstancedMesh(geo, vcMat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = shadow; scene.add(m); return m; }
function buildSea(blobs, rnd) {
  const land = (x, z, pad) => blobs.some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br * 1.15 + pad) || ((x / 4.6) ** 2 + ((z + 1.65) / 8.4) ** 2 < (1 + pad / 4.5) ** 2);
  // gemi rotaları: dar elips (gidiş bir yandan, dönüş öbür yandan); her noktası karadan pay bırakır
  const lanes = [];
  for (let i = 0; i < 900 && lanes.length < 14; i++) {
    const sail = lanes.length >= 8, L = sail ? 2.5 + rnd() * 3 : 5 + rnd() * 8, cx = -22 + rnd() * 46, cz = -25 + rnd() * 50, a = rnd() * Math.PI, w = sail ? 0.5 : 0.35;
    const dx = Math.cos(a), dz = Math.sin(a); let ok = true;
    for (let u = 0; u < 1 && ok; u += 0.04) { const th = u * Math.PI * 2; if (land(cx + dx * L / 2 * Math.cos(th) - dz * w * Math.sin(th), cz + dz * L / 2 * Math.cos(th) + dx * w * Math.sin(th), sail ? 0.5 : 0.8)) ok = false; }
    if (ok && !lanes.some(l => Math.hypot(l.cx - cx, l.cz - cz) < (l.L + L) / 2 + 1)) lanes.push({ cx, cz, dx, dz, L, w, sail, th: rnd() * 6.28, v: (sail ? 0.45 : 0.7) / (L * 1.6) });
  }
  const nb = lanes.filter(l => !l.sail).length;
  sea3.cargo = inst(shipGeo(false), Math.max(1, nb), true); sea3.sails = inst(shipGeo(true), Math.max(1, lanes.length - nb), true); sea3.wake = inst(wakeGeo, Math.max(1, lanes.length * WAKE_N * 3)); sea3.wake.material = new THREE.MeshBasicMaterial({ color: 0xeaf7fb }); // köpük ışıktan etkilenmez: gri duman gibi değil, ak köpük
  for (const l of lanes) { l.trail = []; l.dropT = 0; }
  sea3.ships = lanes;
  // kuş sürüleri: açık denizin üstünde büyük çemberler, V düzeni
  for (let i = 0; i < 4; i++) sea3.flocks.push({ cx: -14 + rnd() * 28, cz: -18 + rnd() * 36, r: 5 + rnd() * 6, y: 2.4 + rnd() * 1.2, v: (0.12 + rnd() * 0.08) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, n: 4 + ((rnd() * 3) | 0) });
  sea3.birds = inst(birdGeo, sea3.flocks.reduce((t, f) => t + f.n, 0));
  // balıklar: adaların ve kıyıların yakınında açık su; her biri kendi aralığında zıplar
  for (let i = 0; i < 600 && sea3.fish.length < 18; i++) {
    const x = -22 + rnd() * 46, z = -25 + rnd() * 50;
    if (land(x, z, 0.4) || !land(x, z, 3.5)) continue; // karaya değmeyen ama kıyıya yakın su
    sea3.fish.push({ x, z, a: rnd() * 6.28, T: 2.5 + rnd() * 4, t: rnd() * 6 });
  }
  sea3.fishM = inst(fishGeo, sea3.fish.length); sea3.splash = inst(splashGeo, sea3.fish.length);
}
function tickSea(dt, t) {
  if (!sea3.cargo) return;
  let ci = 0, si = 0;
  for (const [i, l] of sea3.ships.entries()) {
    l.th += l.v * dt * 6.283;
    const c = Math.cos(l.th), sn = Math.sin(l.th), x = l.cx + l.dx * l.L / 2 * c - l.dz * l.w * sn, z = l.cz + l.dz * l.L / 2 * c + l.dx * l.w * sn;
    const vx = -l.dx * l.L / 2 * sn - l.dz * l.w * c, vz = -l.dz * l.L / 2 * sn + l.dx * l.w * c, yaw = Math.atan2(-vz, vx); // burun +x: gidiş yönüne
    _se.set(Math.sin(t * 1.3 + i) * 0.03, yaw, Math.sin(t * 0.9 + i) * 0.04); _sq.setFromEuler(_se);
    _sm.compose(_sp.set(x, 0.02 + Math.sin(t * 1.6 + i) * 0.015, z), _sq, _ss.set(1, 1, 1));
    (l.sail ? sea3.sails : sea3.cargo).setMatrixAt(l.sail ? si++ : ci++, _sm);
    const bx = Math.cos(yaw), bz = -Math.sin(yaw), st = l.sail ? 0.3 : 0.56; // kıç: burnun tersinde
    if ((l.dropT -= dt) <= 0) { l.dropT = WAKE_DT; l.trail.unshift({ x: x - bx * st, z: z - bz * st, px: -bz, pz: bx, yaw, age: 0, j: [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], s: 0.8 + Math.random() * 0.4 }); if (l.trail.length > WAKE_N) l.trail.pop(); }
    const K = l.sail ? 0.55 : 1;
    for (let j = 0; j < WAKE_N; j++) for (const sd of [-1, 0, 1]) { // iki yan dalga (V) ve ortada pervane köpüğü
      const q = l.trail[j], idx = (i * WAKE_N + j) * 3 + sd + 1;
      if (sd === 0 && q) q.age += dt;
      const u = q ? Math.min(1, q.age / WAKE_LIFE) : 1;
      if (!q || (sd === 0 && u > 0.45)) { _sm.makeScale(0, 0, 0); sea3.wake.setMatrixAt(idx, _sm); continue; }
      const jj = q.j[sd + 1], spread = sd ? (0.06 + u * 0.46) * K + jj * 0.04 : jj * 0.05, fade = sd ? Math.pow(1 - u, 0.8) : 1 - u / 0.45;
      const r = ((sd ? 0.06 + u * 0.12 : 0.09 + u * 0.1) * K * fade + 0.001) * q.s;
      _se.set(0, q.yaw + (sd ? sd * 0.5 : 0), 0); _sq.setFromEuler(_se);
      _sm.compose(_sp.set(q.x + q.px * sd * spread + q.px * (sd ? 0 : spread), 0.012 + (sd ? 0 : 0.002), q.z + q.pz * sd * spread + q.pz * (sd ? 0 : spread)), _sq, _ss.set(r * 1.7, 1, r)); sea3.wake.setMatrixAt(idx, _sm);
    }
  }
  let bi = 0;
  for (const f of sea3.flocks) {
    const a = f.ph + t * f.v, hx = f.cx + Math.cos(a) * f.r, hz = f.cz + Math.sin(a) * f.r, yaw = Math.atan2(-Math.cos(a) * f.v, -Math.sin(a) * f.v); // teğet
    const fx = Math.cos(yaw), fz = -Math.sin(yaw), px = -fz, pz = fx;
    for (let j = 0; j < f.n; j++) {
      const row = Math.ceil(j / 2), side = j % 2 ? 1 : -1, x = hx - fx * row * 0.35 + px * side * row * 0.32, z = hz - fz * row * 0.35 + pz * side * row * 0.32;
      const flap = Math.sin(t * 9 + j * 1.3 + f.ph);
      _se.set(side * 0.08 * Math.sign(f.v), yaw, 0); _sq.setFromEuler(_se);
      _sm.compose(_sp.set(x, f.y + Math.sin(t * 0.8 + j) * 0.08 + flap * 0.02, z), _sq, _ss.set(1, 0.35 + 0.65 * flap, 1)); sea3.birds.setMatrixAt(bi++, _sm);
    }
  }
  for (const [i, f] of sea3.fish.entries()) {
    f.t += dt; const J = 0.85, u = (f.t % f.T) / J; // her T sn'de bir zıplar, J sn sürer
    if (u < 1) {
      const fx = Math.cos(f.a), fz = -Math.sin(f.a), x = f.x + fx * (u - 0.5) * 0.9, z = f.z + fz * (u - 0.5) * 0.9, y = 0.02 + Math.sin(u * Math.PI) * 0.55;
      _se.set(0, f.a, Math.cos(u * Math.PI) * 0.9); _sq.setFromEuler(_se); _sm.compose(_sp.set(x, y, z), _sq, _ss.set(1, 1, 1));
    } else _sm.makeScale(0, 0, 0);
    sea3.fishM.setMatrixAt(i, _sm);
    const w = (f.t % f.T) / J; // sıçrama: çıkışta ve dalışta halka büyüyüp söner
    const ring = w < 0.3 ? w / 0.3 : w > 0.95 && w < 1.45 ? (w - 0.95) / 0.5 : -1;
    if (ring >= 0) { const end = w > 0.9, rx = f.x + Math.cos(f.a) * (end ? 0.45 : -0.45), rz = f.z - Math.sin(f.a) * (end ? 0.45 : -0.45); _sm.compose(_sp.set(rx, 0.02, rz), _sq.identity(), _ss.setScalar(0.4 + ring * 1.2 * (1 - ring * 0.4))); }
    else _sm.makeScale(0, 0, 0);
    sea3.splash.setMatrixAt(i, _sm);
  }
  for (const m of [sea3.cargo, sea3.sails, sea3.wake, sea3.birds, sea3.fishM, sea3.splash]) m.instanceMatrix.needsUpdate = true;
}
