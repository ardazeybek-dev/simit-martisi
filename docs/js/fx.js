import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { rand, canvasTex } from './util.js';

// ---------------- havuzlu parçacıklar (tek InstancedMesh = tek draw call) ----------------
class Pool {
  constructor(geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = []; this.max = max;
    this._o = new THREE.Object3D(); this._c = new THREE.Color();
  }
  emit(pos, n, o) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const sp = o.speed * rand(0.4, 1);
      const v = new THREE.Vector3(rand(-1, 1), rand(o.up ?? 0.3, 1.4), rand(-1, 1)).normalize().multiplyScalar(sp);
      if (o.vel) v.add(o.vel);
      this.p.push({
        x: pos.x + rand(-1, 1) * (o.spread || 0), y: pos.y + rand(-1, 1) * (o.spread || 0), z: pos.z + rand(-1, 1) * (o.spread || 0),
        v, life: rand(o.life * 0.6, o.life), max: o.life, s: rand(o.size * 0.6, o.size), g: o.gravity ?? 9, drag: o.drag ?? 1.5,
        rx: rand(0, 6), ry: rand(0, 6), spin: rand(-10, 10) * (o.spin ?? 1), col: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
        flutter: o.flutter || 0,
      });
    }
  }
  update(dt) {
    const m = this.mesh, O = this._o;
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      const d = Math.exp(-q.drag * dt);
      q.v.x *= d; q.v.z *= d; q.v.y = q.v.y * d - q.g * dt;
      if (q.flutter) { q.v.y = Math.max(q.v.y, -1.2); q.v.x += Math.sin(q.life * 9 + q.rx) * q.flutter * dt; }
      q.x += q.v.x * dt; q.y += q.v.y * dt; q.z += q.v.z * dt;
      q.rx += q.spin * dt; q.ry += q.spin * 0.7 * dt;
      const k = Math.min(1, q.life / (q.max * 0.35));
      O.position.set(q.x, q.y, q.z); O.rotation.set(q.rx, q.ry, 0); O.scale.setScalar(q.s * k);
      O.updateMatrix(); m.setMatrixAt(n, O.matrix);
      m.setColorAt(n, this._c.setHex(q.col));
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  clear() { this.p.length = 0; this.mesh.count = 0; }
}

const chunkMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
const flatMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
export const chunks = new Pool(new THREE.BoxGeometry(1, 1, 1), chunkMat, 260);
export const flats = new Pool(new THREE.PlaneGeometry(1, 0.45), flatMat, 160);

