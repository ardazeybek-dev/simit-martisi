import * as THREE from 'three';
import { rand, canvasTex } from './util.js';
import { scene, MOBILE } from './scene.js';

// ---------------- hava: rastgele, mevsim yalnız ağırlığı biraz kaydırır ----------------
// Dört hava da her mevsim çıkabilir (yalnız iki hava sırayla geliyor gibi görünüyordu, sıkıcıydı). Az önceki hava tekrar gelirse
// bir kez yeniden çekilir: üst üste aynı hava seyrekleşir ama yasak değil. ?weather=rain|snow|fog|clear zorlar (deneme için).
const FORCE = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? new URLSearchParams(location.search).get('weather') : null; // yalnız localhost
const SEASON_W = { // [açık, yağmur, sis, kar]
  winter: [0.25, 0.2, 0.2, 0.35], spring: [0.45, 0.25, 0.2, 0.1], summer: [0.55, 0.2, 0.17, 0.08], autumn: [0.32, 0.3, 0.25, 0.13],
};
const KINDS = ['clear', 'rain', 'fog', 'snow'];
let last = null;
export function pickWeather() {
  try { const k = sessionStorage.getItem('simit-martisi-keepw'); sessionStorage.removeItem('simit-martisi-keepw'); if (KINDS.includes(k)) return (last = k); } catch (e) {} // sürüm yenilemesinde hava aynı kalır
  if (KINDS.includes(FORCE)) return FORCE;
  const m = new Date().getMonth(), w = SEASON_W[m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'];
  const roll = () => { let r = Math.random(); for (let i = 0; i < 4; i++) { if ((r -= w[i]) < 0) return KINDS[i]; } return 'clear'; };
  let k = roll(); if (k === last) k = roll();
  return (last = k);
}

// parçacıklar kameranın önündeki bir kutuda döner; düşen tane alttan çıkınca üste, geride kalınca öne sarılır
const BOX = { x: 26, y: 22, z0: -70, z1: 6 };
const RAIN_N = MOBILE ? 520 : 1100, SNOW_N = MOBILE ? 400 : 900;
// yağmur: her damla kameraya bakan ince bir şerit (iki üçgen). Çizgi (LineSegments) telefonda 1 piksel kalıp görünmüyordu
const DROP_W = 0.028, DROP_L = 1.5, RAIN_Z1 = -4; // RAIN_Z1: kameranın hemen önüne damla düşmez (yakındaki damla dev çubuk gibi görünüyordu)
const rainPos = new Float32Array(RAIN_N * 3), rainV = new Float32Array(RAIN_N * 12);
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainV, 3));
{ const idx = new Uint16Array(RAIN_N * 6); for (let i = 0; i < RAIN_N; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); rainGeo.setIndex(new THREE.BufferAttribute(idx, 1)); }
const rain = new THREE.Mesh(rainGeo, new THREE.MeshBasicMaterial({ color: 0xd3dcea, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
const snowPos = new Float32Array(SNOW_N * 3), snowPh = new Float32Array(SNOW_N);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const flake = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: flake, size: 0.6, transparent: true, depthWrite: false, opacity: 0.95 }));
for (const o of [rain, snow]) { o.frustumCulled = false; o.visible = false; scene.add(o); }
for (let i = 0; i < SNOW_N; i++) snowPh[i] = Math.random() * 6.3;

let kind = 'clear', seeded = false;
function seed(cx, cz) {
  for (let i = 0; i < RAIN_N; i++) { rainPos[i * 3] = cx + rand(-BOX.x, BOX.x); rainPos[i * 3 + 1] = rand(0, BOX.y); rainPos[i * 3 + 2] = cz + rand(BOX.z0, RAIN_Z1); }
  for (let i = 0; i < SNOW_N; i++) { snowPos[i * 3] = cx + rand(-BOX.x, BOX.x); snowPos[i * 3 + 1] = rand(0, BOX.y); snowPos[i * 3 + 2] = cz + rand(BOX.z0, BOX.z1); }
  seeded = true;
}
export function setWeatherFx(k) { kind = k; rain.visible = k === 'rain'; snow.visible = k === 'snow'; seeded = false; }
const wrap = (v, lo, hi) => (v < lo ? v + (hi - lo) : v > hi ? v - (hi - lo) : v);
// wind: yanal rüzgâr (birim/sn), yağmuru eğer, karı sürükler
export function updateWeatherFx(dt, t, cx, cz, wind) {
  if (kind !== 'rain' && kind !== 'snow') return;
  if (!seeded) seed(cx, cz);
  const lx = cx - BOX.x, hx = cx + BOX.x, lz = cz + BOX.z0, hz = cz + BOX.z1;
  if (kind === 'rain') {
    const slant = wind * 0.035 * DROP_L;
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 3;
      let x = rainPos[o] + wind * dt, y = rainPos[o + 1] - 32 * dt;
      if (y < 0) y += BOX.y;
      x = wrap(x, lx, hx); const z = wrap(rainPos[o + 2], lz, cz + RAIN_Z1);
      rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
      const v = i * 12, yt = y + DROP_L, xt = x - slant;
      rainV[v] = x - DROP_W; rainV[v + 1] = y; rainV[v + 2] = z;
      rainV[v + 3] = x + DROP_W; rainV[v + 4] = y; rainV[v + 5] = z;
      rainV[v + 6] = xt + DROP_W; rainV[v + 7] = yt; rainV[v + 8] = z;
      rainV[v + 9] = xt - DROP_W; rainV[v + 10] = yt; rainV[v + 11] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  } else {
    for (let i = 0; i < SNOW_N; i++) {
      const o = i * 3;
      let y = snowPos[o + 1] - (1.6 + (i % 5) * 0.25) * dt;
      if (y < 0) y += BOX.y;
      snowPos[o] = wrap(snowPos[o] + (Math.sin(t * 0.9 + snowPh[i]) * 0.8 + wind * 0.6) * dt, lx, hx);
      snowPos[o + 1] = y; snowPos[o + 2] = wrap(snowPos[o + 2], lz, hz);
    }
    snowGeo.attributes.position.needsUpdate = true;
  }
}
