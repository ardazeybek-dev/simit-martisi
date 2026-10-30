import * as THREE from 'three';
import { rand, pick, canvasTex, Kit } from './util.js';

// ---------------- renk paleti (gün batımı İstanbul) ----------------
// Varsayılan yumuşak pastel; ?pal=old eski koyu, doygun gün batımı (karşılaştırma için)
const OLD_PAL = new URLSearchParams(location.search).get('pal') === 'old';
export const PAL = OLD_PAL ? {
  skyTop: 0x1c2456, skyMid: 0x6a3d7f, skyLow: 0xe0697a, horizon: 0xffc58c,
  fog: 0xf2a27e, sun: 0xfff0c8,
  seaDeep: 0x0d3550, seaShallow: 0x2c7b8f, seaSky: 0xf0a27c, seaFar: 0xb07a92,
  hillFar: 0xb46a86, hillNear: 0x8a4d7a, city: 0x5d3466, cityFar: 0x7b4775,
  bridge: 0x6c3c6e, tower: 0x7d4778, cloud: 0xffc6a0, cloud2: 0xd37c95, hemiSky: 0xffd9c2, hemiGround: 0x30496e, sunLight: 0xffb98a,
} : {
  skyTop: 0x6f7fbf, skyMid: 0xb196c8, skyLow: 0xf2b3b5, horizon: 0xffdcb4,
  fog: 0xf5c9b0, sun: 0xfff6de,
  seaDeep: 0x07607e, seaShallow: 0x33bcbc, seaSky: 0xc9ecef, seaFar: 0x9fcfd6, // berrak turkuaz Boğaz
  hillFar: 0xd2a7bb, hillNear: 0xb98fae, city: 0x9677a3, cityFar: 0xae90b6,
  bridge: 0x9a7aa6, tower: 0xa483ac, cloud: 0xffe0c8, cloud2: 0xe7b2c6, hemiSky: 0xffe6d4, hemiGround: 0x5a7394, sunLight: 0xffcaa2,
};
export const SUN_DIR = new THREE.Vector3(-0.17, 0.11, -0.98).normalize();

export const MOBILE = matchMedia('(pointer: coarse)').matches; // telefon/tablet: daha ucuz gölge, kalite merdiveni farklı (main.js)
// telefonda MSAA kapalı: yüksek piksel yoğunluğunda kenar zaten ince, MSAA ise dolum maliyetini katlar
export const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 60, 260);
export const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

// ---------------- kıvrılan Boğaz ----------------
// Oyun mantığı düz bir koridorda kalır. Çizimde martının ilerisindeki en fazla iki viraj gösterilir:
// [p, q] aralığı k eğrilikli bir yay, öncesi düz, sonrası yeni yönde düz. Makaslama değil gerçek yay:
// vapurlar yan yatmadan döner. Mesafe göz uzayı derinliğinden ölçülür, martının derinliğinde bükülme sıfırdır.
// Sisli malzemeler bükülür; gökyüzü, uzak siluet ve gölge geçişi bükülmez.
export const BEND = { value: new THREE.Vector4(0, 1e4, 1e4, 16) };  // x: eğrilik, y-z: virajın başı ve sonu, w: martının derinliği
export const BEND2 = { value: new THREE.Vector4(0, 1e4, 1e4, 0) }; // ilk virajdan sonraki viraj (S-viraj)
// Bükme kameranın eğiminden arındırılmış yatay çerçevede yapılır (uLevel: göz uzayı → yalnız yönü kalan kamera).
// Göz uzayında bükülse, aşağı bakan kamerada yaklaşan uzak su ekranda ufkun üstüne çıkar, siluetin arkasına deniz bandı biner.
export const LEVEL = { value: new THREE.Matrix3() };
const BEND_GLSL = `
#ifdef USE_FOG
  {
    vec3 lv = uLevel * mvPosition.xyz;
    if (-lv.z > uBend.w) {
      vec2 bxd = bendArc(bendArc(vec2(lv.x, -lv.z - uBend.w), uBend2), uBend);
      lv.x = bxd.x; lv.z = -(bxd.y + uBend.w);
      mvPosition.xyz = lv * uLevel;
    }
  }
#endif
`;
THREE.ShaderChunk.fog_pars_vertex += `
#ifdef USE_FOG
  uniform vec4 uBend, uBend2;
  uniform mat3 uLevel;
  // xd: (yanal x, martıdan derinlik) → yay üzerindeki yeri; b: (k, p, q)
  vec2 bendArc(vec2 xd, vec4 b) {
    if (abs(b.x) < 1e-6 || xd.y <= b.y) return xd;
    float a = b.x * (min(xd.y, b.z) - b.y), c = cos(a), s = sin(a);
    vec2 o = vec2((1.0 - c) / b.x, b.y + s / b.x) + max(0.0, xd.y - b.z) * vec2(s, c);
    return o + xd.x * vec2(c, -s);
  }
#endif`;
THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace('gl_Position', BEND_GLSL + 'gl_Position');
THREE.ShaderLib.sprite.vertexShader = THREE.ShaderLib.sprite.vertexShader.replace('\tgl_Position', BEND_GLSL + '\tgl_Position');
THREE.Material.prototype.onBeforeCompile = function (shader) { shader.uniforms.uBend = BEND; shader.uniforms.uBend2 = BEND2; shader.uniforms.uLevel = LEVEL; };

// ---------------- ışıklar ----------------
export const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.25);
scene.add(hemi);
export const sunLight = new THREE.DirectionalLight(PAL.sunLight, 2.4);
sunLight.shadow.mapSize.set(1024, 1024);
Object.assign(sunLight.shadow.camera, { left: -16, right: 16, top: 26, bottom: -26, near: 1, far: 90 });
sunLight.shadow.bias = -0.0006; sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);
// gölge kutusunu martının etrafında tut (ışık yönü sabit)
export function placeSun(x, z) {
  sunLight.position.set(x - 22, 34, z - 30);
  sunLight.target.position.set(x, 0, z - 8);
}

