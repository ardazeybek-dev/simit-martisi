import * as THREE from 'three';
import { rand, canvasTex } from './util.js';

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
const BEND_GLSL = `
#ifdef USE_FOG
  if (-mvPosition.z > uBend.w) {
    vec2 bxd = bendArc(bendArc(vec2(mvPosition.x, -mvPosition.z - uBend.w), uBend2), uBend);
    mvPosition.x = bxd.x; mvPosition.z = -(bxd.y + uBend.w);
  }
#endif
`;
THREE.ShaderChunk.fog_pars_vertex += `
#ifdef USE_FOG
  uniform vec4 uBend, uBend2;
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
THREE.Material.prototype.onBeforeCompile = function (shader) { shader.uniforms.uBend = BEND; shader.uniforms.uBend2 = BEND2; };

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
{
  const basic = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: false, ...o }); m.userData.base = c; farMats.push(m); return m; };
  const mFarHill = basic(PAL.hillFar), mHill = basic(PAL.hillNear), mCity = basic(PAL.city), mCityFar = basic(PAL.cityFar);
  const add = (geo, m, x, y, z, parent = far) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };

  // güneşin önünden geçen ince bulut şeritleri
  const cloudMat = basic(PAL.cloud, { transparent: true, opacity: 0.55, depthWrite: false });
  const cloudMat2 = basic(PAL.cloud2, { transparent: true, opacity: 0.6, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const c = add(new THREE.CircleGeometry(1, 7), i % 3 ? cloudMat2 : cloudMat, rand(-420, 300), rand(70, 190), -600);
    c.scale.set(rand(40, 110), rand(2.5, 6), 1);
  }

  // Anadolu yakası tepeleri: iki kat, sis rengine yakın
  const ridge = (z, y0, amp, m, seed) => {
    const sh = new THREE.Shape(); sh.moveTo(-700, -10);
    for (let x = -700; x <= 700; x += 20) sh.lineTo(x, y0 + Math.sin(x * 0.011 + seed) * amp + Math.sin(x * 0.031 + seed * 2) * amp * 0.4);
    sh.lineTo(700, -10);
    return new THREE.ShapeGeometry(sh);
  };
  // tepeler ve kıyı şehri ufku üç yandan sarar: virajda bakış dönünce silüet bitip çıplak deniz gökyüzüne yükselmesin
  for (const [ry, seed] of [[0, 0], [Math.PI / 2, 2.7], [-Math.PI / 2, 5.1]]) {
    const pivot = new THREE.Group(); pivot.rotation.y = ry; far.add(pivot);
    add(ridge(-470, 18, 9, mFarHill, 1.3 + seed), mFarHill, 0, 0, -470, pivot);
    add(ridge(-430, 8, 6, mHill, 4.1 + seed), mHill, 0, 0, -430, pivot);
    if (ry) { // yanlarda alçak, seyrek kıyı evleri
      const sc = new THREE.Shape(); sc.moveTo(-650, -5);
      for (let x = -650; x < 650;) { const w = rand(6, 14), h = Math.random() < 0.3 ? 0 : rand(3, 9); sc.lineTo(x, h); sc.lineTo(x + w, h); x += w; }
      sc.lineTo(650, -5);
      add(new THREE.ShapeGeometry(sc), mCityFar, 0, 0, -400, pivot);
    }
  }

  // tarihi yarımada silüeti: tek ShapeGeometry'de binalar
  const city = new THREE.Shape(); city.moveTo(-600, -5);
  for (let x = -600; x < 600;) { const w = rand(5, 12), h = rand(5, 16); city.lineTo(x, h); city.lineTo(x + w, h); x += w; }
  city.lineTo(600, -5);
  add(new THREE.ShapeGeometry(city), mCity, 0, 0, -390);

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
    far.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.35, 4), bm));
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
  const glowTex = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,230,170,.8)'); r.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
  far.add(new THREE.Points(lg, new THREE.PointsMaterial({ map: glowTex, color: 0xffe2a0, size: 5, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));

  // şehir ışıkları: silüetin önünde rastgele pencereler
  const cl = [];
  for (let i = 0; i < 260; i++) cl.push(rand(-560, 560), rand(1, 12), -388);
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
  far.add(new THREE.Points(cg, new THREE.PointsMaterial({ map: glowTex, color: 0xffc070, size: 3.2, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));

  // Kız Kulesi: küçük adacıkta
  const kx = 260, kz = -300, km = basic(PAL.tower);
  add(new THREE.CylinderGeometry(9, 11, 2, 10), km, kx, 0, kz);
  add(new THREE.BoxGeometry(9, 6, 7), km, kx - 1, 4, kz);
  add(new THREE.CylinderGeometry(2.2, 2.4, 13, 8), km, kx + 2, 8.5, kz);
  add(new THREE.ConeGeometry(2.8, 5, 8), km, kx + 2, 17.5, kz);
  add(new THREE.PlaneGeometry(0.9, 0.9), winMat, kx + 2, 13, kz + 2.45);
}

// ---------------- deniz (GPU'da dalga, Fresnel + güneş parıltısı) ----------------
const WATER_W = 300, WATER_D = 420, SEG_X = 90, SEG_Z = 130;
export const CELL = WATER_D / SEG_Z;
const WAVE = `
  uniform float uTime;
  float wave(vec2 p){
    return sin(p.x*0.16 + p.y*0.11 + uTime*1.3)*0.36
         + sin(p.x*0.33 - p.y*0.07 + uTime*2.0)*0.17
         + sin(p.x*0.71 + p.y*0.53 + uTime*2.9)*0.06;
  }
  // eğim türevden: dört kez wave() yerine üç cos (telefonda piksel başına ucuz)
  vec2 waveGrad(vec2 p){
    float c1 = cos(p.x*0.16 + p.y*0.11 + uTime*1.3)*0.36, c2 = cos(p.x*0.33 - p.y*0.07 + uTime*2.0)*0.17, c3 = cos(p.x*0.71 + p.y*0.53 + uTime*2.9)*0.06;
    return vec2(c1*0.16 + c2*0.33 + c3*0.71, c1*0.11 - c2*0.07 + c3*0.53);
  }`;
const waterMat = new THREE.ShaderMaterial({
  fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
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
      float h = wave(wp.xz) * (1.0 - smoothstep(90.0, 190.0, length(wp.xz - cameraPosition.xz)));
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
      vec2 p = vWorld.xz, gr = waveGrad(p);
      float hx = gr.x, hz = gr.y;
      vec2 rip = vec2(sin(p.x*2.3 + uTime*3.1) + sin(p.y*1.9 - uTime*2.4 + p.x*0.7),
                      sin(p.y*2.7 + uTime*2.6) + sin(p.x*1.3 + p.y*0.9 - uTime*3.3)) * 0.07;
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
  waterMat.uniforms.uTime.value = t;
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
