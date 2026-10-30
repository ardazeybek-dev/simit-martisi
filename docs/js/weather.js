import * as THREE from 'three';
import { rand, canvasTex } from './util.js';
import { scene, MOBILE } from './scene.js';

// ---------------- hava: gerçek takvime göre ----------------
// Kış (Ara-Şub) kar, sonbahar (Eyl-Kas) çoğunlukla yağmur, ara sıra sis; ilkbahar/yaz çoğunlukla açık.
// ?weather=rain|snow|fog|clear zorlar (deneme için). Her uçuşta yeniden seçilir.
const FORCE = new URLSearchParams(location.search).get('weather');
export function pickWeather() {
  if (['rain', 'snow', 'fog', 'clear'].includes(FORCE)) return FORCE;
  const m = new Date().getMonth(), r = Math.random();
  if (m === 11 || m <= 1) return r < 0.7 ? 'snow' : r < 0.85 ? 'fog' : 'clear';
  if (m >= 8 && m <= 10) return r < 0.6 ? 'rain' : r < 0.75 ? 'fog' : 'clear';
  if (m >= 2 && m <= 4) return r < 0.2 ? 'rain' : r < 0.32 ? 'fog' : 'clear';
  return r < 0.08 ? 'fog' : 'clear';
}

// parçacıklar kameranın önündeki bir kutuda döner; düşen tane alttan çıkınca üste, geride kalınca öne sarılır
const BOX = { x: 26, y: 22, z0: -70, z1: 6 };
const RAIN_N = MOBILE ? 300 : 700, SNOW_N = MOBILE ? 400 : 900;
const rainPos = new Float32Array(RAIN_N * 6);
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xe4ecf7, transparent: true, opacity: 0.45, depthWrite: false }));
const snowPos = new Float32Array(SNOW_N * 3), snowPh = new Float32Array(SNOW_N);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const flake = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: flake, size: 0.6, transparent: true, depthWrite: false, opacity: 0.95 }));
for (const o of [rain, snow]) { o.frustumCulled = false; o.visible = false; scene.add(o); }
for (let i = 0; i < SNOW_N; i++) snowPh[i] = Math.random() * 6.3;

let kind = 'clear', seeded = false;
function seed(cx, cz) {
  for (let i = 0; i < RAIN_N; i++) { rainPos[i * 6] = cx + rand(-BOX.x, BOX.x); rainPos[i * 6 + 1] = rand(0, BOX.y); rainPos[i * 6 + 2] = cz + rand(BOX.z0, BOX.z1); }
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
    const slant = wind * 0.035;
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6;
      let x = rainPos[o] + wind * dt, y = rainPos[o + 1] - 30 * dt;
      if (y < 0) y += BOX.y;
      x = wrap(x, lx, hx); const z = wrap(rainPos[o + 2], lz, hz);
      rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
      rainPos[o + 3] = x - slant; rainPos[o + 4] = y + 1.1; rainPos[o + 5] = z;
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
