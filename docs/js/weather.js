import * as THREE from 'three';
import { rand, canvasTex } from './util.js';
import { scene, MOBILE, waveAt } from './scene.js';

// ---------------- hava: rastgele, mevsim yalnız ağırlığı biraz kaydırır ----------------
// Dört hava da her mevsim çıkabilir (yalnız iki hava sırayla geliyor gibi görünüyordu, sıkıcıydı). Az önceki hava tekrar gelirse
// bir kez yeniden çekilir: üst üste aynı hava seyrekleşir ama yasak değil. ?weather=rain|snow|fog|clear zorlar (deneme için).
const FORCE = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? new URLSearchParams(location.search).get('weather') : null; // yalnız localhost
const SEASON_W = { // [açık, yağmur, sis, kar]
  winter: [0.25, 0.2, 0.2, 0.35], spring: [0.45, 0.25, 0.2, 0.1], summer: [0.55, 0.2, 0.17, 0.08], autumn: [0.32, 0.3, 0.25, 0.13],
};
const KINDS = ['clear', 'rain', 'fog', 'snow'];
let last = null;
// mul: şehrin hava çarpanları (cities.js wx, [açık, yağmur, sis, kar]); 0 olan hava o şehirde hiç çıkmaz
export const weatherOk = (k, mul) => !mul || mul[KINDS.indexOf(k)] !== 0;
export function pickWeather(mul) {
  try { const k = sessionStorage.getItem('simit-martisi-keepw'); sessionStorage.removeItem('simit-martisi-keepw'); if (KINDS.includes(k) && weatherOk(k, mul)) return (last = k); } catch (e) {} // sürüm yenilemesinde hava aynı kalır
  if (KINDS.includes(FORCE)) return FORCE;
  const m = new Date().getMonth(), w = SEASON_W[m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'].map((v, i) => v * (mul ? mul[i] : 1));
  const roll = () => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < 4; i++) { if ((r -= w[i]) < 0) return KINDS[i]; } return 'clear'; };
  let k = roll(); if (k === last) k = roll();
  return (last = k);
}

// parçacıklar kameranın önündeki bir kutuda döner; düşen tane alttan çıkınca üste, geride kalınca öne sarılır
const BOX = { x: 26, y: 22, z0: -70, z1: 6 };
const RAIN_N = MOBILE ? 520 : 1100, SNOW_N = MOBILE ? 400 : 900, RAIN_MAX = Math.round(RAIN_N * 1.5); // RAIN_MAX: sağanak şehirde (city.rainK) en çok damla
// yağmur: her damla kameraya bakan ince bir şerit (iki üçgen). Çizgi (LineSegments) telefonda 1 piksel kalıp görünmüyordu
const DROP_W = 0.028, DROP_L = 1.5, RAIN_Z1 = -4; // RAIN_Z1: kameranın hemen önüne damla düşmez (yakındaki damla dev çubuk gibi görünüyordu)
const rainPos = new Float32Array(RAIN_MAX * 3), rainV = new Float32Array(RAIN_MAX * 12);
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainV, 3));
{ const idx = new Uint16Array(RAIN_MAX * 6); for (let i = 0; i < RAIN_MAX; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); rainGeo.setIndex(new THREE.BufferAttribute(idx, 1)); }
let rainN = RAIN_N;
const rain = new THREE.Mesh(rainGeo, new THREE.MeshBasicMaterial({ color: 0xd3dcea, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
const snowPos = new Float32Array(SNOW_N * 3), snowPh = new Float32Array(SNOW_N);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const flake = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: flake, size: 0.6, transparent: true, depthWrite: false, opacity: 0.95 }));
for (const o of [rain, snow]) { o.frustumCulled = false; o.visible = false; scene.add(o); }
for (let i = 0; i < SNOW_N; i++) snowPh[i] = Math.random() * 6.3;
// yağmur halkaları: kameranın önündeki suda damlaların açtığı halkalar (tek InstancedMesh, toplanır parlaklık: söndükçe kararır, kaybolur)
const RIP_N = MOBILE ? 26 : 44, ripGeo = new THREE.RingGeometry(0.62, 0.74, 20); ripGeo.rotateX(-Math.PI / 2);
const ripples = new THREE.InstancedMesh(ripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }), RIP_N);
const rip = Array.from({ length: RIP_N }, () => ({ x: 0, z: 0, age: 9, life: 1, s: 1 })), _rm = new THREE.Matrix4(), _rc = new THREE.Color();
ripples.frustumCulled = false; ripples.visible = false; ripples.renderOrder = 1; scene.add(ripples);

let kind = 'clear', seeded = false;
function seed(cx, cz) {
  for (let i = 0; i < RAIN_MAX; i++) { rainPos[i * 3] = cx + rand(-BOX.x, BOX.x); rainPos[i * 3 + 1] = rand(0, BOX.y); rainPos[i * 3 + 2] = cz + rand(BOX.z0, RAIN_Z1); }
  for (let i = 0; i < SNOW_N; i++) { snowPos[i * 3] = cx + rand(-BOX.x, BOX.x); snowPos[i * 3 + 1] = rand(0, BOX.y); snowPos[i * 3 + 2] = cz + rand(BOX.z0, BOX.z1); }
  seeded = true;
}
// heavy: şehrin yağmur yoğunluğu (city.rainK; Rize sağanak): damla sayısı ve halka sıklığı
let heavy = 1;
export function setWeatherFx(k, hv = 1) {
  kind = k; heavy = Math.min(1.5, hv); rainN = Math.round(RAIN_N * heavy); rainGeo.setDrawRange(0, rainN * 6);
  rain.visible = ripples.visible = k === 'rain'; snow.visible = k === 'snow'; seeded = false;
  rain.material.opacity = 0.45 + (heavy - 1) * 0.2;
}
const wrap = (v, lo, hi) => (v < lo ? v + (hi - lo) : v > hi ? v - (hi - lo) : v);
// wind: yanal rüzgâr (birim/sn), yağmuru eğer, karı sürükler
export function updateWeatherFx(dt, t, cx, cz, wind) {
  if (kind !== 'rain' && kind !== 'snow') return;
  if (!seeded) seed(cx, cz);
  const lx = cx - BOX.x, hx = cx + BOX.x, lz = cz + BOX.z0, hz = cz + BOX.z1;
  if (kind === 'rain') {
    const slant = wind * 0.035 * DROP_L;
    // halkalar: bitenin yerine kameranın önünde yeni halka (saniyede ~RIP_N/ömür; sağanakta sık)
    for (let i = 0; i < RIP_N; i++) {
      const r = rip[i];
      r.age += dt * heavy;
      if (r.age > r.life) { if (Math.random() > dt * 6) { _rm.makeScale(0, 0, 0); ripples.setMatrixAt(i, _rm); continue; } r.x = cx + rand(-13, 13); r.z = cz + rand(-46, -7); r.age = 0; r.life = rand(0.5, 0.9); r.s = rand(0.5, 1.1); }
      const k = r.age / r.life, sc = r.s * (0.25 + k * 1.4);
      _rm.makeScale(sc, 1, sc).setPosition(r.x, waveAt(r.x, r.z, t) + 0.06, r.z); ripples.setMatrixAt(i, _rm);
      ripples.setColorAt(i, _rc.setScalar(0.42 * (1 - k) ** 1.6));
    }
    ripples.instanceMatrix.needsUpdate = true; if (ripples.instanceColor) ripples.instanceColor.needsUpdate = true;
    for (let i = 0; i < rainN; i++) {
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