// ---------------- gökyüzü kubbesi ----------------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(PAL.skyTop) }, mid: { value: new THREE.Color(PAL.skyMid) },
    low: { value: new THREE.Color(PAL.skyLow) }, hor: { value: new THREE.Color(PAL.horizon) },
    sunCol: { value: new THREE.Color(PAL.sun) }, sunDir: { value: SUN_DIR },
  },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform vec3 top, mid, low, hor, sunCol, sunDir; varying vec3 vDir;
    void main(){
      float y = vDir.y;
      vec3 c = mix(hor, low, smoothstep(-0.02, 0.10, y));
      c = mix(c, mid, smoothstep(0.08, 0.30, y));
      c = mix(c, top, smoothstep(0.28, 0.75, y));
      float d = max(dot(normalize(vDir), sunDir), 0.0);
      c += sunCol * (pow(d, 900.0) * 2.2 + pow(d, 40.0) * 0.35 + pow(d, 6.0) * 0.18);
      if (y < -0.02) c = mix(hor, vec3(0.95,0.55,0.45), smoothstep(-0.02,-0.3,y));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
export const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
sky.renderOrder = -10;
scene.add(sky);

// ---------------- uzak dekor: kamerayla birlikte kayar ----------------
export const far = new THREE.Group();
scene.add(far);
const farMats = []; // hava değişince uzak dekor sis tonuna çekilir
export const farShips = []; // ufukta ağır ağır kayan gemi siluetleri (main.js kaydırır)
// uzak dekor yardımcıları: sissiz, hava tonu farMats üzerinden gelir. Köşe tonu (shade) rengi çarpar:
// su hizasında koyu, yukarı açılır; yandan vuran ışıkla kubbe ve kule yuvarlak görünür (düz karton kesik değil, 2.5D)
const basic = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: false, vertexColors: true, ...o }); m.userData.base = c; farMats.push(m); return m; };
const _n = new THREE.Vector3(), SIDE_L = new THREE.Vector3(-0.7, 0.5, 0.3).normalize();
function shade(geo, y0) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const h = Math.min(1, Math.max(0, (y0 + p.getY(i)) / 40)), lit = n ? Math.max(0, _n.fromBufferAttribute(n, i).dot(SIDE_L)) : 0.5;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = (0.76 + 0.24 * h) * (0.84 + 0.24 * lit);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
const add = (geo, m, x, y, z, parent = far) => { if (m.vertexColors) shade(geo, y); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
// su hizasında sis bandı: siluetlerin eteği ufka karışır, arka katman öndekinden soluk kalır
function farHaze(z, h, a = 0.85) {
  const tex = canvasTex(4, 64, (g) => { const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, `rgba(255,255,255,${a})`); g.fillStyle = r; g.fillRect(0, 0, 4, 64); });
  add(new THREE.PlaneGeometry(1500, h), basic(PAL.fog, { map: tex, transparent: true, depthWrite: false, vertexColors: false }), 0, h / 2 - 1, z);
}
const ridge = (z, y0, amp, m, seed) => {
  const sh = new THREE.Shape(); sh.moveTo(-700, -10);
  for (let x = -700; x <= 700; x += 20) sh.lineTo(x, y0 + Math.sin(x * 0.011 + seed) * amp + Math.sin(x * 0.031 + seed * 2) * amp * 0.4);
  sh.lineTo(700, -10);
  return new THREE.ShapeGeometry(sh);
};
const glow = () => canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,230,170,.8)'); r.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
function farClouds() {
  // güneşin önünden geçen ince bulut şeritleri
  const cloudMat = basic(PAL.cloud, { transparent: true, opacity: 0.55, depthWrite: false });
  const cloudMat2 = basic(PAL.cloud2, { transparent: true, opacity: 0.6, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const c = add(new THREE.CircleGeometry(1, 7), i % 3 ? cloudMat2 : cloudMat, rand(-420, 300), rand(70, 190), -600);
    c.scale.set(rand(40, 110), rand(2.5, 6), 1);
  }
}
function farShipsBuild() {
  // ufukta gemiler: şilep, tanker, uzak vapur siluetleri; sise yakın tek renk, yavaşça yan yana kayar
  const mShip = basic(PAL.cityFar), mShipNear = basic(PAL.city);
  const silhouette = kind => {
    const k = new Kit();
    if (kind === 0) { // şilep: konteyner basamakları, kıçta köprüüstü
      k.add(new THREE.BoxGeometry(60, 4, 8), 0, 0, 2, 0);
      for (let x = -22; x < 20; x += 5) k.add(new THREE.BoxGeometry(4.6, rand(2, 6), 7), 0, x, 5, 0);
      k.add(new THREE.BoxGeometry(7, 10, 7), 0, 25, 8, 0); k.add(new THREE.BoxGeometry(1.6, 4, 1.6), 0, 26, 14, 0);
    } else if (kind === 1) { // tanker: alçak uzun gövde, kıçta yüksek köprü
      k.add(new THREE.BoxGeometry(70, 3.5, 9), 0, 0, 1.75, 0);
      k.add(new THREE.BoxGeometry(50, 1, 3), 0, -6, 4, 0);
      k.add(new THREE.BoxGeometry(8, 9, 8), 0, 29, 7, 0); k.add(new THREE.BoxGeometry(1.8, 5, 1.8), 0, 31, 13.5, 0);
    } else if (kind === 2) { // vapur: kısa gövde, ortada baca
      k.add(new THREE.BoxGeometry(26, 3, 6), 0, 0, 1.5, 0); k.add(new THREE.BoxGeometry(16, 2.4, 5), 0, 0, 4.2, 0);
      k.add(new THREE.CylinderGeometry(1, 1.1, 4, 8), 0, 0, 7, 0);
    } else { // yolcu gemisi: basamak basamak yükselen katlar, iki baca
      k.add(new THREE.BoxGeometry(80, 6, 11), 0, 0, 3, 0);
      for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(62 - i * 9, 2.4, 10), 0, 4 - i * 2, 7.2 + i * 2.4, 0);
      for (const x of [-8, 4]) k.add(new THREE.CylinderGeometry(1.8, 2.1, 5, 8), 0, x, 18.5, 0);
    }
    return k.build();
  };
  for (let i = 0; i < 10; i++) {
    const kind = i % 4, near = i < 4, s = add(silhouette(kind), near ? mShipNear : mShip, rand(-300, 300), 0, near ? rand(-255, -215) : rand(-335, -280));
    s.scale.setScalar(near ? rand(0.95, 1.2) : rand(0.75, 0.95)); if (Math.random() < 0.5) s.rotation.y = Math.PI;
    s.userData.v = (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 3.5);
    farShips.push(s);
  }
}
// tepeler üç yandan sarar: virajda bakış dönünce silüet bitip çıplak deniz gökyüzüne yükselmesin. h: tepe yüksekliği
function farRidges(mFar, mNear, mHouses, h = [18, 9, 8, 6]) {
  for (const [ry, seed] of [[0, 0], [Math.PI / 2, 2.7], [-Math.PI / 2, 5.1]]) {
    const pivot = new THREE.Group(); pivot.rotation.y = ry; far.add(pivot);
    add(ridge(-470, h[0], h[1], mFar, 1.3 + seed), mFar, 0, 0, -470, pivot);
    add(ridge(-430, h[2], h[3], mNear, 4.1 + seed), mNear, 0, 0, -430, pivot);
    if (ry) { // yanlarda alçak, seyrek kıyı evleri
      const sc = new THREE.Shape(); sc.moveTo(-650, -5);
      for (let x = -650; x < 650;) { const w = rand(6, 14), hh = Math.random() < 0.3 ? 0 : rand(3, 9); sc.lineTo(x, hh); sc.lineTo(x + w, hh); x += w; }
      sc.lineTo(650, -5);
      add(new THREE.ShapeGeometry(sc), mHouses, 0, 0, -400, pivot);
    }
  }
}
// kıyı şehri silüeti: tek ShapeGeometry'de binalar
function farSkyline(m, z, hMin, hMax, y = 0) {
  const city = new THREE.Shape(); city.moveTo(-600, -5);
  for (let x = -600; x < 600;) { const w = rand(5, 12), h = rand(hMin, hMax); city.lineTo(x, h); city.lineTo(x + w, h); x += w; }
  city.lineTo(600, -5);
  add(new THREE.ShapeGeometry(city), m, 0, y, z);
}
// silüetin önünde rastgele pencere ışıkları
function farLights(n, x0, x1, y0, y1, z, tex) {
  const cl = [];
  for (let i = 0; i < n; i++) cl.push(rand(x0, x1), rand(y0, y1), z);
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
  far.add(new THREE.Points(cg, new THREE.PointsMaterial({ map: tex, color: 0xffc070, size: 3.2, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
}

function buildIstanbul() {
  const mFarHill = basic(PAL.hillFar), mHill = basic(PAL.hillNear), mCity = basic(PAL.city), mCityFar = basic(PAL.cityFar);

  farClouds();

  // Anadolu yakası tepeleri: iki kat, sis rengine yakın; aralarında ve eteklerinde sis
  farRidges(mFarHill, mHill, mCityFar);
  farHaze(-450, 16); farHaze(-415, 10, 0.7);

  // tarihi yarımada silüeti: arkada soluk, yüksek; önde koyu, alçak sıra
  farSkyline(mCityFar, -404, 8, 22);
  farSkyline(mCity, -390, 5, 16);

  // cami: kubbe + yarım kubbeler + şerefeli minareler
  const dome = (r, m, x, y, z) => add(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, x, y, z);
  const minaret = (m, x, y, z, s) => {
    add(new THREE.CylinderGeometry(0.9 * s, 1.1 * s, 40 * s, 8), m, x, y + 20 * s, z);
    add(new THREE.CylinderGeometry(1.7 * s, 1.2 * s, 1.4 * s, 8), m, x, y + 27 * s, z);
    add(new THREE.CylinderGeometry(1.5 * s, 1.1 * s, 1.2 * s, 8), m, x, y + 35 * s, z);
    add(new THREE.ConeGeometry(1.15 * s, 9 * s, 8), m, x, y + 44.5 * s, z);
  };
  const mosque = (x, s, m, z) => {
    add(new THREE.BoxGeometry(36 * s, 12 * s, 16), m, x, 6 * s, z);
    add(new THREE.CylinderGeometry(10 * s, 11 * s, 5 * s, 16), m, x, 14 * s, z);
    dome(10.5 * s, m, x, 16 * s, z);
    add(new THREE.ConeGeometry(0.7 * s, 4 * s, 6), m, x, 28.5 * s, z);
    for (const dx of [-11, 11]) dome(6.2 * s, m, x + dx * s, 12 * s, z);
    for (const dx of [-16, -6, 6, 16]) dome(2.4 * s, m, x + dx * s, 12 * s, z + 3);
    for (const dx of [-21, 21]) minaret(m, x + dx * s, 0, z, s);
  };
  mosque(70, 1.25, mCity, -385);
  mosque(-250, 0.95, mCityFar, -405);
  mosque(230, 0.8, mCityFar, -410);

  // Galata Kulesi
  const gx = 150, gz = -380, gm = mCity;
  add(new THREE.CylinderGeometry(5.2, 6.2, 34, 14), gm, gx, 17, gz);
  add(new THREE.CylinderGeometry(6.6, 6.6, 1.6, 14), gm, gx, 34.8, gz);
  add(new THREE.CylinderGeometry(5.4, 5.4, 4, 14), gm, gx, 37.5, gz);
  add(new THREE.ConeGeometry(5.9, 13, 14), gm, gx, 46, gz);
  add(new THREE.CylinderGeometry(0.15, 0.15, 4, 4), gm, gx, 54, gz);
  // kulenin pencere ışıkları
  const winMat = basic(0xffd27a);
  for (let i = 0; i < 10; i++) {
    const a = -0.6 + i * 0.13;
    const w = add(new THREE.PlaneGeometry(0.8, 1.3), winMat, gx + Math.sin(a) * 5.45, 37.5, gz + Math.cos(a) * 5.45);
    w.rotation.y = a;
  }

  // Boğaz Köprüsü: iki ayak, tabla, ana kablolar ve askılar
  const bm = basic(PAL.bridge);
  const bx0 = -170, bx1 = -60, bz = -360, top = 66, deck = 22;
  for (const x of [bx0, bx1]) {
    for (const dz of [-1.6, 1.6]) add(new THREE.BoxGeometry(2.2, top, 1.4), bm, x, top / 2, bz + dz);
    add(new THREE.BoxGeometry(2.4, 1.4, 4.6), bm, x, top - 4, bz);
    add(new THREE.BoxGeometry(2.4, 1.4, 4.6), bm, x, deck + 14, bz);
  }
  add(new THREE.BoxGeometry(260, 1.6, 4), bm, -115, deck, bz);
  const hangerGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
  for (const [a, b, ya, yb] of [[-245, bx0, deck, top], [bx0, bx1, top, top], [bx1, 15, top, deck]]) {
    const mid = (a + b) / 2, low = (a === bx0 ? deck + 3 : (ya + yb) / 2 - 6);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a, ya, bz), new THREE.Vector3(mid, a === bx0 ? 2 * low - top : low, bz), new THREE.Vector3(b, yb, bz));
    add(new THREE.TubeGeometry(curve, 30, 0.35, 4), bm, 0, 0, 0);
    for (let k = 1; k < 14; k++) {
      const p = curve.getPoint(k / 14);
      if (p.y - deck < 1) continue;
      const h = add(hangerGeo, bm, p.x, (p.y + deck) / 2, bz); h.scale.y = p.y - deck;
    }
  }
  // köprü ışıkları
  const dots = [];
  for (let x = -240; x < 12; x += 6) dots.push(x, deck + 1.2, bz + 2.2);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  const glowTex = glow();
  far.add(new THREE.Points(lg, new THREE.PointsMaterial({ map: glowTex, color: 0xffe2a0, size: 5, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));


  farLights(260, -560, 560, 1, 12, -388, glowTex); // şehir ışıkları
  farShipsBuild();

  // Kız Kulesi: küçük adacıkta
  const kx = 260, kz = -300, km = basic(PAL.tower);
  add(new THREE.CylinderGeometry(9, 11, 2, 10), km, kx, 0, kz);
  add(new THREE.BoxGeometry(9, 6, 7), km, kx - 1, 4, kz);
  add(new THREE.CylinderGeometry(2.2, 2.4, 13, 8), km, kx + 2, 8.5, kz);
  add(new THREE.ConeGeometry(2.8, 5, 8), km, kx + 2, 17.5, kz);
  add(new THREE.PlaneGeometry(0.9, 0.9), winMat, kx + 2, 13, kz + 2.45);
}

// ---------------- İzmir: Kordon, Konak Saat Kulesi, Kadifekale, Bayraklı kuleleri ----------------
function buildIzmir() {
  const mFarHill = basic(PAL.hillFar), mHill = basic(PAL.hillNear), mCity = basic(PAL.city), mCityFar = basic(PAL.cityFar);
  const mTower = basic(PAL.tower), mGlass = basic(PAL.bridge), winMat = basic(0xffe0a0);
  farClouds();
  // Yamanlar ve Kadifekale: Boğaz'dan yüksek, sarı-zeytin tepeler
  farRidges(mFarHill, mHill, mCityFar, [30, 13, 12, 7]);
  farHaze(-450, 18); farHaze(-412, 10, 0.7);
  // Kadifekale: şehrin arkasındaki tepede surlar
  const kx = -190, kz = -415;
  const hill = new THREE.Shape(); hill.moveTo(-110, -5);
  for (let x = -110; x <= 110; x += 10) hill.lineTo(x, 26 * Math.cos((x / 110) * Math.PI / 2) ** 1.4 + Math.sin(x * 0.2) * 0.8);
  hill.lineTo(110, -5);
  add(new THREE.ShapeGeometry(hill), mHill, kx, 0, kz);
  const wall = new Kit();
  for (let x = -34; x <= 34; x += 4) {
    const y = 26 * Math.cos((x / 110) * Math.PI / 2) ** 1.4;
    wall.add(new THREE.BoxGeometry(4.1, 4, 2), 0, x, y + 1.5, 0);
    if (Math.abs(x) % 8 === 2) wall.add(new THREE.BoxGeometry(1.6, 1.4, 2), 0, x - 1, y + 4.2, 0); // mazgal
  }
  for (const x of [-34, -12, 14, 34]) { const y = 26 * Math.cos((x / 110) * Math.PI / 2) ** 1.4; wall.add(new THREE.BoxGeometry(5, 8, 4), 0, x, y + 3.5, 0); }
  add(wall.build(), mTower, kx, 0, kz + 3);
  // alçak kıyı şehri (Konak, Alsancak): arkada soluk ikinci sıra
  farSkyline(mCityFar, -402, 6, 16);
  farSkyline(mCity, -392, 3, 11);
  // Bayraklı kuleleri: körfezin sağında cam gökdelenler
  const bay = new Kit();
  for (const [x, w, h] of [[95, 9, 46], [112, 11, 64], [128, 8, 38], [142, 12, 76], [160, 9, 52], [178, 10, 44], [194, 8, 58]]) {
    bay.add(new THREE.BoxGeometry(w, h, 9), 0, x, h / 2, 0);
    bay.add(new THREE.BoxGeometry(w * 0.6, 3, 6), 0, x, h + 1.5, 0); // tepe
  }
  bay.add(new THREE.CylinderGeometry(5.5, 6.5, 70, 10), 0, 212, 35, 0);
  bay.add(new THREE.CylinderGeometry(0.25, 0.25, 12, 4), 0, 142, 84, 0); // anten
  add(bay.build(), mGlass, 0, 0, -398);
  // Asansör: yokuşta tuğla kule
  add(new THREE.BoxGeometry(5, 24, 5), mTower, -120, 12, -386);
  add(new THREE.BoxGeometry(9, 4, 6), mTower, -120, 26, -386);
  // Konak Saat Kulesi: sekizgen, üç kat, tepede küçük kubbe
  const tx = -25, tz = -372, S = 2.3;
  const oct = (rt, rb, h, y) => add(new THREE.CylinderGeometry(rt * S, rb * S, h * S, 8), mTower, tx, y * S, tz);
  oct(4.6, 5.2, 1.6, 0.8);   // kaide
  oct(3.9, 4.1, 8, 5.6);     // 1. kat
  oct(4.5, 4.5, 0.8, 10);    // kat silmesi
  oct(3.2, 3.4, 7, 13.9);    // 2. kat
  oct(3.8, 3.8, 0.7, 17.7);
  oct(2.6, 2.8, 5.4, 20.8);  // saat katı
  oct(3.1, 3.1, 0.6, 23.8);
  oct(1.9, 2.1, 3.4, 25.8);  // fener
  add(new THREE.SphereGeometry(2.1 * S, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mTower, tx, 27.5 * S, tz);
  add(new THREE.ConeGeometry(0.35 * S, 3 * S, 6), mTower, tx, 30.3 * S, tz);
  for (const a of [0, Math.PI / 2, -Math.PI / 2]) { // saat kadranları
    const c = add(new THREE.CircleGeometry(1.3 * S, 16), winMat, tx + Math.sin(a) * 2.75 * S, 20.8 * S, tz + Math.cos(a) * 2.75 * S); c.rotation.y = a;
  }
  for (const dx of [-7, 7]) add(new THREE.CylinderGeometry(1.6, 2, 3, 8), mTower, tx + dx * S, 1.5, tz + 2); // çeşmeler
  // Konak Yalı Camii: tek kubbeli küçük sekizgen cami, tek minare
  const cx = -70, cz = -378;
  add(new THREE.CylinderGeometry(6, 6, 7, 8), mCity, cx, 3.5, cz);
  add(new THREE.SphereGeometry(6.2, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mCity, cx, 7, cz);
  add(new THREE.CylinderGeometry(0.9, 1.1, 26, 8), mCity, cx + 9, 13, cz);
  add(new THREE.CylinderGeometry(1.6, 1.1, 1.2, 8), mCity, cx + 9, 21, cz);
  add(new THREE.ConeGeometry(1.1, 6, 8), mCity, cx + 9, 29, cz);
  // Kordon palmiyeleri: kıyı boyunca, eğik gövdeler, aralıkları düzensiz
  const palms = new Kit();
  for (let x = -420; x < 440; x += rand(9, 24)) {
    if (Math.abs(x - tx) < 16) continue;
    const h = rand(7, 11), lean = rand(-0.12, 0.12), top = [x + Math.sin(lean) * h, h];
    palms.add(new THREE.CylinderGeometry(0.28, 0.45, h, 5), 0, x + Math.sin(lean) * h / 2, h / 2, 0, 0, 0, -lean);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + rand(-0.3, 0.3);
      palms.add(new THREE.ConeGeometry(0.5, 4.2, 3), 0, top[0] + Math.cos(a) * 1.7, top[1] - 0.5, Math.sin(a) * 1.7, Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9);
    }
  }
  add(palms.build(), mCity, 0, 0, -366);
  const glowTex = glow();
  farLights(200, -560, 560, 1, 9, -390, glowTex);
  farShipsBuild();
}

// ---------------- Antalya: karlı Toroslar, falezler üstünde şehir, Kaleiçi limanı, Yivli Minare, Düden şelalesi, Konyaaltı ----------------
function buildAntalya() {
  const mFarHill = basic(PAL.hillFar), mHill = basic(PAL.hillNear), mCity = basic(PAL.city), mCityFar = basic(PAL.cityFar);
  const mTower = basic(PAL.tower), mCliff = basic(0xc99e6e), mSand = basic(0xeedcb2), mSnow = basic(0xf6f8fb), mFoam = basic(0xf2fbff);
  farClouds();
  farRidges(mFarHill, mHill, mCityFar, [40, 14, 10, 5]);
  // Toroslar: önceki sırtın ardından yükselen sivri, düzensiz zirveler; tepeleri karlı
  const peaks = [];
  for (let x = -700, y = 70; x <= 700; x += rand(10, 22)) { y = Math.max(46, Math.min(104, y + rand(-13, 13) + (78 - y) * 0.15)); peaks.push([x, y]); }
  const mtn = new THREE.Shape(); mtn.moveTo(-700, -5); for (const [x, y] of peaks) mtn.lineTo(x, y); mtn.lineTo(700, -5);
  add(new THREE.ShapeGeometry(mtn), basic(0xb4c0d0), 0, 0, -490);
  // kar: zirve ile düzensiz kar sınırı arasında şerit; sınırın altında kalan zirvede alan sıfır (tek parça Shape üçgenlenemiyor, dörtgenler elle)
  const SNOW = 80, line = peaks.map(([, y]) => Math.min(y, SNOW + rand(-5, 5))), sv = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x0, t0] = peaks[i], [x1, t1] = peaks[i + 1], b0 = line[i], b1 = line[i + 1];
    if (t0 <= b0 && t1 <= b1) continue;
    sv.push(x0, b0, 0, x1, b1, 0, x1, t1, 0, x0, b0, 0, x1, t1, 0, x0, t0, 0);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); sg.computeVertexNormals();
  add(sg, mSnow, 0, 0, -489);
  farHaze(-480, 40, 0.75); farHaze(-450, 16); farHaze(-415, 10, 0.6);
  // falez: şehrin oturduğu dik kayalık; solda Konyaaltı'na inip kumsala döner, Kaleiçi limanında çentik
  const cliffY = x => (x < -230 ? 1.2 : x < -180 ? 1.2 + (x + 230) / 50 * 11 : 12.2 + Math.sin(x * 0.07) * 0.6 + rand(-0.4, 0.4)) - (x > -30 && x < 50 ? 7 : 0);
  const cl = new THREE.Shape(); cl.moveTo(-620, -5);
  for (let x = -620; x <= 620; x += 4) cl.lineTo(x, cliffY(x));
  cl.lineTo(620, -5);
  add(new THREE.ShapeGeometry(cl), mCliff, 0, 0, -384);
  add(new THREE.BoxGeometry(420, 1.4, 2), mSand, -420, 0.5, -383); // Konyaaltı kumsalı
  const dots = [], cols = [];
  for (let x = -600; x < -240; x += rand(3, 7)) { dots.push(x, 2.4, -382); const c = new THREE.Color(pick([0xe5484d, 0x2f7fd6, 0xf2b22c, 0xffffff, 0x2e9c6a])); cols.push(c.r, c.g, c.b); } // şemsiyeler
  const ug = new THREE.BufferGeometry(); ug.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3)); ug.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  far.add(new THREE.Points(ug, new THREE.PointsMaterial({ size: 2.6, vertexColors: true, fog: false, sizeAttenuation: true })));
  // falezin üstünde beyaz apartmanlar (arkada Lara otelleri yüksek), Kaleiçi'nde alçak kırmızı damlar
  farSkyline(mCityFar, -396, 8, 26, 10);
  farSkyline(mCity, -389, 3, 12, 10);
  // Yivli Minare: yivli tuğla gövde, şerefe, kurşun külah
  const yx = 8, yb = cliffY(yx) + 2;
  add(new THREE.CylinderGeometry(1.7, 2.1, 30, 16), mTower, yx, yb + 15, -386);
  add(new THREE.CylinderGeometry(2.6, 1.8, 1.4, 16), mTower, yx, yb + 25, -386);
  add(new THREE.CylinderGeometry(1.3, 1.5, 4, 12), mTower, yx, yb + 32, -386);
  add(new THREE.ConeGeometry(1.5, 5, 12), mCityFar, yx, yb + 36.5, -386);
  // Hıdırlık Kulesi: falez ucunda yuvarlak taş kule
  add(new THREE.CylinderGeometry(6, 6.6, 9, 18), mTower, 64, cliffY(64) + 4.5, -383);
  add(new THREE.CylinderGeometry(4, 4.2, 6, 16), mTower, 64, cliffY(64) + 12, -383);
  // Kaleiçi limanı: suda gulet direkleri
  for (let x = -24; x < 46; x += rand(5, 9)) { add(new THREE.BoxGeometry(6, 1.4, 2), mCity, x, 0.7, -380); add(new THREE.CylinderGeometry(0.12, 0.12, rand(8, 12), 4), mCity, x, 6, -380); }
  // Düden şelalesi: falezden denize dökülen beyaz perde, dibinde köpük
  const dx = 190, dy = cliffY(dx);
  add(new THREE.PlaneGeometry(14, dy), mFoam, dx, dy / 2, -382.5);
  for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(rand(2, 3.4), 10, 6), mFoam, dx + rand(-8, 8), 0.3, -381);
  // palmiyeler falez boyunca
  const palms = new Kit();
  for (let x = -420; x < 460; x += rand(10, 26)) {
    const y0 = cliffY(x), h = rand(6, 9), lean = rand(-0.12, 0.12), tx = x + Math.sin(lean) * h;
    palms.add(new THREE.CylinderGeometry(0.28, 0.45, h, 5), 0, x + Math.sin(lean) * h / 2, y0 + h / 2, 0, 0, 0, -lean);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + rand(-0.3, 0.3); palms.add(new THREE.ConeGeometry(0.5, 4.2, 3), 0, tx + Math.cos(a) * 1.7, y0 + h - 0.5, Math.sin(a) * 1.7, Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9); }
  }
  add(palms.build(), mHill, 0, 0, -384.5);
  const glowTex = glow();
  farLights(160, -300, 560, 12, 24, -390, glowTex);
  farShipsBuild();
}