// parıltı: eklemeli harmanlanan noktalar, renk sönerek kaybolur
const glowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
const SPK = 220;
const spGeo = new THREE.BufferGeometry();
spGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPK * 3), 3).setUsage(THREE.DynamicDrawUsage));
spGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPK * 3), 3).setUsage(THREE.DynamicDrawUsage));
const spMat = new THREE.PointsMaterial({ size: 0.55, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const sparkPts = new THREE.Points(spGeo, spMat); sparkPts.frustumCulled = false; scene.add(sparkPts);
const sparks = [];
const _sc = new THREE.Color();
export function sparkle(pos, n, color = 0xffe08a, speed = 4, life = 0.7, spread = 0.2) {
  _sc.setHex(color);
  for (let i = 0; i < n; i++) {
    if (sparks.length >= SPK) sparks.shift();
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
    sparks.push({ x: pos.x + rand(-spread, spread), y: pos.y + rand(-spread, spread), z: pos.z + rand(-spread, spread), v, life: rand(life * 0.5, life), max: life, r: _sc.r, g: _sc.g, b: _sc.b });
  }
}
function updateSparks(dt) {
  const P = spGeo.attributes.position.array, C = spGeo.attributes.color.array;
  let n = 0;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.life -= dt;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    const d = Math.exp(-3 * dt); s.v.multiplyScalar(d); s.v.y -= 1.5 * dt;
    s.x += s.v.x * dt; s.y += s.v.y * dt; s.z += s.v.z * dt;
    const k = Math.min(1, s.life / s.max * 1.6);
    P[n * 3] = s.x; P[n * 3 + 1] = s.y; P[n * 3 + 2] = s.z;
    C[n * 3] = s.r * k; C[n * 3 + 1] = s.g * k; C[n * 3 + 2] = s.b * k;
    n++;
  }
  spGeo.setDrawRange(0, n);
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
}

// ---------------- baca dumanı: yumuşak bulut sprite'ları ----------------
const smokeTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.6, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
const puffs = [];
const puffPool = [];
export function puff(x, y, z, dark, vz = 3, vy = 1.2, size = 1.4, life = 2.2) {
  let s = puffPool.pop();
  if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false })); }
  s.material.color.setHex(dark ? 0x3a3438 : 0xf4e6dc);
  s.position.set(x, y, z); s.scale.setScalar(size * 0.5);
  scene.add(s);
  puffs.push({ s, vz, vy, life, max: life, size, dark, ox: rand(-0.6, 0.6) });
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.s); puffPool.push(p.s); puffs.splice(i, 1); continue; }
    const u = 1 - p.life / p.max;
    p.s.position.z += p.vz * dt; p.s.position.y += p.vy * dt; p.s.position.x += p.ox * dt;
    p.s.scale.setScalar(p.size * (0.5 + u * 1.3));
    p.s.material.opacity = (p.dark ? 0.85 : 0.55) * Math.min(1, u * 5) * (1 - u);
  }
}

// ---------------- hız çizgileri ----------------
const LN = 40;
const lnGeo = new THREE.BufferGeometry();
lnGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LN * 6), 3).setUsage(THREE.DynamicDrawUsage));
const lnMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
const lines = new THREE.LineSegments(lnGeo, lnMat); lines.frustumCulled = false; scene.add(lines);
const lnData = Array.from({ length: LN }, () => ({ x: rand(-9, 9), y: rand(-3, 6), z: rand(-40, 0) }));
export function updateSpeedLines(dt, gx, gy, gz, speed, intensity) {
  lnMat.opacity = Math.max(0, Math.min(0.35, intensity * 0.35));
  lines.visible = lnMat.opacity > 0.01;
  if (!lines.visible) return;
  const P = lnGeo.attributes.position.array;
  for (let i = 0; i < LN; i++) {
    const d = lnData[i];
    d.z += speed * 1.4 * dt;
    if (d.z > 6) { d.z = rand(-45, -25); d.x = rand(-10, 10); d.y = rand(-3, 6); if (Math.abs(d.x) < 1.8 && d.y > -1 && d.y < 2) d.x += 4 * Math.sign(d.x || 1); }
    const len = 1.2 + speed * 0.06;
    P[i * 6] = gx + d.x; P[i * 6 + 1] = gy + d.y; P[i * 6 + 2] = gz + d.z;
    P[i * 6 + 3] = gx + d.x; P[i * 6 + 4] = gy + d.y; P[i * 6 + 5] = gz + d.z + len;
  }
  lnGeo.attributes.position.needsUpdate = true;
}

export function updateFx(dt) {
  chunks.update(dt); flats.update(dt); updateSparks(dt); updatePuffs(dt);
}
// ---------------- yolcu lafı (DOM balon) ----------------
// Uçuşta yalnızca simidi kapılan yolcunun lafı yazı olarak çıkar; puan, rüzgâr vb. yazısı yok.
const v3 = new THREE.Vector3();
const popLayer = document.getElementById('pops');
export function popText(text, worldPos, cls = '') {
  v3.copy(worldPos).project(camera);
  if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth}px`; el.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight}px`;
  popLayer.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
export function clearFx() {
  popLayer.textContent = '';
  chunks.clear(); flats.clear(); sparks.length = 0; spGeo.setDrawRange(0, 0);
  for (const p of puffs) { scene.remove(p.s); puffPool.push(p.s); }
  puffs.length = 0;
}
