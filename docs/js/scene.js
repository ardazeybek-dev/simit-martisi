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
// telefonda da MSAA: karo tabanlı telefon GPU'larında ucuz; kapalıyken hızlı virajlarda kenarlar titreşip pikselli görünüyordu
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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
// Bükme dünya çerçevesinde yapılır (uLevel: göz uzayı → dünya eksenleri, yanal başlangıç şeridin ortası).
// Göz uzayında bükülse, aşağı bakan kamerada uzak su ufkun üstüne çıkar; kameranın yönünde bükülse direksiyonla her dönüşte uzak gemiler lastik gibi uzayıp kısalır.
export const LEVEL = { value: new THREE.Matrix3() };
const BEND_GLSL = `
#ifdef USE_FOG
  {
    vec3 lv = uLevel * mvPosition.xyz; // dünya eksenlerinde kameradan uzaklık
    if (-lv.z > uBend.w) {
      vec2 bxd = bendArc(bendArc(vec2(lv.x + uBend2.w, -lv.z - uBend.w), uBend2), uBend); // yanal: şeridin ortasından (uBend2.w = kameranın x'i)
      lv.x = bxd.x - uBend2.w; lv.z = -(bxd.y + uBend.w);
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
// güverte lambaları: yağmurda vapur güvertesini gerçekten aydınlatan sahte nokta ışıklar (shiplights.js tickLamps doldurur).
// Gerçek PointLight eklemek ışık sayısını değiştirip bütün malzemeleri yeniden derletirdi; bu döngü uLampN = 0 iken hemen çıkar (açık havada bedava).
// Konum bükülmemiş göz uzayında (vLampP): lamba da gemiyle aynı çerçevede, virajda kaymaz.
export const LAMPS = { value: Array.from({ length: 10 }, () => new THREE.Vector4()) }, LAMP_N = { value: 0 }, LAMP_C = { value: new THREE.Color(0, 0, 0) };
THREE.ShaderChunk.fog_pars_vertex += `
#ifdef USE_FOG
  varying vec3 vLampP;