// Uzak dekor yüzlerce küçük parçadan kurulur (her biri ayrı çizim çağrısı: telefonu en çok yoran şey).
// Kurulduktan sonra aynı malzemeyi paylaşan opak, sabit parçalar tek gövdede birleşir; kayan gemiler (farShips) ayrı kalır.
function mergeFar() {
  far.updateMatrixWorld(true);
  const inv = far.matrixWorld.clone().invert(), groups = new Map(), moving = new Set();
  for (const s of farShips) s.traverse(o => moving.add(o));
  far.traverse(o => {
    if (!o.isMesh || moving.has(o) || o.material.transparent || Array.isArray(o.material) || o.renderOrder) return;
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(o);
  });
  const m4 = new THREE.Matrix4();
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const names = mat.map ? ['position', 'uv'] : ['position'];
    if (mat.vertexColors) names.push('color');
    const parts = [];
    for (const o of list) {
      if (names.some(n => !o.geometry.attributes[n])) continue;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      parts.push({ o, g });
    }
    if (parts.length < 2) continue;
    const merged = new THREE.BufferGeometry();
    for (const n of names) {
      const size = parts[0].g.attributes[n].itemSize, arr = new Float32Array(parts.reduce((t, p) => t + p.g.attributes[n].count * size, 0));
      let off = 0;
      for (const p of parts) { const a = p.g.attributes[n]; for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[off++] = a.array[i * size + k]; }
      merged.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    merged.computeBoundingSphere();
    for (const p of parts) { p.g.dispose(); p.o.geometry.dispose(); p.o.removeFromParent(); }
    far.add(new THREE.Mesh(merged, mat));
  }
}

// şehir değişince uzak dekor baştan kurulur (yalnız menüde, uçuşta asla). Renkler İstanbul'un üstüne yazılır.
const BASE_PAL = { ...PAL };
const CITY_PAL = {
  istanbul: {},
  izmir: { // Ege ikindisi: açık mavi gök, altın ufuk, lacivert körfez, sarı-zeytin tepeler
    skyTop: 0x5b8ccc, skyMid: 0x9fc3e3, skyLow: 0xf5d3a6, horizon: 0xffe4b4, fog: 0xf1dcc2, sun: 0xfff3d4,
    seaDeep: 0x0b4f84, seaShallow: 0x2e9cc0, seaSky: 0xcfe7f1, seaFar: 0xa7c9dd,
    hillFar: 0xcbb79c, hillNear: 0xab9877, city: 0x9a8e93, cityFar: 0xb4a9ab, bridge: 0x8fa2b8, tower: 0xa58a78,
    cloud: 0xfff2de, cloud2: 0xf2d8c4, hemiSky: 0xfff0dc, hemiGround: 0x587aa0, sunLight: 0xffd6a6,
  },
  antalya: { // Akdeniz öğleden sonrası: derin mavi gök, berrak açık turkuaz sığ su, mavi-gri Toroslar, krem falezler
    skyTop: 0x3f8ad6, skyMid: 0x8cc6ee, skyLow: 0xd9f0f5, horizon: 0xf6f1de, fog: 0xdcecf0, sun: 0xfffbe8,
    seaDeep: 0x0a78a6, seaShallow: 0x5fe6dc, seaSky: 0xdaf6f8, seaFar: 0xa9dfe8,
    hillFar: 0xa9b7c6, hillNear: 0x8b9c88, city: 0xa99e93, cityFar: 0xc4bdb6, bridge: 0x9fb6c6, tower: 0xa86a52,
    cloud: 0xffffff, cloud2: 0xeaf2f8, hemiSky: 0xf2f8ff, hemiGround: 0x4f8fa8, sunLight: 0xfff0d0,
  },
};
const FAR = { istanbul: buildIstanbul, izmir: buildIzmir, antalya: buildAntalya };
let farCity = null;
export function setCityLook(id) {
  if (id === farCity) return;
  farCity = id;
  Object.assign(PAL, BASE_PAL, CITY_PAL[id]);
  far.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  far.clear(); farMats.length = 0; farShips.length = 0;
  (FAR[id] || FAR.istanbul)();
  mergeFar();
  hemi.groundColor.setHex(PAL.hemiGround); sunLight.color.setHex(PAL.sunLight);
}