#endif`;
THREE.ShaderChunk.fog_pars_fragment += `
#ifdef USE_FOG
  varying vec3 vLampP;
  uniform vec4 uLamps[10];
  uniform float uLampN;
  uniform vec3 uLampC;
#endif`;
THREE.ShaderChunk.lights_fragment_end += `
#ifdef USE_FOG
  for (int i = 0; i < 10; i++) {
    if (float(i) >= uLampN) break;
    vec3 ld = uLamps[i].xyz - vLampP; float rr = uLamps[i].w, la = max(0.0, 1.0 - dot(ld, ld) / (rr * rr));
    reflectedLight.directDiffuse += diffuseColor.rgb * uLampC * (la * la) * (0.35 + 0.65 * max(dot(normal, normalize(ld)), 0.0));
  }
#endif`;
THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace('gl_Position', '#ifdef USE_FOG\n  vLampP = mvPosition.xyz;\n#endif\n' + BEND_GLSL + 'gl_Position');
THREE.ShaderLib.sprite.vertexShader = THREE.ShaderLib.sprite.vertexShader.replace('\tgl_Position', BEND_GLSL + '\tgl_Position');
THREE.Material.prototype.onBeforeCompile = function (shader) { shader.uniforms.uBend = BEND; shader.uniforms.uBend2 = BEND2; shader.uniforms.uLevel = LEVEL; shader.uniforms.uLamps = LAMPS; shader.uniforms.uLampN = LAMP_N; shader.uniforms.uLampC = LAMP_C; };

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
export const farShips = [];
export const FAR_SHIP_W = 420; // ufuk gemileri ±bu kadar kayar, sonra ekran dışındayken öbür uca geçer // ufukta ağır ağır kayan gemi siluetleri (main.js kaydırır)
// uzak dekor yardımcıları: sissiz, hava tonu farMats üzerinden gelir. Köşe tonu (shade) rengi çarpar:
// su hizasında koyu, yukarı açılır; yandan vuran ışıkla kubbe ve kule yuvarlak görünür (düz karton kesik değil, 2.5D)
const basic = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: false, vertexColors: true, ...o }); m.userData.base = c; farMats.push(m); return m; };
// boya: renk köşede durur, malzeme beyaz; renkli parçaların hepsi tek gövdede birleşir (telefonda tek çizim çağrısı).
// Hava bozunca renk tint'e solar (uWash), malzeme rengi değişmez
const paint = () => {
  const m = basic(0xffffff), wash = { value: new THREE.Vector4(1, 1, 1, 0) };
  m.userData.wash = wash; m.customProgramCacheKey = () => 'farPaint';
  m.onBeforeCompile = s => {
    s.uniforms.uWash = wash;
    s.fragmentShader = 'uniform vec4 uWash;\n' + s.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uWash.rgb, 1.0)).rgb, uWash.a);');
  };
  return m;
};
// uzaklık pusu: arkadaki sıra sis rengine daha çok karışır (öndeki tatlı renkli, tepeler soluk)
const hazeAt = z => Math.min(0.6, Math.max(0.05, 0.08 + (-z - 380) * 0.004));
const _n = new THREE.Vector3(), _pc = new THREE.Color(), _fc = new THREE.Color(), SIDE_L = new THREE.Vector3(-0.7, 0.5, 0.3).normalize();
// col: boyalı malzemede renk (sayı ya da (x, y) => sayı); verilmezse Kit'in köşe renkleri kullanılır
function shade(geo, y0, m, col, z) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = new Float32Array(p.count * 3);
  const base = m.userData.wash && col == null ? geo.attributes.color : null, painted = !!m.userData.wash, haze = hazeAt(z);
  _fc.setHex(PAL.fog);
  for (let i = 0; i < p.count; i++) {
    const h = Math.min(1, Math.max(0, (y0 + p.getY(i)) / 40)), lit = n ? Math.max(0, _n.fromBufferAttribute(n, i).dot(SIDE_L)) : 0.5;
    const f = (0.76 + 0.24 * h) * (0.84 + 0.24 * lit);
    if (!painted) { c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f; continue; }
    if (base) _pc.fromBufferAttribute(base, i); else _pc.setHex(typeof col === 'function' ? col(p.getX(i), p.getY(i)) : col);
    _pc.lerp(_fc, haze).multiplyScalar(f);
    c[i * 3] = _pc.r; c[i * 3 + 1] = _pc.g; c[i * 3 + 2] = _pc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
const add = (geo, m, x, y, z, parent = far, col) => { if (m.vertexColors) shade(geo, y, m, col, z); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
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
const SHIP_HULL = [0xb8434a, 0x2f4f7a, 0x2f6b5e, 0x3a3f52], BOXES = [0xd9573f, 0x3f7fc0, 0xe8a23a, 0x4f9a6a, 0xc94f7c, 0x3fa3a8];
function farShipsBuild(mPaint) {
  // ufukta gemiler: şilep, tanker, uzak vapur siluetleri; yavaşça yan yana kayar. mPaint verilirse renkli gövde, beyaz köprüüstü, rengârenk konteynerler
  const mShip = mPaint || basic(PAL.cityFar), mShipNear = mPaint || basic(PAL.city), WHITE = 0xf4f1ea;
  const silhouette = kind => {
    const k = new Kit(), hull = pick(SHIP_HULL);
    if (kind === 0) { // şilep: konteyner basamakları, kıçta köprüüstü
      k.add(new THREE.BoxGeometry(60, 4, 8), hull, 0, 2, 0);
      for (let x = -22; x < 20; x += 5) k.add(new THREE.BoxGeometry(4.6, rand(2, 6), 7), pick(BOXES), x, 5, 0);
      k.add(new THREE.BoxGeometry(7, 10, 7), WHITE, 25, 8, 0); k.add(new THREE.BoxGeometry(1.6, 4, 1.6), hull, 26, 14, 0);
    } else if (kind === 1) { // tanker: alçak uzun gövde, kıçta yüksek köprü
      k.add(new THREE.BoxGeometry(70, 3.5, 9), hull, 0, 1.75, 0);
      k.add(new THREE.BoxGeometry(50, 1, 3), 0x9aa0a8, -6, 4, 0);
      k.add(new THREE.BoxGeometry(8, 9, 8), WHITE, 29, 7, 0); k.add(new THREE.BoxGeometry(1.8, 5, 1.8), 0xd9573f, 31, 13.5, 0);
    } else if (kind === 2) { // vapur: beyaz gövde, ortada siyah-beyaz baca
      k.add(new THREE.BoxGeometry(26, 3, 6), WHITE, 0, 1.5, 0); k.add(new THREE.BoxGeometry(16, 2.4, 5), WHITE, 0, 4.2, 0);
      k.add(new THREE.CylinderGeometry(1, 1.1, 4, 8), 0x2b2d33, 0, 7, 0);
    } else { // yolcu gemisi: basamak basamak yükselen katlar, iki baca
      k.add(new THREE.BoxGeometry(80, 6, 11), WHITE, 0, 3, 0);
      for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(62 - i * 9, 2.4, 10), i % 2 ? 0x5d86b8 : WHITE, 4 - i * 2, 7.2 + i * 2.4, 0);
      for (const x of [-8, 4]) k.add(new THREE.CylinderGeometry(1.8, 2.1, 5, 8), 0xd9573f, x, 18.5, 0);
    }
    return k.build();
  };
  // sıralar: her sırada gemiler eşit aralıklı ve aynı hızda kayar, birbirine hiç girmez. İki sıra önde, birer gemi sağ ve sol ufukta.
  // [pivot dönüşü, z, gemi sayısı, hız, ölçek]
  let kind = (Math.random() * 4) | 0;
  for (const [ry, z, n, v, sc] of [[0, -240, 3, 2.4, 1.1], [0, -318, 3, -1.7, 0.85], [Math.PI / 2, -265, 1, 2, 1], [-Math.PI / 2, -265, 1, -2, 1]]) {
    let parent = far;
    if (ry) { parent = new THREE.Group(); parent.rotation.y = ry; far.add(parent); }
    const x0 = rand(-FAR_SHIP_W, FAR_SHIP_W);
    for (let i = 0; i < n; i++) {
      const x = ((x0 + i * 2 * FAR_SHIP_W / n + FAR_SHIP_W) % (2 * FAR_SHIP_W)) - FAR_SHIP_W;
      const s = add(silhouette(kind++ % 4), z > -300 ? mShipNear : mShip, x, 0, z + rand(-8, 8), parent);
      s.scale.setScalar(sc * rand(0.92, 1.08)); if (v < 0) s.rotation.y = Math.PI; // pruva gidiş yönüne
      s.userData.v = v;
      farShips.push(s);
    }
  }
}
// tepeler üç yandan sarar: virajda bakış dönünce silüet bitip çıplak deniz gökyüzüne yükselmesin. h: tepe yüksekliği
// cols: boyalı malzemede tepe renkleri { far, near }; yandaki evler de renkli mahalle olur
function farRidges(mFar, mNear, mHouses, h = [18, 9, 8, 6], cols, town) {
  for (const [ry, seed] of [[0, 0], [Math.PI / 2, 2.7], [-Math.PI / 2, 5.1]]) {
    const pivot = new THREE.Group(); pivot.rotation.y = ry; far.add(pivot);
    add(ridge(-470, h[0], h[1], mFar, 1.3 + seed), mFar, 0, 0, -470, pivot, cols && cols.far);
    add(ridge(-430, h[2], h[3], mNear, 4.1 + seed), mNear, 0, 0, -430, pivot, cols && cols.near);
    if (ry && cols) farTown(mHouses, -400, 3, 9, 0, -650, 650, pivot, 0.3, town);
    else if (ry) { // yanlarda alçak, seyrek kıyı evleri
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
// renkli kıyı mahallesi: her bina kendi renginde cephe, çoğunun üstünde kiremit dam; gap: boş arsa olasılığı
const FACADES = [0xf3e4c4, 0xeab48a, 0xdc8a68, 0xf1cd82, 0xc4d4a8, 0xeaaeb0, 0xf7f0e4, 0xb3c8dc, 0xd99ca8, 0xa9d1c4], ROOFS = [0xb5523e, 0xc4643f, 0xa8473f];
function farTown(m, z, hMin, hMax, y = 0, x0 = -600, x1 = 600, parent = far, gap = 0, o = {}) {
  const k = new Kit(), fac = o.facades || FACADES, roofs = o.roofs || ROOFS, roofP = o.roofP ?? 0.65;
  for (let x = x0; x < x1;) {
    const w = rand(5, 12), h = rand(hMin, hMax);
    if (Math.random() >= gap) {
      k.add(new THREE.PlaneGeometry(w, h + 5), pick(fac), x + w / 2, (h - 5) / 2, 0);
      if (Math.random() < roofP) { // kırma dam: önden yamuk görünür
        const r = Math.min(2.4, w * 0.22), s = new THREE.Shape();
        s.moveTo(-w / 2 - 0.3, 0); s.lineTo(w / 2 + 0.3, 0); s.lineTo(w / 2 - r, r); s.lineTo(-w / 2 + r, r);
        k.add(new THREE.ShapeGeometry(s), pick(roofs), x + w / 2, h, 0.05);
      }
    }
    x += w;
  }
  add(k.build(), m, 0, y, z, parent);
}
// silüetin önünde rastgele pencere ışıkları
function farLights(n, x0, x1, y0, y1, z, tex) {
  const cl = [];
  for (let i = 0; i < n; i++) cl.push(rand(x0, x1), rand(y0, y1), z);
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
  far.add(new THREE.Points(cg, new THREE.PointsMaterial({ map: tex, color: 0xffc070, size: 3.2, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
}

function buildIstanbul() {
  // her şey tek boyalı malzemede: renkler köşede, hepsi tek çizim çağrısında birleşir
  const mP = paint();
  const STONE = 0xeddcbc, LEAD = 0x8796b0, WHITE = 0xf5f0e6;

  farClouds();

  // Anadolu yakası tepeleri: arkada pusa karışan mavi-yeşil, önde ağaçlı yeşil; aralarında ve eteklerinde sis
  farRidges(mP, mP, mP, undefined, { far: 0x7896a6, near: 0x5f9466 });
  farHaze(-450, 16); farHaze(-415, 10, 0.7);

  // tarihi yarımada: arkada yüksek, önde alçak sıra; rengârenk cepheler, kiremit damlar
  farTown(mP, -404, 8, 22);
  farTown(mP, -390, 5, 16);

  // cami: krem taş beden, kurşun kubbeler, şerefeli minareler
  const dome = (r, x, y, z) => add(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mP, x, y, z, far, LEAD);
  const minaret = (x, y, z, s) => {
    add(new THREE.CylinderGeometry(0.9 * s, 1.1 * s, 40 * s, 8), mP, x, y + 20 * s, z, far, STONE);
    add(new THREE.CylinderGeometry(1.7 * s, 1.2 * s, 1.4 * s, 8), mP, x, y + 27 * s, z, far, STONE);
    add(new THREE.CylinderGeometry(1.5 * s, 1.1 * s, 1.2 * s, 8), mP, x, y + 35 * s, z, far, STONE);
    add(new THREE.ConeGeometry(1.15 * s, 9 * s, 8), mP, x, y + 44.5 * s, z, far, LEAD);
  };
  const mosque = (x, s, z) => {
    add(new THREE.BoxGeometry(36 * s, 12 * s, 16), mP, x, 6 * s, z, far, STONE);
    add(new THREE.CylinderGeometry(10 * s, 11 * s, 5 * s, 16), mP, x, 14 * s, z, far, STONE);
    dome(10.5 * s, x, 16 * s, z);
    add(new THREE.ConeGeometry(0.7 * s, 4 * s, 6), mP, x, 28.5 * s, z, far, 0xe2b65a); // alem
    for (const dx of [-11, 11]) dome(6.2 * s, x + dx * s, 12 * s, z);
    for (const dx of [-16, -6, 6, 16]) dome(2.4 * s, x + dx * s, 12 * s, z + 3);
    for (const dx of [-21, 21]) minaret(x + dx * s, 0, z, s);
  };
  mosque(70, 1.25, -385);
  mosque(-250, 0.95, -405);
  mosque(230, 0.8, -410);

  // Galata Kulesi: taş gövde, koyu külah
  const gx = 150, gz = -380;
  add(new THREE.CylinderGeometry(5.2, 6.2, 34, 14), mP, gx, 17, gz, far, 0xe3cba3);
  add(new THREE.CylinderGeometry(6.6, 6.6, 1.6, 14), mP, gx, 34.8, gz, far, 0xd0b48a);
  add(new THREE.CylinderGeometry(5.4, 5.4, 4, 14), mP, gx, 37.5, gz, far, 0xe3cba3);
  add(new THREE.ConeGeometry(5.9, 13, 14), mP, gx, 46, gz, far, 0x55668a);
  add(new THREE.CylinderGeometry(0.15, 0.15, 4, 4), mP, gx, 54, gz, far, 0x55668a);
  // kulenin pencere ışıkları
  const winMat = basic(0xffd27a);
  for (let i = 0; i < 10; i++) {
    const a = -0.6 + i * 0.13;
    const w = add(new THREE.PlaneGeometry(0.8, 1.3), winMat, gx + Math.sin(a) * 5.45, 37.5, gz + Math.cos(a) * 5.45);
    w.rotation.y = a;
  }

  // Boğaz Köprüsü: açık gri ayaklar ve kablolar, koyu tabla
  const BR = 0xb4b8cc;
  const bx0 = -170, bx1 = -60, bz = -360, top = 66, deck = 22;
  for (const x of [bx0, bx1]) {
    for (const dz of [-1.6, 1.6]) add(new THREE.BoxGeometry(2.2, top, 1.4), mP, x, top / 2, bz + dz, far, BR);
    add(new THREE.BoxGeometry(2.4, 1.4, 4.6), mP, x, top - 4, bz, far, BR);
    add(new THREE.BoxGeometry(2.4, 1.4, 4.6), mP, x, deck + 14, bz, far, BR);
  }
  add(new THREE.BoxGeometry(260, 1.6, 4), mP, -115, deck, bz, far, 0x7f829c);
  const hangerGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
  for (const [a, b, ya, yb] of [[-245, bx0, deck, top], [bx0, bx1, top, top], [bx1, 15, top, deck]]) {
    const mid = (a + b) / 2, low = (a === bx0 ? deck + 3 : (ya + yb) / 2 - 6);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a, ya, bz), new THREE.Vector3(mid, a === bx0 ? 2 * low - top : low, bz), new THREE.Vector3(b, yb, bz));
    add(new THREE.TubeGeometry(curve, 30, 0.35, 4), mP, 0, 0, 0, far, BR);
    for (let k = 1; k < 14; k++) {
      const p = curve.getPoint(k / 14);
      if (p.y - deck < 1) continue;
      const h = add(hangerGeo.clone(), mP, p.x, (p.y + deck) / 2, bz, far, BR); h.scale.y = p.y - deck;
    }
  }
  // köprü ışıkları
  const dots = [];
  for (let x = -240; x < 12; x += 6) dots.push(x, deck + 1.2, bz + 2.2);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  const glowTex = glow();
  far.add(new THREE.Points(lg, new THREE.PointsMaterial({ map: glowTex, color: 0xffe2a0, size: 5, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));


  farLights(260, -560, 560, 1, 12, -388, glowTex); // şehir ışıkları
  farShipsBuild(mP);

  // Kız Kulesi: kayalık adacıkta beyaz kule, kurşun külah
  const kx = 260, kz = -300;
  add(new THREE.CylinderGeometry(9, 11, 2, 10), mP, kx, 0, kz, far, 0x9c9184);
  add(new THREE.BoxGeometry(9, 6, 7), mP, kx - 1, 4, kz, far, WHITE);
  add(new THREE.CylinderGeometry(2.2, 2.4, 13, 8), mP, kx + 2, 8.5, kz, far, WHITE);
  add(new THREE.ConeGeometry(2.8, 5, 8), mP, kx + 2, 17.5, kz, far, LEAD);
  add(new THREE.PlaneGeometry(0.9, 0.9), winMat, kx + 2, 13, kz + 2.45);
}

// ---------------- İzmir: Kordon, Konak Saat Kulesi, Kadifekale, Bayraklı kuleleri ----------------
// Ege paleti: beyaz, krem, açık sarı apartmanlar (çoğu düz damlı), zeytin yeşili tepeler, mavi cam kuleler
const IZ_FAC = [0xf7f2e8, 0xf1e2c2, 0xf3d79a, 0xe9c9a8, 0xdfe7ea, 0xf0d2c8, 0xcfdcc0, 0xe6dccb], IZ_ROOF = [0xc2603f, 0xb5523e];
const PALM_TRUNK = 0x8a6a48, PALM_LEAF = [0x4f8a3e, 0x5d9a45, 0x447a38];
function palmRow(k, x, y0, h, lean) {
  const tx = x + Math.sin(lean) * h;
  k.add(new THREE.CylinderGeometry(0.28, 0.45, h, 5), PALM_TRUNK, x + Math.sin(lean) * h / 2, y0 + h / 2, 0, 0, 0, -lean);
  const leaf = pick(PALM_LEAF);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + rand(-0.3, 0.3);
    k.add(new THREE.ConeGeometry(0.5, 4.2, 3), leaf, tx + Math.cos(a) * 1.7, y0 + h - 0.5, Math.sin(a) * 1.7, Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9);
  }
}
function buildIzmir() {
  const mP = paint();
  const MARBLE = 0xf2e9d6, LEAD = 0x8796b0, SANDSTONE = 0xcaa67a, OLIVE = 0x8f9a5a;
  farClouds();
  // Yamanlar: arkada pusa karışan soluk zeytin, önde koyu zeytin; yanlarda Ege mahalleleri
  farRidges(mP, mP, mP, [30, 13, 12, 7], { far: 0xb3ad8c, near: 0x8c9758 }, { facades: IZ_FAC, roofs: IZ_ROOF, roofP: 0.3 });
  farHaze(-450, 18); farHaze(-412, 10, 0.7);
  // Kadifekale: şehrin arkasındaki zeytinlik tepede kumtaşı surlar
  const kx = -190, kz = -415;
  const hill = new THREE.Shape(); hill.moveTo(-110, -5);
  for (let x = -110; x <= 110; x += 10) hill.lineTo(x, 26 * Math.cos((x / 110) * Math.PI / 2) ** 1.4 + Math.sin(x * 0.2) * 0.8);
  hill.lineTo(110, -5);
  add(new THREE.ShapeGeometry(hill), mP, kx, 0, kz, far, OLIVE);
  const wall = new Kit();
  for (let x = -34; x <= 34; x += 4) {
    const y = 26 * Math.cos((x / 110) * Math.PI / 2) ** 1.4;
    wall.add(new THREE.BoxGeometry(4.1, 4, 2), SANDSTONE, x, y + 1.5, 0);
    if (Math.abs(x) % 8 === 2) wall.add(new THREE.BoxGeometry(1.6, 1.4, 2), SANDSTONE, x - 1, y + 4.2, 0); // mazgal
  }
  for (const x of [-34, -12, 14, 34]) { const y = 26 * Math.cos((x / 110) * Math.PI / 2) ** 1.4; wall.add(new THREE.BoxGeometry(5, 8, 4), 0xbf9a6c, x, y + 3.5, 0); }
  add(wall.build(), mP, kx, 0, kz + 3);
  // kıyı şehri (Konak, Alsancak): arkada yüksek apartmanlar, önde Kordon'un alçak, bazısı kiremitli evleri
  farTown(mP, -402, 6, 16, 0, -600, 600, far, 0, { facades: IZ_FAC, roofs: IZ_ROOF, roofP: 0.2 });
  farTown(mP, -392, 3, 11, 0, -600, 600, far, 0.05, { facades: IZ_FAC, roofs: IZ_ROOF, roofP: 0.55 });
  // Bayraklı kuleleri: körfezin sağında mavi-yeşil cam gökdelenler, açık renk taçlar
  const bay = new Kit(), GLASS = [0x6f9cc0, 0x5d8fb5, 0x7fb0c8, 0x86a7c4];
  for (const [x, w, h] of [[95, 9, 46], [112, 11, 64], [128, 8, 38], [142, 12, 76], [160, 9, 52], [178, 10, 44], [194, 8, 58]]) {
    bay.add(new THREE.BoxGeometry(w, h, 9), pick(GLASS), x, h / 2, 0);
    bay.add(new THREE.BoxGeometry(w * 0.6, 3, 6), 0xdde6ee, x, h + 1.5, 0); // tepe
  }
  bay.add(new THREE.CylinderGeometry(5.5, 6.5, 70, 10), 0x9cbdd4, 212, 35, 0);
  bay.add(new THREE.CylinderGeometry(0.25, 0.25, 12, 4), 0x9aa0a8, 142, 84, 0); // anten
  add(bay.build(), mP, 0, 0, -398);
  // Asansör: yokuşta tuğla kule
  add(new THREE.BoxGeometry(5, 24, 5), mP, -120, 12, -386, far, 0xb5694a);
  add(new THREE.BoxGeometry(9, 4, 6), mP, -120, 26, -386, far, 0xa65a3e);
  // Konak Saat Kulesi: beyaz mermer, sekizgen üç kat, tepede kurşun kubbe
  const tx = -25, tz = -372, S = 2.3;
  const oct = (rt, rb, h, y, c = MARBLE) => add(new THREE.CylinderGeometry(rt * S, rb * S, h * S, 8), mP, tx, y * S, tz, far, c);
  oct(4.6, 5.2, 1.6, 0.8, 0xd8ccb4); // kaide
  oct(3.9, 4.1, 8, 5.6);     // 1. kat
  oct(4.5, 4.5, 0.8, 10, 0xe3d3b0); // kat silmesi
  oct(3.2, 3.4, 7, 13.9);    // 2. kat
  oct(3.8, 3.8, 0.7, 17.7, 0xe3d3b0);
  oct(2.6, 2.8, 5.4, 20.8);  // saat katı
  oct(3.1, 3.1, 0.6, 23.8, 0xe3d3b0);
  oct(1.9, 2.1, 3.4, 25.8);  // fener
  add(new THREE.SphereGeometry(2.1 * S, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mP, tx, 27.5 * S, tz, far, LEAD);
  add(new THREE.ConeGeometry(0.35 * S, 3 * S, 6), mP, tx, 30.3 * S, tz, far, 0xe2b65a);
  const winMat = basic(0xfff4d6);
  for (const a of [0, Math.PI / 2, -Math.PI / 2]) { // saat kadranları
    const c = add(new THREE.CircleGeometry(1.3 * S, 16), winMat, tx + Math.sin(a) * 2.75 * S, 20.8 * S, tz + Math.cos(a) * 2.75 * S); c.rotation.y = a;
  }
  for (const dx of [-7, 7]) add(new THREE.CylinderGeometry(1.6, 2, 3, 8), mP, tx + dx * S, 1.5, tz + 2, far, MARBLE); // çeşmeler
  // Konak Yalı Camii: çinili küçük sekizgen cami, kurşun kubbe, tek minare
  const cx = -70, cz = -378;
  add(new THREE.CylinderGeometry(6, 6, 7, 8), mP, cx, 3.5, cz, far, 0xdfe9ee);
  add(new THREE.CylinderGeometry(6.3, 6.3, 0.8, 8), mP, cx, 6.6, cz, far, 0x4f86b8); // çini kuşak
  add(new THREE.SphereGeometry(6.2, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mP, cx, 7, cz, far, LEAD);
  add(new THREE.CylinderGeometry(0.9, 1.1, 26, 8), mP, cx + 9, 13, cz, far, MARBLE);
  add(new THREE.CylinderGeometry(1.6, 1.1, 1.2, 8), mP, cx + 9, 21, cz, far, MARBLE);
  add(new THREE.ConeGeometry(1.1, 6, 8), mP, cx + 9, 29, cz, far, LEAD);
  // Kordon palmiyeleri: kıyı boyunca, eğik gövdeler, aralıkları düzensiz
  const palms = new Kit();
  for (let x = -420; x < 440; x += rand(9, 24)) {
    if (Math.abs(x - tx) < 16) continue;
    palmRow(palms, x, 0, rand(7, 11), rand(-0.12, 0.12));
  }
  add(palms.build(), mP, 0, 0, -366);
  const glowTex = glow();
  farLights(200, -560, 560, 1, 9, -390, glowTex);
  farShipsBuild(mP);
}

// ---------------- Antalya: karlı Toroslar, falezler üstünde şehir, Kaleiçi limanı, Yivli Minare, Düden şelalesi, Konyaaltı ----------------
// Akdeniz paleti: bembeyaz oteller ve apartmanlar, krem ve açık turuncu cepheler, Kaleiçi'nde kırmızı kiremit
const AN_FAC = [0xfbfaf6, 0xf6f1e6, 0xf2e3c6, 0xf3cfa4, 0xe8eef2, 0xf4ddd0, 0xeadfc8], AN_ROOF = [0xc4553a, 0xb5483a, 0xd06a45];
function buildAntalya() {
  const mP = paint(), LEAD = 0x8796b0, FOAM = 0xf2fbff;
  farClouds();
  // sırtlar: arkada mavi-gri, önde koyu çam yeşili; yanlarda beyaz sahil kasabaları
  farRidges(mP, mP, mP, [40, 14, 10, 5], { far: 0x9aaebf, near: 0x5f8a5a }, { facades: AN_FAC, roofs: AN_ROOF, roofP: 0.4 });
  // Toroslar: önceki sırtın ardından yükselen sivri, düzensiz zirveler; tepeleri karlı
  const peaks = [];
  for (let x = -700, y = 70; x <= 700; x += rand(10, 22)) { y = Math.max(46, Math.min(104, y + rand(-13, 13) + (78 - y) * 0.15)); peaks.push([x, y]); }
  const mtn = new THREE.Shape(); mtn.moveTo(-700, -5); for (const [x, y] of peaks) mtn.lineTo(x, y); mtn.lineTo(700, -5);
  add(new THREE.ShapeGeometry(mtn), mP, 0, 0, -490, far, (x, y) => (y > 60 ? 0xb8c3d2 : 0x8fa0b6));
  // kar: zirve ile düzensiz kar sınırı arasında şerit; sınırın altında kalan zirvede alan sıfır (tek parça Shape üçgenlenemiyor, dörtgenler elle)
  const SNOW = 80, line = peaks.map(([, y]) => Math.min(y, SNOW + rand(-5, 5))), sv = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x0, t0] = peaks[i], [x1, t1] = peaks[i + 1], b0 = line[i], b1 = line[i + 1];
    if (t0 <= b0 && t1 <= b1) continue;
    sv.push(x0, b0, 0, x1, b1, 0, x1, t1, 0, x0, b0, 0, x1, t1, 0, x0, t0, 0);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); sg.computeVertexNormals();
  add(sg, mP, 0, 0, -489, far, 0xf8fafd);
  farHaze(-480, 40, 0.75); farHaze(-450, 16); farHaze(-415, 10, 0.6);
  // falez: şehrin oturduğu dik kayalık; solda Konyaaltı'na inip kumsala döner, Kaleiçi limanında çentik
  const cliffY = x => (x < -230 ? 1.2 : x < -180 ? 1.2 + (x + 230) / 50 * 11 : 12.2 + Math.sin(x * 0.07) * 0.6 + rand(-0.4, 0.4)) - (x > -30 && x < 50 ? 7 : 0);
  const cl = new THREE.Shape(); cl.moveTo(-620, -5);
  for (let x = -620; x <= 620; x += 4) cl.lineTo(x, cliffY(x));
  cl.lineTo(620, -5);
  // falez katmanları: dipte koyu, ortada bal rengi, üstte krem (kireçtaşı)
  add(new THREE.ShapeGeometry(cl), mP, 0, 0, -384, far, (x, y) => (y < 3 ? 0xa97f55 : y < 8 ? 0xc99e6e : 0xdcbc8c));
  add(new THREE.BoxGeometry(420, 1.4, 2), mP, -420, 0.5, -383, far, 0xeedcb2); // Konyaaltı kumsalı
  const dots = [], cols = [];
  for (let x = -600; x < -240; x += rand(3, 7)) { dots.push(x, 2.4, -382); const c = new THREE.Color(pick([0xe5484d, 0x2f7fd6, 0xf2b22c, 0xffffff, 0x2e9c6a])); cols.push(c.r, c.g, c.b); } // şemsiyeler
  const ug = new THREE.BufferGeometry(); ug.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3)); ug.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  far.add(new THREE.Points(ug, new THREE.PointsMaterial({ size: 2.6, vertexColors: true, fog: false, sizeAttenuation: true })));
  // falezin üstünde beyaz apartmanlar ve Lara otelleri (arkada yüksek), Kaleiçi'nde alçak kırmızı damlar; Konyaaltı'nda kumsal ardında alçak sıra
  farTown(mP, -396, 8, 26, 10, -235, 600, far, 0.05, { facades: AN_FAC, roofs: AN_ROOF, roofP: 0.15 });
  farTown(mP, -389, 3, 12, 10, -200, 600, far, 0.1, { facades: AN_FAC, roofs: AN_ROOF, roofP: 0.75 });
  farTown(mP, -394, 4, 14, 0, -600, -235, far, 0.15, { facades: AN_FAC, roofs: AN_ROOF, roofP: 0.25 });
  // Yivli Minare: kırmızı tuğla yivli gövde, açık şerefe, kurşun külah
  const yx = 8, yb = cliffY(yx) + 2, BRICK = 0xb0573e;
  add(new THREE.CylinderGeometry(1.7, 2.1, 30, 16), mP, yx, yb + 15, -386, far, x => (Math.round(x * 2.5) & 1 ? BRICK : 0xa04c36));
  add(new THREE.CylinderGeometry(2.6, 1.8, 1.4, 16), mP, yx, yb + 25, -386, far, 0xd8c4a4);
  add(new THREE.CylinderGeometry(1.3, 1.5, 4, 12), mP, yx, yb + 32, -386, far, BRICK);
  add(new THREE.ConeGeometry(1.5, 5, 12), mP, yx, yb + 36.5, -386, far, LEAD);
  // Hıdırlık Kulesi: falez ucunda yuvarlak taş kule
  add(new THREE.CylinderGeometry(6, 6.6, 9, 18), mP, 64, cliffY(64) + 4.5, -383, far, 0xc8b59a);
  add(new THREE.CylinderGeometry(4, 4.2, 6, 16), mP, 64, cliffY(64) + 12, -383, far, 0xbfa98c);
  // Kaleiçi limanı: suda ahşap gulet gövdeleri ve direkleri
  for (let x = -24; x < 46; x += rand(5, 9)) {
    add(new THREE.BoxGeometry(6, 1.4, 2), mP, x, 0.7, -380, far, pick([0xf0ead8, 0xa8754a, 0xf6f4ee]));
    add(new THREE.CylinderGeometry(0.12, 0.12, rand(8, 12), 4), mP, x, 6, -380, far, 0x7a5a3c);
  }
  // Düden şelalesi: falezden denize dökülen beyaz perde, dibinde köpük
  const dx = 190, dy = cliffY(dx);
  add(new THREE.PlaneGeometry(14, dy), mP, dx, dy / 2, -382.5, far, FOAM);
  for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(rand(2, 3.4), 10, 6), mP, dx + rand(-8, 8), 0.3, -381, far, FOAM);
  // palmiyeler falez boyunca
  const palms = new Kit();
  for (let x = -420; x < 460; x += rand(10, 26)) palmRow(palms, x, cliffY(x), rand(6, 9), rand(-0.12, 0.12));
  add(palms.build(), mP, 0, 0, -384.5);
  const glowTex = glow();
  farLights(160, -300, 560, 12, 24, -390, glowTex);
  farShipsBuild(mP);
}

// ---------------- Muğla (Bodrum): kuru zeytinlik tepeler, yamaca tırmanan beyaz kübik evler, Bodrum Kalesi, sırtta yel değirmenleri, guletli marina, antik tiyatro ----------------
// Ege ikindisi: berrak koyu mavi gök, düz damlı bembeyaz evler (mavi pencere, pembe begonvil), bal rengi kale taşı
const MU_FAC = [0xfbfaf6, 0xf7f5ef, 0xf3f1ea, 0xfdfcf8, 0xeef0f2, 0xf6efe2], MU_ROOF = [0xf1ede4];
function buildMugla() {
  const mP = paint(), STONE = 0xd6bd8c, STONE2 = 0xc4a877, WHITE = 0xfbfaf6, BLUE = 0x2f6fb4;
  // sırtlar: arkada pusa karışan kuru toprak, önde zeytin; yanlarda düz damlı beyaz köyler
  farRidges(mP, mP, mP, [34, 12, 12, 6], { far: 0xc7b38c, near: 0x9a9462 }, { facades: MU_FAC, roofs: MU_ROOF, roofP: 0 });
  farHaze(-450, 16); farHaze(-414, 9, 0.6);
  // Bodrum tepeleri: şehrin ardında yumuşak, kuru yamaçlar (alçakta zeytin, yukarıda okra); sağdaki sırtta değirmenler
  const hillY = x => 16 + 16 * Math.exp(-(((x - 150) / 110) ** 2)) + 12 * Math.exp(-(((x + 170) / 120) ** 2)) + Math.sin(x * 0.045) * 2 + Math.sin(x * 0.13 + 1) * 0.8;
  const hl = new THREE.Shape(); hl.moveTo(-620, -5);
  for (let x = -620; x <= 620; x += 8) hl.lineTo(x, hillY(x));
  hl.lineTo(620, -5);
  add(new THREE.ShapeGeometry(hl), mP, 0, 0, -404, far, (x, y) => (y < 9 ? 0x8f9058 : y < 18 ? 0xa9a066 : 0xc4a877));
  // yamaca tırmanan evler: alt sıralar önde, yukarı çıktıkça geride ve seyrek; tepeye yakın ev yok
  const town = new Kit();
  for (let r = 0; r < 7; r++) for (let x = -560; x < 560;) {
    const w = rand(4, 8), h = rand(3, 5), y = r * 3.2, top = hillY(x + w / 2) * 0.82;
    if (y + h < top && Math.random() < 0.85 - r * 0.08) {
      const zz = -r * 0.9;
      town.add(new THREE.BoxGeometry(w, h + 2, 2), pick(MU_FAC), x + w / 2, y + (h - 2) / 2, zz);
      town.add(new THREE.BoxGeometry(w + 0.5, 0.4, 2.2), 0xf1ede4, x + w / 2, y + h, zz);
      if (Math.random() < 0.6) town.add(new THREE.PlaneGeometry(0.9, 1.3), Math.random() < 0.7 ? BLUE : 0x4d6684, x + w * rand(0.25, 0.75), y + h * 0.55, zz + 1.02);
      if (Math.random() < 0.18) town.add(new THREE.SphereGeometry(rand(1.1, 1.8), 6, 4), pick([0xd6337f, 0xe0559a, 0xc72a6e]), x + rand(0, w), y + rand(0.5, h), zz + 1.2, 0, 0, 0, 1, 0.75, 0.5); // begonvil
    }
    x += w + (Math.random() < 0.2 ? rand(2, 8) : rand(0, 1.2));
  }
  add(town.build(), mP, 0, 0, -398);
  // kıyı sırası: deniz kenarında alçak beyaz evler
  farTown(mP, -391, 3, 7, 0, -600, 600, far, 0.12, { facades: MU_FAC, roofs: MU_ROOF, roofP: 0 });
  // Bodrum Kalesi: alçak kayalık burunda bal rengi surlar, mazgallı kare kuleler; Fransız Kulesi'nde Türk bayrağı
  const kx = -70, kz = -384;
  const pen = new THREE.Shape(); pen.moveTo(-46, -5);
  for (let x = -46; x <= 46; x += 4) pen.lineTo(x, 4.5 * Math.cos((x / 46) * Math.PI / 2) ** 0.6 + Math.sin(x * 0.5) * 0.4);
  pen.lineTo(46, -5);
  add(new THREE.ShapeGeometry(pen), mP, kx, 0, kz + 1, far, (x, y) => (y < 1.5 ? 0x8f7a58 : 0xb39a6c));
  const castle = new Kit(), crenel = (x, y, w, c) => { for (let t = -w / 2 + 0.5; t < w / 2; t += 1.6) castle.add(new THREE.BoxGeometry(0.9, 1, 1), c, x + t, y + 0.5, 0); };
  castle.add(new THREE.BoxGeometry(64, 7, 2), STONE2, 0, 4.5, 1); crenel(0, 8, 64, STONE2);  // dış sur
  castle.add(new THREE.BoxGeometry(44, 10, 2), STONE, 2, 7, -1.5); crenel(2, 12, 44, STONE);  // iç sur
  for (const [x, w, h, dz, c] of [[-26, 6, 15, 0, STONE2], [-10, 7, 19, -2, STONE], [2, 8, 26, -3, STONE], [15, 6.5, 20, -2, STONE2], [27, 6, 14, 0, STONE]]) {
    castle.add(new THREE.BoxGeometry(w, h, 3), c, x, h / 2 + 1, dz);
    castle.add(new THREE.BoxGeometry(w + 0.6, 0.5, 3.4), (c === STONE ? 0xe2cda2 : 0xd4bc8e), x, h + 1, dz);
    crenel(x, h + 1.2, w, c);
  }
  castle.add(new THREE.CylinderGeometry(0.15, 0.15, 6, 4), 0xe8e4da, 2, 31, -3);
  castle.add(new THREE.PlaneGeometry(4, 2.6), 0xe30a17, 4, 33, -2.8); // Türk bayrağı
  castle.add(new THREE.CircleGeometry(0.75, 12), 0xffffff, 3.6, 33, -2.75);
  add(castle.build(), mP, kx, 0, kz);
  // antik tiyatro: yamaçta yukarı doğru genişleyen taş basamaklar
  const th = new Kit();
  for (let i = 0; i < 7; i++) th.add(new THREE.BoxGeometry(14 + i * 3, 1.1, 1), i % 2 ? 0xcfc09d : 0xe4d8ba, 0, i * 1.15, -i * 0.3);
  th.add(new THREE.BoxGeometry(12, 3, 1), 0xd9caa6, 0, -1.5, 0.6);
  add(th.build(), mP, -165, 12, -401);
  // yel değirmenleri: sağdaki sırtın üstünde dizi, beyaz gövde, ahşap külah, çapraz kanatlar
  const mills = new Kit();
  for (let x = 70; x < 240; x += rand(17, 28)) {
    const y = hillY(x) - 1.2, a = rand(0, 1.5);
    mills.add(new THREE.CylinderGeometry(1.7, 2.1, 7, 10), WHITE, x, y + 3.5, 0);
    mills.add(new THREE.ConeGeometry(2.1, 2.8, 10), 0x6e4b30, x, y + 8.4, 0);
    for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; mills.add(new THREE.BoxGeometry(1, 5, 0.2), 0xf6f1e6, x + Math.sin(b) * 2.6, y + 6.8 + Math.cos(b) * 2.6, 2.3, 0, 0, -b); }
  }
  add(mills.build(), mP, 0, 0, -405.5);
  // marina: suda gulet gövdeleri, ikişer direk
  const marina = new Kit();
  for (let x = -20; x < 150; x += rand(4, 7)) {
    marina.add(new THREE.BoxGeometry(5.5, 1.4, 2), pick([0xf0ead8, 0xa8754a, 0xf6f4ee, 0x9a6236]), x, 0.7, 0);
    marina.add(new THREE.CylinderGeometry(0.12, 0.12, rand(9, 13), 4), 0x7a5a3c, x - 1.2, 5.5, 0);
    if (Math.random() < 0.7) marina.add(new THREE.CylinderGeometry(0.1, 0.1, rand(6, 9), 4), 0x7a5a3c, x + 1.4, 4, 0);
  }
  add(marina.build(), mP, 0, 0, -381);
  // kıyıda palmiyeler ve serviler
  const palms = new Kit();
  for (let x = -420; x < 460; x += rand(14, 32)) if (Math.abs(x - kx) > 50) palmRow(palms, x, 0, rand(6, 8.5), rand(-0.12, 0.12));
  add(palms.build(), mP, 0, 0, -389);
  for (let x = -500; x < 500; x += rand(20, 45)) add(new THREE.ConeGeometry(1.1, rand(7, 11), 6), mP, x, hillY(x) * rand(0.3, 0.7) + 4, -402.5, far, 0x2f4a2a);
  const glowTex = glow();
  farLights(170, -560, 560, 1, 20, -392, glowTex);
  farShipsBuild(mP);
}

// ---------------- Çanakkale (Boğaz): iki yakada yeşil-kahve Gelibolu tepeleri, uzakta 1915 Çanakkale Köprüsü (iki dev kırmızı kule, asma kablolar),
// kıyıda Kilitbahir Kalesi (yonca planlı iç kale), tepede Şehitler Abidesi silüeti, sağda kiremit damlı alçak Çanakkale ve Saat Kulesi, Boğaz'da şilepler ----------------
// Kuzey Ege ışığı: berrak, Muğla'dan serin ve rüzgârlı (ince bulut şeritleri), koyu mavi-yeşil su
const CK_FAC = [0xf1e6d2, 0xe8d6b8, 0xf4efe6, 0xdfd2bd, 0xe9c9a6, 0xd9e0e2, 0xf0dcc8], CK_ROOF = [0xb5523e, 0xa8473f, 0xc0603f];
function buildCanakkale() {
  const mP = paint(), STONE = 0xc9b89a, STONE2 = 0xb3a283, RED = 0xc8202a, RED2 = 0xa3161e, CAB = 0xe2ddd4;
  farClouds();
  farRidges(mP, mP, mP, [30, 10, 10, 5], { far: 0x8c9a7c, near: 0x6c7d52 }, { facades: CK_FAC, roofs: CK_ROOF, roofP: 0.7 });
  farHaze(-450, 16); farHaze(-414, 9, 0.6);
  // Gelibolu yakası: solda yükselen yumuşak sırtlar (zeytin, çam, kuru ot), sağa doğru alçalır
  const hillY = x => 8 + 24 * Math.exp(-(((x + 190) / 140) ** 2)) + 9 * Math.exp(-(((x - 230) / 150) ** 2)) + Math.sin(x * 0.05) * 1.6 + Math.sin(x * 0.14 + 2) * 0.7;
  const hl = new THREE.Shape(); hl.moveTo(-620, -5);
  for (let x = -620; x <= 620; x += 8) hl.lineTo(x, hillY(x));
  hl.lineTo(620, -5);
  add(new THREE.ShapeGeometry(hl), mP, 0, 0, -404, far, (x, y) => (y < 8 ? 0x5c6d45 : y < 18 ? 0x72804e : 0x948f62));
  // Şehitler Abidesi: en yüksek sırtta dört ayak üstünde kare tabla (yalnız sade silüet)
  const ax = -190, ay = hillY(ax) - 1.5, MON = 0xb7b1a4;
  for (const dx of [-7.5, 7.5]) add(new THREE.BoxGeometry(3, 30, 3), mP, ax + dx, ay + 15, -403.5, far, MON);
  add(new THREE.BoxGeometry(20, 5, 3), mP, ax, ay + 32, -403.5, far, MON);
  add(new THREE.BoxGeometry(24, 2, 3), mP, ax, ay + 0.5, -403.2, far, 0x9d978a);
  // Kilitbahir Kalesi: kıyıda yonca planlı iç kale (üç yuvarlak yaprak, ortada yüksek kule), önünde kalp biçimli sur
  const kx = -95, kz = -386;
  for (const dx of [-7, 0, 7]) add(new THREE.CylinderGeometry(5, 5.5, dx ? 12 : 14, 14), mP, kx + dx, (dx ? 12 : 14) / 2, kz - (dx ? 0 : 3), far, dx ? STONE : STONE2);
  add(new THREE.BoxGeometry(8, 22, 6), mP, kx, 11, kz - 2, far, STONE2);
  for (let t = -3; t <= 3; t += 2) add(new THREE.BoxGeometry(1, 1.4, 1), mP, kx + t, 22.7, kz + 1.2, far, STONE2);
  add(new THREE.BoxGeometry(46, 6, 2), mP, kx, 3, kz + 2, far, STONE);
  for (const dx of [-24, 24]) add(new THREE.CylinderGeometry(2.6, 2.9, 8, 10), mP, kx + dx, 4, kz + 2.5, far, STONE2);
  for (let t = -21; t <= 21; t += 2.2) add(new THREE.BoxGeometry(1, 1, 1), mP, kx + t, 6.5, kz + 2.8, far, STONE);
  // karşı yakanın kıyı köyleri (Kilitbahir, Eceabat): kiremit damlı alçak evler
  farTown(mP, -393, 3, 7, 0, -560, -130, far, 0.25, { facades: CK_FAC, roofs: CK_ROOF, roofP: 0.85 });
  farTown(mP, -393, 3, 7, 0, -60, 60, far, 0.35, { facades: CK_FAC, roofs: CK_ROOF, roofP: 0.85 });
  // Çanakkale: sağda alçak, kiremit damlı kent; Saat Kulesi rıhtımın arkasında
  farTown(mP, -396, 5, 12, 0, 90, 600, far, 0.08, { facades: CK_FAC, roofs: CK_ROOF, roofP: 0.75 });
  farTown(mP, -389, 3, 8, 0, 80, 600, far, 0.12, { facades: CK_FAC, roofs: CK_ROOF, roofP: 0.8 });
  const cx = 150, cz = -386;
  add(new THREE.BoxGeometry(4.6, 22, 4.6), mP, cx, 11, cz, far, 0xeee4cf);
  for (const y of [5, 10, 15, 20]) add(new THREE.BoxGeometry(5.4, 0.6, 5.4), mP, cx, y, cz, far, 0xa89a82);
  add(new THREE.CircleGeometry(1.4, 14), mP, cx, 18, cz + 2.35, far, 0xfffdf6);
  add(new THREE.ConeGeometry(3.4, 5, 4), mP, cx, 24.6, cz, far, 0x7f8c99).rotation.y = Math.PI / 4;
  // 1915 Çanakkale Köprüsü: uzakta Boğaz'ı kesen ince tabla, iki dev kırmızı kule (iki bacak, kirişler), asma kablolar ve askılar
  const bx0 = 230, bx1 = 420, bz = -366, top = 96, deck = 20;
  for (const x of [bx0, bx1]) {
    for (const dz of [-2, 2]) add(new THREE.BoxGeometry(2.6, top, 1.6), mP, x, top / 2, bz + dz, far, RED);
    for (const y of [deck - 2, 55, top - 3]) add(new THREE.BoxGeometry(2.8, 2.2, 5.2), mP, x, y, bz, far, RED2);
    add(new THREE.BoxGeometry(3, 1.2, 5.4), mP, x, top + 0.6, bz, far, 0xf2efe9);
  }
  add(new THREE.BoxGeometry(520, 1.6, 4), mP, (bx0 + bx1) / 2, deck, bz, far, 0x8d949c);
  const hangerGeo = new THREE.BoxGeometry(0.2, 1, 0.2);
  for (const [a, b, ya, yb, low] of [[bx0 - 130, bx0, deck, top - 1, (deck + top) / 2 - 10], [bx0, bx1, top - 1, top - 1, deck + 3], [bx1, bx1 + 130, top - 1, deck, (deck + top) / 2 - 10]]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a, ya, bz), new THREE.Vector3((a + b) / 2, 2 * low - (ya + yb) / 2, bz), new THREE.Vector3(b, yb, bz));
    add(new THREE.TubeGeometry(curve, 36, 0.4, 4), mP, 0, 0, 0, far, CAB);
    for (let k = 1; k < 22; k++) { const p = curve.getPoint(k / 22); if (p.y - deck < 1.5) continue; const h = add(hangerGeo.clone(), mP, p.x, (p.y + deck) / 2, bz, far, CAB); h.scale.y = p.y - deck; }
  }
  const glowTex = glow(), dots = [];
  for (let x = bx0 - 120; x < bx1 + 120; x += 7) dots.push(x, deck + 1.2, bz + 2.2);
  for (const x of [bx0, bx1]) dots.push(x, top + 2, bz + 1);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  far.add(new THREE.Points(lg, new THREE.PointsMaterial({ map: glowTex, color: 0xffe2a0, size: 5, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
  // kıyıda serviler ve çamlar
  for (let x = -520; x < 520; x += rand(18, 40)) add(new THREE.ConeGeometry(1.2, rand(7, 11), 6), mP, x, hillY(x) * rand(0.25, 0.6) + 4, -402.5, far, x < 0 ? 0x2f4a2a : 0x35512e);
  farLights(150, -560, 560, 1, 14, -392, glowTex);
  farShipsBuild(mP);
}

// ---------------- Samsun (Orta Karadeniz): uzun düz kıyı boyunca geniş, modern kent (sık orta katlı apartman blokları), arkasında Trabzon'dan çok alçak ve yumuşak
// yeşil tepeler; solda Kızılırmak deltasının düz sazlık ovası ve bataklık gölleri, kentin batısında teleferikli Amisos tepesi ve tümülüsleri, sağda vinçli büyük liman
// ve yanaşık gemiler, kıyıda küçük Onur Anıtı (atlı Atatürk) silüeti. Karadeniz yaz günü: Trabzon'dan berrak, deniz mavi-yeşil ----------------
const SM_FAC = [0xf6f2ea, 0xefe6d6, 0xe8dcc6, 0xdfe6ea, 0xf2e2c6, 0xe6d2c0, 0xd8e2d6, 0xf0d8b8], SM_ROOF = [0xa8473f, 0x8a8f93];
const smStep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function buildSamsun() {
  const mP = paint(), GREEN = 0x5f9a4c, GREEN2 = 0x4f8a42, DELTA = 0x9aac5a;
  farClouds();
  farRidges(mP, mP, mP, [18, 6, 9, 4], { far: 0x86a878, near: 0x679a56 }, { facades: SM_FAC, roofs: SM_ROOF, roofP: 0.25 });
  farHaze(-450, 12, 0.6);
  const row = (fy, z, col) => { // tek parça sırt silüeti
    const sh = new THREE.Shape(); sh.moveTo(-620, -5);
    for (let x = -620; x <= 620; x += 6) sh.lineTo(x, fy(x));
    sh.lineTo(620, -5);
    add(new THREE.ShapeGeometry(sh), mP, 0, 0, z, far, col);
  };
  const delta = x => smStep(170, 230, -x); // solda delta: tepeler ovaya iner
  // arkada: alçak, yumuşak yeşil tepeler (Trabzon'un dağlarının yarısından da alçak)
  const backY = x => 4 + (20 + 7 * Math.sin(x * 0.008 + 0.7) + 3 * Math.sin(x * 0.023 + 2.1)) * (1 - 0.9 * delta(x));
  row(backY, -430, (x, y) => (y > 22 ? 0x7f9f76 : 0x6c9461));
  // ön sıra: kentin arkasında yeşil sırt; batıda yuvarlak Amisos tepesi
  const amX = -120, hillY = x => 3 + (10 + 2.5 * Math.sin(x * 0.03 + 1) + Math.sin(x * 0.11) * 0.8) * (1 - delta(x)) + 22 * Math.exp(-(((x - amX) / 55) ** 2));
  row(hillY, -410, (x, y) => (y < 8 ? GREEN : y < 20 ? GREEN2 : 0x5a9046));
  // Kızılırmak deltası: düz sazlık ova, bataklık gölleri, saz öbekleri
  add(new THREE.BoxGeometry(260, 3, 8), mP, -300, 0.6, -404, far, (x, y) => (y > 1.6 ? DELTA : 0x7a8a46));
  const lake = basic(PAL.seaFar, { transparent: true, opacity: 0.85, depthWrite: false, vertexColors: false });
  for (const [x, w] of [[-380, 30], [-300, 22], [-232, 26]]) { const m = add(new THREE.CircleGeometry(1, 14), lake, x, 2.15, -399.8); m.scale.set(w, 1.1, 1); m.renderOrder = 1; }
  const reeds = new Kit();
  for (let x = -430; x < -175; x += rand(3, 7)) reeds.add(new THREE.ConeGeometry(rand(1, 1.8), rand(2.5, 4.5), 4), pick([0x8a9a46, 0xb8ac5a, 0x6f8a3a]), x, 3.2, rand(-1, 1));
  add(reeds.build(), mP, 0, 0, -398);
  // Amisos tepesi: tepede iki üç tümülüs (çimenli yuvarlak höyük), kıyıdan tepeye teleferik hattı, direkler, kırmızı kabinler
  const tum = new Kit();
  for (const [dx, r] of [[-12, 6], [2, 8], [15, 5]]) tum.add(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x86a45a, amX + dx, hillY(amX + dx) - 1.2, 0, 0, 0, 0, 1, 0.45, 1);
  add(tum.build(), mP, 0, 0, -409);
  const tel = new Kit(), a = new THREE.Vector3(amX - 55, 4, 0), b = new THREE.Vector3(amX + 4, hillY(amX + 4) + 6, 0);
  { const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(0.25, 0.25, d.length(), 4); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate(a.x, a.y, a.z); tel.add(g, 0x3a3f48); }
  for (const u of [0.18, 0.5, 0.8]) { const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u; tel.add(new THREE.BoxGeometry(0.9, y - hillY(x) * 0.6, 0.9), 0x9aa0a6, x, (y + hillY(x) * 0.6) / 2, 0); }
  for (const u of [0.32, 0.66]) tel.add(new THREE.BoxGeometry(2.6, 2.2, 2), 0xd0312d, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - 2, 0);
  tel.add(new THREE.BoxGeometry(6, 4, 4), 0xe8e4da, b.x, b.y - 4, 0).add(new THREE.BoxGeometry(6, 3.5, 4), 0xe8e4da, a.x, 1.75, 0);
  add(tel.build(), mP, 0, 0, -403);
  // geniş modern kent: Amisos'tan limana kadar üç dört sıra orta katlı apartman bloğu (düz damlı, beyaz-krem-pastel), pencere bantları
  const city = new Kit();
  for (let r = 0; r < 4; r++) for (let x = -160 + rand(0, 8); x < 330;) {
    const w = rand(5, 10), h = rand(10, 22) * (1 - r * 0.12) + (Math.random() < 0.06 ? rand(8, 14) : 0), zz = -r * 3.2, c = pick(SM_FAC);
    if (Math.random() < 0.9) {
      city.add(new THREE.BoxGeometry(w, h + 2, 2.4), c, x + w / 2, (h - 2) / 2, zz);
      for (let y = 2.2; y < h - 1; y += 2.6) city.add(new THREE.PlaneGeometry(w * 0.82, 0.8), 0x5d7088, x + w / 2, y, zz + 1.22);
      city.add(new THREE.BoxGeometry(w + 0.3, 0.5, 2.6), 0xcfc8b8, x + w / 2, h + 0.25, zz);
    }
    x += w + rand(0.8, 2.6);
  }
  add(city.build(), mP, 0, 0, -398);
  farTown(mP, -391, 2.5, 6, 0, -165, 330, far, 0.1, { facades: SM_FAC, roofs: SM_ROOF, roofP: 0.35 });
  // Onur Anıtı: kıyıdaki meydanda yüksek kaide üstünde şaha kalkmış at ve süvari (küçük, sade silüet)
  const mon = new THREE.Group(), BR = 0x4a4038, PED = 0xd8d2c4; mon.position.set(-22, 0, -388); mon.scale.setScalar(1.6); far.add(mon); // uzaktan seçilsin diye biraz büyük
  add(new THREE.BoxGeometry(5, 7, 3), mP, 0, 3.5, 0, mon, PED);
  add(new THREE.BoxGeometry(5.2, 2.2, 1.4), mP, 0, 9.6, 0, mon, BR).rotation.z = 0.35;
  add(new THREE.BoxGeometry(1.2, 3.2, 1.2), mP, 2.6, 11.4, 0, mon, BR).rotation.z = -0.4;                  // boyun ve baş
  for (const dx of [-1.8, -1.0]) add(new THREE.BoxGeometry(0.6, 2.6, 0.6), mP, dx, 8, 0, mon, BR);          // arka bacaklar yerde
  for (const dx of [1.6, 2.3]) add(new THREE.BoxGeometry(0.6, 2.2, 0.6), mP, dx, 10.4, 0, mon, BR).rotation.z = 1.0; // ön bacaklar havada
  add(new THREE.BoxGeometry(1.2, 2.6, 1), mP, 0.1, 12, 0, mon, BR);                                          // süvari
  add(new THREE.BoxGeometry(0.9, 0.9, 0.9), mP, 0.1, 13.8, 0, mon, BR);
  // büyük liman: dalgakıran, konteyner yığınları, gantri vinçler, yanaşık şilepler
  const port = new Kit(), RED = 0xd0312d, WHITE = 0xf2efe9;
  port.add(new THREE.BoxGeometry(300, 1.6, 6), 0x9a9a92, 450, 0.8, 0).add(new THREE.BoxGeometry(220, 2.2, 3), 0xb0aca2, 430, 1.1, 8);
  for (let x = 320; x < 590; x += rand(4.5, 6)) for (let i = 0, n = 1 + ((Math.random() * 4) | 0); i < n; i++) port.add(new THREE.BoxGeometry(4.2, 2.4, 3), pick([0xd9573f, 0x3f7fc0, 0xe8a23a, 0x4f9a6a, 0xc94f7c, 0x3fa3a8]), x, 2.8 + i * 2.4, rand(-1, 1));
  for (const x of [345, 400, 455, 510, 565]) {
    for (const dx of [-3.5, 3.5]) port.add(new THREE.BoxGeometry(1, 26, 1), (f, y) => (Math.floor(y / 4) % 2 ? RED : WHITE), x + dx, 13, 0);
    port.add(new THREE.BoxGeometry(9, 1.4, 1.4), RED, x, 26, 0).add(new THREE.BoxGeometry(1.2, 1.2, 28), WHITE, x, 28, 7).add(new THREE.BoxGeometry(4, 3, 3), RED, x, 29, -2);
  }
  for (const [x, c] of [[380, 0x2f4f7a], [490, 0xb8434a]]) port.add(new THREE.BoxGeometry(60, 4.5, 8), c, x, 2.2, 7).add(new THREE.BoxGeometry(7, 9, 7), WHITE, x + 24, 9, 7).add(new THREE.BoxGeometry(1.6, 4, 1.6), 0x2b2d33, x + 25, 15, 7);
  add(port.build(), mP, 0, 0, -386);
  const glowTex = glow();
  farLights(170, -160, 590, 1, 18, -392, glowTex);
  farShipsBuild(mP);
}

// ---------------- Trabzon (Doğu Karadeniz): kıyının hemen ardında yükselen dik, gür yeşil dağlar (katman katman sırtlar, doruklarda sis, alçak bulut bantları),
// yamaçlara basamak basamak dizilmiş evler, kentin üstünde Boztepe, kıyıda küçük kubbeli Ayasofya, vinçli liman, uzak yamaçlarda şerit şerit çay bahçeleri ----------------
// Karadeniz ışığı: serin, gri-mavi gök ve yumuşak bulutlar, koyu yeşil-mavi deniz; kasvetli değil, gür ve okunur
const TB_FAC = [0xf4f1e8, 0xf1e6d2, 0xe8d6b8, 0xf6eee0, 0xdfe4e6, 0xe9c9a6, 0xf0d58c], TB_ROOF = [0xa8473f, 0x8a8f93, 0xb5523e, 0x7d8388];
function mistBand(z, y, h, a = 0.7) { // dağ yamacında yatay sis bandı: ortası yoğun, alt ve üst kenarı saydam
  const tex = canvasTex(4, 64, (g) => { const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, `rgba(255,255,255,${a})`); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 4, 64); });
  add(new THREE.PlaneGeometry(1500, h), basic(PAL.cloud2, { map: tex, transparent: true, depthWrite: false, vertexColors: false }), 0, y, z);
}
function buildTrabzon() {
  const mP = paint(), ST = 0xe2d6bc, TILE = 0xb5634a;
  farClouds();
  farRidges(mP, mP, mP, [40, 14, 20, 8], { far: 0x5f7f6c, near: 0x3f6f45 }, { facades: TB_FAC, roofs: TB_ROOF, roofP: 0.8 });
  const row = (fy, z, col) => { // tek parça sırt silüeti
    const sh = new THREE.Shape(); sh.moveTo(-620, -5);
    for (let x = -620; x <= 620; x += 6) sh.lineTo(x, fy(x));
    sh.lineTo(620, -5);
    add(new THREE.ShapeGeometry(sh), mP, 0, 0, z, far, col);
  };
  // en arkada: sise karışan koyu yeşil-mavi dorukler (Kaçkarlara uzanan sıra)
  const backY = x => 66 + 20 * Math.sin(x * 0.009 + 1.2) + 11 * Math.sin(x * 0.027 + 0.4) + 5 * Math.sin(x * 0.071 + 2);
  row(backY, -438, (x, y) => (y > 80 ? 0xb6c6c4 : y > 64 ? 0x7f9a90 : 0x5a7d6c));
  mistBand(-436, 60, 20, 0.8);
  // orta sıra: çay bahçeli yamaçlar (eşyükselti şeritleri), üstü koyu orman
  const midY = x => 38 + 16 * Math.sin(x * 0.013 + 0.3) + 8 * Math.sin(x * 0.041 + 1.1) + 3 * Math.sin(x * 0.11);
  const teaX = x => (x > -380 && x < -90) || (x > 200 && x < 470);
  row(midY, -422, (x, y) => (teaX(x) && y > 10 && y < midY(x) - 7 ? (Math.floor(y / 2.2) % 2 ? 0x76ad48 : 0x427e36) : y > 34 ? 0x2f5f38 : 0x3a6e3e));
  mistBand(-419, 42, 12, 0.55);
  // ön sıra: kıyının hemen ardında dik yeşil yamaç; sağda kentin üstünde yuvarlak Boztepe
  const hillY = x => 12 + 28 * Math.exp(-(((x - 110) / 70) ** 2)) + 14 * Math.exp(-(((x + 210) / 110) ** 2)) + Math.sin(x * 0.05) * 2 + Math.sin(x * 0.15 + 1) * 0.8;
  row(hillY, -404, (x, y) => (y < 10 ? 0x4f8a42 : y < 24 ? 0x437d3b : 0x356c35));
  // yamaca basamak basamak tırmanan evler: alt sıralar önde, yukarı çıktıkça geride ve seyrek; Boztepe'nin sırtına kadar
  const town = new Kit();
  for (let r = 0; r < 9; r++) for (let x = -560; x < 560;) {
    const w = rand(4, 7.5), h = rand(3, 5), y = r * 3, top = hillY(x + w / 2) * 0.9;
    if (y + h < top && Math.random() < 0.9 - r * 0.07) {
      const zz = -r * 0.9;
      town.add(new THREE.BoxGeometry(w, h + 2, 2), pick(TB_FAC), x + w / 2, y + (h - 2) / 2, zz);
      town.add(new THREE.BoxGeometry(w + 0.6, 0.9, 2.2), pick(TB_ROOF), x + w / 2, y + h + 0.3, zz);
      if (Math.random() < 0.55) town.add(new THREE.PlaneGeometry(0.9, 1.2), 0x4d6684, x + w * rand(0.25, 0.75), y + h * 0.55, zz + 1.02);
    }
    x += w + (Math.random() < 0.25 ? rand(3, 10) : rand(0, 1.5));
  }
  add(town.build(), mP, 0, 0, -398);
  // ormanlık: yamaçlarda koyu yeşil ağaç tepeleri
  const trees = new Kit();
  for (let x = -600; x < 600; x += rand(6, 14)) { const y = hillY(x) * rand(0.55, 0.95); trees.add(new THREE.SphereGeometry(rand(2.2, 3.6), 6, 4), pick([0x2f6a30, 0x3a7838, 0x2a5e2e]), x, y, rand(-2, 0), 0, 0, 0, 1, 0.8, 0.6); }
  add(trees.build(), mP, 0, 0, -401);
  // alçak bulut bantları: Boztepe'nin ve dağların önünde yassı, yarı saydam bulutlar
  const lowCloud = basic(PAL.cloud, { transparent: true, opacity: 0.5, depthWrite: false });
  for (const [x, y] of [[-330, 46], [-60, 52], [150, 40], [380, 48]]) { const c = add(new THREE.CircleGeometry(1, 9), lowCloud, x, y, -410); c.scale.set(rand(60, 110), rand(3, 5), 1); }
  // kıyı sırası ve liman: alçak evler, sağda vinçler ve konteyner yığınları
  farTown(mP, -391, 3, 8, 0, -600, 120, far, 0.15, { facades: TB_FAC, roofs: TB_ROOF, roofP: 0.85 });
  const port = new Kit(), RED = 0xd0312d, WHITE = 0xf2efe9;
  port.add(new THREE.BoxGeometry(240, 1.6, 6), 0x9a9a92, 270, 0.8, 0);
  for (let x = 160; x < 380; x += rand(4.5, 6)) for (let i = 0, n = 1 + ((Math.random() * 3) | 0); i < n; i++) port.add(new THREE.BoxGeometry(4.2, 2.4, 3), pick([0xd9573f, 0x3f7fc0, 0xe8a23a, 0x4f9a6a, 0xc94f7c, 0x3fa3a8]), x, 2.8 + i * 2.4, rand(-1, 1));
  for (const x of [190, 250, 320]) { // gantri vinçler: iki ayak, kiriş, denize uzanan bumba
    for (const dx of [-3.5, 3.5]) port.add(new THREE.BoxGeometry(1, 24, 1), (f, y) => (Math.floor(y / 4) % 2 ? RED : WHITE), x + dx, 12, 0);
    port.add(new THREE.BoxGeometry(9, 1.4, 1.4), RED, x, 24, 0).add(new THREE.BoxGeometry(1.2, 1.2, 26), WHITE, x, 26, 6).add(new THREE.BoxGeometry(4, 3, 3), RED, x, 27, -2);
  }
  add(port.build(), mP, 0, 0, -388);
  // Ayasofya: kıyıda alçak sette küçük Bizans kilisesi (haç planlı, ortada kasnaklı kubbe), batısında kare çan kulesi
  const ax = -130, az = -389;
  add(new THREE.BoxGeometry(22, 2, 6), mP, ax, 1, az + 1, far, 0xcbbd9f);
  add(new THREE.BoxGeometry(14, 7, 4), mP, ax, 5.5, az, far, ST);
  add(new THREE.BoxGeometry(6, 9, 4.5), mP, ax, 6.5, az - 0.5, far, ST);
  add(new THREE.CylinderGeometry(2.4, 2.4, 3, 12), mP, ax, 12, az, far, ST);
  add(new THREE.SphereGeometry(2.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mP, ax, 13.5, az, far, TILE);
  add(new THREE.ConeGeometry(8.5, 2.6, 4), mP, ax, 10.3, az, far, TILE).rotation.y = Math.PI / 4;
  add(new THREE.BoxGeometry(3.2, 15, 3.2), mP, ax - 15, 7.5, az, far, ST);
  add(new THREE.ConeGeometry(2.6, 3, 4), mP, ax - 15, 16.5, az, far, TILE).rotation.y = Math.PI / 4;
  const glowTex = glow();
  farLights(160, -560, 560, 1, 26, -392, glowTex);
  farShipsBuild(mP);
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
  mugla: { // Ege ikindisi (Bodrum): berrak koyu mavi gök, lacivertten turkuaza deniz, kuru okra-zeytin tepeler, bembeyaz evler
    skyTop: 0x2a6fcc, skyMid: 0x78b4ea, skyLow: 0xcfe7f6, horizon: 0xf2f1e2, fog: 0xd8e8f0, sun: 0xfffbea,
    seaDeep: 0x0a5a9c, seaShallow: 0x36c8d2, seaSky: 0xd3edf6, seaFar: 0x9cc8e4,
    hillFar: 0xc2b08c, hillNear: 0x9a9468, city: 0xb1a99a, cityFar: 0xcac2b6, bridge: 0x9fb6c6, tower: 0xc9ab7a,
    cloud: 0xffffff, cloud2: 0xeef4fa, hemiSky: 0xf4f8ff, hemiGround: 0x4a86b0, sunLight: 0xfff2d6,
  },
  canakkale: { // Kuzey Ege (Boğaz): berrak ve serin mavi gök, rüzgârlı beyaz bulutlar, koyu mavi-yeşil akıntılı su, yeşil-kahve Gelibolu tepeleri
    skyTop: 0x2f6cbc, skyMid: 0x7fb1de, skyLow: 0xd2e5f0, horizon: 0xeaf0ea, fog: 0xd0e0e8, sun: 0xfffaf0,
    seaDeep: 0x0b4766, seaShallow: 0x23908f, seaSky: 0xcde4ee, seaFar: 0x8fb7c6,
    hillFar: 0x9aa88a, hillNear: 0x6f8158, city: 0xa69c90, cityFar: 0xc0bab2, bridge: 0xc8202a, tower: 0xc8202a,
    cloud: 0xffffff, cloud2: 0xe4edf4, hemiSky: 0xeef6ff, hemiGround: 0x3f7c8a, sunLight: 0xfff4e0,
  },
  trabzon: { // Doğu Karadeniz: serin gri-mavi gök, yumuşak bulutlar, koyu yeşil-mavi deniz, gür yeşil dağlar; kasvetli değil, berrak
    skyTop: 0x5a82ad, skyMid: 0x9db8d0, skyLow: 0xd5e0e6, horizon: 0xe2e8e4, fog: 0xcbd8dc, sun: 0xfff6e8,
    seaDeep: 0x0c3e4e, seaShallow: 0x1f7a74, seaSky: 0xc2d4da, seaFar: 0x84a4aa,
    hillFar: 0x6f8f78, hillNear: 0x4a7a4f, city: 0x9a9a92, cityFar: 0xb6b8b2, bridge: 0x9aa8b2, tower: 0x8a8f8a,
    cloud: 0xf6f8f9, cloud2: 0xe2e8ec, hemiSky: 0xe8eff4, hemiGround: 0x3b6f6c, sunLight: 0xfff0dc,
  },
  samsun: { // Orta Karadeniz yaz günü: Trabzon'dan berrak açık mavi gök, beyaz bulutlar, mavi-yeşil deniz, alçak yeşil tepeler, beyaz kent
    skyTop: 0x3f7fc8, skyMid: 0x8ebde6, skyLow: 0xd6eaf4, horizon: 0xeef2ea, fog: 0xd4e6ee, sun: 0xfffbea,
    seaDeep: 0x0d5a6e, seaShallow: 0x2a9a8e, seaSky: 0xcfe6ee, seaFar: 0x8fc0c8,
    hillFar: 0x86a878, hillNear: 0x5f9a4c, city: 0xa8a49a, cityFar: 0xc2c0b8, bridge: 0x9aa8b2, tower: 0x9a9a92,
    cloud: 0xffffff, cloud2: 0xe8f0f6, hemiSky: 0xeef6ff, hemiGround: 0x3f8a80, sunLight: 0xfff2d8,
  },
};
const FAR = { istanbul: buildIstanbul, izmir: buildIzmir, antalya: buildAntalya, mugla: buildMugla, canakkale: buildCanakkale, trabzon: buildTrabzon, samsun: buildSamsun };
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
  rain: { farFog: 0.55, tint: 0x5d6879, amt: 0.62, sun: 0.26, fog: [30, 185], sea: 1.05, light: 0.78, sky: 0.82 }, // bulutlu, kurşuni: belli olsun
  snow: { farFog: 0.55, tint: 0xe2e8f2, amt: 0.55, sun: 0.7, fog: [40, 220] },
  fog: { farFog: 1, tint: 0xe9e6e8, amt: 0.72, sun: 0.55, fog: [14, 135] },
};
const _t = new THREE.Color();
const toned = (hex, w) => new THREE.Color(hex).lerp(_t, w.amt);
export function applyWeather(kind) {
  const w = WEATHER[kind] || WEATHER.clear; _t.setHex(w.tint);
  const u = skyMat.uniforms, ws = { amt: w.sky || w.amt }; // yağmurda gök ayrıca koyulaşır: bulutlu, kurşuni
  u.top.value.copy(toned(PAL.skyTop, ws)); u.mid.value.copy(toned(PAL.skyMid, ws)); u.low.value.copy(toned(PAL.skyLow, ws)); u.hor.value.copy(toned(PAL.horizon, ws));
  u.sunCol.value.setHex(PAL.sun).multiplyScalar(w.sun);
  scene.fog.color.copy(toned(PAL.fog, w)); scene.fog.near = w.fog[0]; scene.fog.far = w.fog[1];
  const wu = waterMat.uniforms;
  wu.uSky.value.copy(toned(PAL.seaSky, w)); wu.uFar.value.copy(toned(PAL.seaFar, w)).lerp(scene.fog.color, w.farFog); wu.uSun.value.setHex(0xffe2b0).multiplyScalar(w.sun);
  wu.uDeep.value.copy(toned(PAL.seaDeep, { amt: w.amt * (w.sea || 0.4) })); wu.uShallow.value.copy(toned(PAL.seaShallow, { amt: w.amt * (w.sea || 0.4) }));
  sunLight.intensity = 2.4 * (0.5 + w.sun * 0.5) * (w.light || 1); hemi.color.copy(toned(PAL.hemiSky, w)); hemi.intensity = 1.25 * (w.light || 1);
  for (const m of farMats) {
    const amt = Math.min(0.85, w.amt * (kind === 'fog' ? 1.6 : 1.1));
    if (m.userData.wash) m.userData.wash.value.set(_t.r, _t.g, _t.b, amt); else m.color.copy(toned(m.userData.base, { amt }));
  }
}