// ---------------- deniz (GPU'da dalga, Fresnel + güneş parıltısı) ----------------
const WATER_W = 300, WATER_D = 420, SEG_X = MOBILE ? 60 : 90, SEG_Z = MOBILE ? 84 : 130; // telefonda daha seyrek su ağı
export const CELL = WATER_D / SEG_Z;
// Dalga argümanları küçük tutulur: p suyun merkezine göre yerel (uOrigin), fazlar (k·origin + ω·t) CPU'da 2π'ye sarılır.
// Dünya koordinatı Boğaz boyunca on binlere çıkar; telefon GPU'su o büyüklükte sin()'i bozuk hesaplar (su kumlanır).
const WAVE = `
  uniform vec2 uOrigin; uniform vec3 uPh; uniform vec4 uRp;
  float wave(vec2 p){
    return sin(p.x*0.16 + p.y*0.11 + uPh.x)*0.36
         + sin(p.x*0.33 - p.y*0.07 + uPh.y)*0.17
         + sin(p.x*0.71 + p.y*0.53 + uPh.z)*0.06;
  }
  // eğim türevden: dört kez wave() yerine üç cos (telefonda piksel başına ucuz)
  vec2 waveGrad(vec2 p){
    float c1 = cos(p.x*0.16 + p.y*0.11 + uPh.x)*0.36, c2 = cos(p.x*0.33 - p.y*0.07 + uPh.y)*0.17, c3 = cos(p.x*0.71 + p.y*0.53 + uPh.z)*0.06;
    return vec2(c1*0.16 + c2*0.33 + c3*0.71, c1*0.11 - c2*0.07 + c3*0.53);
  }`;
// [kx, kz, ω]: dalgalar (uPh) ve ince kırışıklar (uRp); CPU fazı ile shader aynı tabloyu kullanır
const WAVES = [[0.16, 0.11, 1.3], [0.33, -0.07, 2.0], [0.71, 0.53, 2.9]];
const RIPS = [[2.3, 0, 3.1], [0.7, 1.9, -2.4], [0, 2.7, 2.6], [1.3, 0.9, -3.3]];
const waterMat = new THREE.ShaderMaterial({
  fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uOrigin: { value: new THREE.Vector2() }, uPh: { value: new THREE.Vector3() }, uRp: { value: new THREE.Vector4() },
    uDeep: { value: new THREE.Color(PAL.seaDeep) }, uShallow: { value: new THREE.Color(PAL.seaShallow) },
    uSky: { value: new THREE.Color(PAL.seaSky) }, uSun: { value: new THREE.Color(0xffe2b0) },
    uSunDir: { value: SUN_DIR.clone() }, uFar: { value: new THREE.Color(PAL.seaFar) },
  }]),
  vertexShader: `${WAVE}
    varying vec3 vWorld; varying float vH;
    #include <fog_pars_vertex>
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      // uzakta dalga söner: virajda bükülen ufuk kabarmaz, sakin bir çizgi kalır
      float h = wave(wp.xz - uOrigin) * (1.0 - smoothstep(90.0, 190.0, length(wp.xz - cameraPosition.xz)));
      #ifdef FLAT
        h = 0.0;
      #endif
      wp.y += h; vH = h; vWorld = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      ${BEND_GLSL}
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `${WAVE}
    uniform vec3 uDeep, uShallow, uSky, uSun, uSunDir, uFar;
    varying vec3 vWorld; varying float vH;
    #include <fog_pars_fragment>
    void main(){
      vec2 p = vWorld.xz - uOrigin, gr = waveGrad(p);
      float hx = gr.x, hz = gr.y;
      vec2 rip = vec2(sin(p.x*2.3 + uRp.x) + sin(p.y*1.9 + p.x*0.7 + uRp.y),
                      sin(p.y*2.7 + uRp.z) + sin(p.x*1.3 + p.y*0.9 + uRp.w)) * 0.07;
      vec3 n = normalize(vec3(-hx + rip.x, 1.0, -hz + rip.y));
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
      vec3 col = mix(uDeep, uShallow, smoothstep(-0.45, 0.55, vH));
      col = mix(col, uSky, clamp(fres * 0.9, 0.0, 0.6)); // yansıma suyu boğmasın: turkuaz okunur
      vec3 r = reflect(-v, n);
      float s = max(dot(r, uSunDir), 0.0);
      col += uSun * (pow(s, 140.0) * 1.7 + pow(s, 12.0) * 0.14);
      float crest = smoothstep(0.42, 0.58, vH + rip.x * 0.6);
      col = mix(col, vec3(0.93, 1.0, 0.98), crest * 0.3);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      // uzak su sis rengine (şeftali) değil puslu deniz rengine solar: siluetin dibine kadar su gibi okunur
      #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uFar, 1.0)).rgb, smoothstep(fogNear, fogFar, vFogDepth)); // renk çıktı uzayında: gökle aynı tonda
      #endif
    }`,
});
const waterGeo = new THREE.PlaneGeometry(WATER_W, WATER_D, SEG_X, SEG_Z);
waterGeo.rotateX(-Math.PI / 2);
export const water = new THREE.Mesh(waterGeo, waterMat);
water.frustumCulled = false;
scene.add(water);
// açık deniz: dalgalı suyun altında geniş, düz bir katman. Virajda dalgalı suyun yan kenarı görüşe döndüğünde
// arkasında gökyüzü değil deniz görünür. Aynı shader ve uniform'lar, yalnız dalgasız.
const seaMat = new THREE.ShaderMaterial({ fog: true, uniforms: waterMat.uniforms, vertexShader: waterMat.vertexShader, fragmentShader: waterMat.fragmentShader, defines: { FLAT: '' } });
const seaGeo = new THREE.PlaneGeometry(1600, 1600, 48, 48); seaGeo.rotateX(-Math.PI / 2);
const sea = new THREE.Mesh(seaGeo, seaMat);
sea.position.y = -0.65; sea.frustumCulled = false; sea.renderOrder = -1;
scene.add(sea);
// CPU tarafı aynı dalga (gölge ve sıçrama yüksekliği için)
export const waveAt = (x, z, t) => Math.sin(x * 0.16 + z * 0.11 + t * 1.3) * 0.36 + Math.sin(x * 0.33 - z * 0.07 + t * 2.0) * 0.17;
export function updateWater(t, cx, cz) {
  water.position.z = Math.round((cz - 150) / CELL) * CELL;
  water.position.x = Math.round(cx / CELL) * CELL;
  sea.position.x = water.position.x; sea.position.z = water.position.z - 300;
  const ox = water.position.x, oz = water.position.z, U = waterMat.uniforms, TAU = Math.PI * 2;
  const ph = ([kx, kz, w]) => (((kx * ox + kz * oz + w * t) % TAU) + TAU) % TAU;
  U.uOrigin.value.set(ox, oz);
  U.uPh.value.set(ph(WAVES[0]), ph(WAVES[1]), ph(WAVES[2]));
  U.uRp.value.set(ph(RIPS[0]), ph(RIPS[1]), ph(RIPS[2]), ph(RIPS[3]));
}

// virajda yön değişince güneş, gökyüzü ve sudaki parıltı birlikte döner (uzak siluet main.js'te)
const Y_AXIS = new THREE.Vector3(0, 1, 0);
export function setHeading(yaw) {
  sky.rotation.y = yaw;
  waterMat.uniforms.uSunDir.value.copy(SUN_DIR).applyAxisAngle(Y_AXIS, yaw);
}

// ---------------- hava tonu ----------------
// tint: hedef renk, amt: ne kadar karışır, sun: güneş/parıltı gücü; fog: [near, far]
const WEATHER = {
  clear: { farFog: 0, tint: 0xffffff, amt: 0, sun: 1, fog: [60, 260] },
  rain: { farFog: 0.3, tint: 0x8c96ab, amt: 0.5, sun: 0.45, fog: [45, 230] },
  snow: { farFog: 0.55, tint: 0xe2e8f2, amt: 0.55, sun: 0.7, fog: [40, 220] },
  fog: { farFog: 1, tint: 0xe9e6e8, amt: 0.72, sun: 0.55, fog: [14, 135] },
};
const _t = new THREE.Color();
const toned = (hex, w) => new THREE.Color(hex).lerp(_t, w.amt);
export function applyWeather(kind) {
  const w = WEATHER[kind] || WEATHER.clear; _t.setHex(w.tint);
  const u = skyMat.uniforms;
  u.top.value.copy(toned(PAL.skyTop, w)); u.mid.value.copy(toned(PAL.skyMid, w)); u.low.value.copy(toned(PAL.skyLow, w)); u.hor.value.copy(toned(PAL.horizon, w));
  u.sunCol.value.setHex(PAL.sun).multiplyScalar(w.sun);
  scene.fog.color.copy(toned(PAL.fog, w)); scene.fog.near = w.fog[0]; scene.fog.far = w.fog[1];
  const wu = waterMat.uniforms;
  wu.uSky.value.copy(toned(PAL.seaSky, w)); wu.uFar.value.copy(toned(PAL.seaFar, w)).lerp(scene.fog.color, w.farFog); wu.uSun.value.setHex(0xffe2b0).multiplyScalar(w.sun);
  wu.uDeep.value.copy(toned(PAL.seaDeep, { amt: w.amt * 0.4 })); wu.uShallow.value.copy(toned(PAL.seaShallow, { amt: w.amt * 0.4 }));
  sunLight.intensity = 2.4 * (0.5 + w.sun * 0.5); hemi.color.copy(toned(PAL.hemiSky, w));
  for (const m of farMats) m.color.copy(toned(m.userData.base, { amt: Math.min(0.85, w.amt * (kind === 'fog' ? 1.6 : 1.1)) }));
}
