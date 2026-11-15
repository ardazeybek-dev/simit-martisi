import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[(Math.random() * a.length) | 0];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
// tohumlu rastgele (mulberry32) ve metin karması: günün uçuşunda herkes aynı rotayı uçar
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = (...parts) => { let h = 2166136261; for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// küçük, güvenli localStorage sarmalayıcısı (gizli sekmede patlamasın)
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { if (store.locked) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  locked: false, // hesap taşınınca sayfa yenilenene dek kimse yazmasın (kapanırken eski bellek taşınan kaydı ezmesin)
};
// tek seferlik sıfırlama: işaret anahtarı yoksa bu cihazdaki bütün kayıtlar (cüzdan, rekor, görev, rozet...) silinir, ayarlar kalır.
// Herkesi yeniden sıfırdan başlatmak gerekirse RESET_MARK değiştirilir. util.js ilk yüklenen modül: main.js kayıtları okumadan çalışır.
const RESET_MARK = 'simit-martisi-reset-2026-10-31';
try {
  if (!localStorage.getItem(RESET_MARK)) {
    const keep = ['simit-martisi-settings'];
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('simit-martisi') && !keep.includes(k)) localStorage.removeItem(k); }
    localStorage.setItem(RESET_MARK, '1');
  }
} catch (e) {}
// ikinci sıfırlama: yalnızca harcanabilir şeyler (simit cüzdanı, balık, kostümler, güç yükseltmeleri, günün indirimi); rekor ve sıralama kalır
const ECO_MARK = 'simit-martisi-eco-reset-2026-11-09';
try {
  if (!localStorage.getItem(ECO_MARK)) {
    for (const k of ['wallet', 'fish', 'look', 'upgrades', 'deal']) localStorage.removeItem('simit-martisi-' + k);
    localStorage.setItem(ECO_MARK, '1');
  }
} catch (e) {}

// başarımlar sıfırlanır (sayaçlar, alınan ödüller, rozetler); yalnızca rekor mesafe ve puan kalır (rekor şamandırası bundan okunur)
const ACH_MARK = 'simit-martisi-ach-reset-2026-11-09';
try {
  if (!localStorage.getItem(ACH_MARK)) {
    const a = JSON.parse(localStorage.getItem('simit-martisi-ach') || 'null'), st = (a && a.st) || {};
    if (a) localStorage.setItem('simit-martisi-ach', JSON.stringify({ st: { maxDist: st.maxDist || 0, maxScore: st.maxScore || 0 }, got: {} }));
    localStorage.setItem(ACH_MARK, '1');
  }
} catch (e) {}

// Kit: birçok parçayı tek bir vertex-renkli geometriye birleştirir → tek draw call
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();
export class Kit {
  constructor() { this.parts = []; }
  // color: sayı ya da (yüzİndeksi, yüzMerkeziY) => sayı; fonksiyonda .vert varsa köşe başına çağrılır: (yüz, y, x, z) => sayı;
  // null: geometrinin kendi köşe renkleri (hazır bir Kit gövdesi başka bir Kit'e eklenir, ör. oyundaki feribot menü sahnesinde)
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    this.parts.push({ g, color });
    return this;
  }
  // smooth: parçaların kendi normalleri korunur (küre, silindir yumuşak; kutu köşeli kalır). Yoksa her yüz düz gölgelenir.
  build({ smooth = false } = {}) {
    let n = 0;
    for (const p of this.parts) n += p.g.attributes.position.count;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = smooth ? new Float32Array(n * 3) : null;
    let o = 0;
    for (const { g, color } of this.parts) {
      const a = g.attributes.position.array, cnt = g.attributes.position.count;
      pos.set(a, o * 3);
      if (nor) nor.set(g.attributes.normal.array, o * 3);
      if (color === null) { col.set(g.attributes.color.array, o * 3); o += cnt; g.dispose(); continue; }
      for (let v = 0; v < cnt; v += 3) {
        const face = v / 3, cy = (a[v * 3 + 1] + a[v * 3 + 4] + a[v * 3 + 7]) / 3;
        if (color.vert) {
          for (let k = 0; k < 3; k++) { const j = (v + k) * 3, i = (o + v + k) * 3; _c.setHex(color(face, a[j + 1], a[j], a[j + 2])); col[i] = _c.r; col[i + 1] = _c.g; col[i + 2] = _c.b; }
          continue;
        }
        _c.setHex(typeof color === 'function' ? color(face, cy) : color);
        for (let k = 0; k < 3; k++) { const i = (o + v + k) * 3; col[i] = _c.r; col[i + 1] = _c.g; col[i + 2] = _c.b; }
      }
      o += cnt;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); else out.computeVertexNormals();
    out.computeBoundingSphere();
    return out;
  }
}

// tüm modellerin ortak malzemesi: renk köşelerden gelir, düz gölgeleme low-poly görünüm verir
export const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 });
// ana menü manzarası: yumuşak gölgeli (Kit.build({ smooth: true }) normalleriyle), tepeler ve kubbeler köşeli durmaz
export const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });

// canvas'tan doku üret
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------- Rize çay bardağı kulesi (oyun, ufuk, menü ve dünya haritası aynı biçimi ve LED dokusunu kullanır) ----------------
// ince belli bardak profili: dipte hafif şişkin, belde ince, ağza doğru açılır (yarıçap x, yükseklik y; dip y=0, ağız ~15,6). Noktalar yay boyunca eşit aralıklı:
// LatheGeometry'nin v'si nokta sırasıyla gider, LED satırları gövdede düzgün dizilsin
let teaProf = null;
export function teaGlassProfile() {
  if (teaProf) return teaProf;
  const ctl = [[1.55, 0], [2.05, 1.6], [2.2, 3.4], [1.85, 5.8], [1.5, 8.0], [1.62, 10.2], [2.25, 12.6], [2.85, 14.6], [3.05, 15.6]];
  return (teaProf = new THREE.SplineCurve(ctl.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(48));
}
// LED dokusu: demli çay zemini üstünde şaşırtmalı nokta ızgarası. Canvas üstü = bardağın ağzı: en üstte kırmızı bant, ağızda beyaz, gövde demli çay kırmızısı.
// Zemin kara değil koyu çay: uzakta noktalar karışınca bardak kara-kızıl leke değil, içi çay dolu cam gibi okunur. GLINT sütunlarında noktalar beyaza çalar
// (camın dikey parıltısı; doku iki kez sarıldığı için gövdede karşılıklı iki parıltı). grey: dünya haritasında kilitli şehrin grileşmiş hâli (aynı desen, renksiz)
const GLINT = i => Math.max(0, 1 - Math.abs(i - 7) / 2.2) + 0.35 * Math.max(0, 1 - Math.abs(i - 11) / 1.2); // 40 sütunda parıltının gücü 0..1
export function teaGlassLedTex(grey = false) {
  const t = canvasTex(256, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); // zemin: ağızda açık camsı, gövdede koyu çay
    if (grey) bg.addColorStop(0, '#5d6066'), bg.addColorStop(1, '#5d6066'); else bg.addColorStop(0, '#6a2a22'), bg.addColorStop(0.17, '#8a5a52'), bg.addColorStop(0.2, '#5a120a'), bg.addColorStop(1, '#3e0904');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cols = 40, rows = 64;
    for (let j = 0; j < rows; j++) {
      const v = 1 - (j + 0.5) / rows;
      for (let i = 0; i < cols; i++) {
        const x = (i + (j % 2) * 0.5 + 0.5) / cols * w, y = (j + 0.5) / rows * h, n = 0.75 + 0.25 * Math.sin(i * 12.9898 + j * 78.233) * Math.sin(i * 3.1 + j * 1.7);
        let col;
        if (grey) { const l = (v > 0.84 && v <= 0.955 ? 215 : 160) * n | 0; col = `rgb(${l},${l},${l + 6})`; }
        else if (v > 0.955) col = `rgb(${(255 * n) | 0},${(40 * n) | 0},${(30 * n) | 0})`;               // en üstte kırmızı bant
        else if (v > 0.84) col = `rgb(255,${(238 + 17 * n) | 0},${(214 + 30 * n) | 0})`;             // ağız: beyaz
        else if (v > 0.8) col = j % 2 ? 'rgb(255,226,200)' : `rgb(255,${(70 * n) | 0},${(50 * n) | 0})`;  // beyazdan kırmızıya geçiş
        else col = `rgb(${(200 + 55 * n) | 0},${(28 + 30 * n * (1 - v)) | 0},${(20 * n) | 0})`;      // demli çay
        const gl = grey ? 0 : GLINT(i) * (v > 0.955 ? 0.3 : 0.75);
        if (gl > 0) { const m = col.match(/\d+/g).map(Number); col = `rgb(${m.map(c => (c + (255 - c) * gl) | 0).join(',')})`; }
        g.fillStyle = col; g.beginPath(); g.arc(x, y, v > 0.955 ? 2.6 : 2.0, 0, Math.PI * 2); g.fill();
      }
    }
  });
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
// ufuk bardağı: aynı renkler noktasız, yumuşak geçişli (ufukta nokta ızgarası titreşip kararıyordu); cam parıltısı yatay geçişle
export function teaGlassFarTex() {
  const t = canvasTex(64, 128, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, '#ff3a2a'); v.addColorStop(0.04, '#ff3a2a'); v.addColorStop(0.05, '#fff2e4'); v.addColorStop(0.15, '#ffe9da'); v.addColorStop(0.2, '#ff5a40');
    v.addColorStop(0.24, '#e8261a'); v.addColorStop(0.7, '#c41d12'); v.addColorStop(1, '#8c120a');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    const s = g.createLinearGradient(0, 0, w, 0); // iki parıltı (doku iki kez sarılır: biri)
    s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.12, 'rgba(255,245,235,.65)'); s.addColorStop(0.2, 'rgba(255,255,255,0)'); s.addColorStop(0.27, 'rgba(255,245,235,.25)'); s.addColorStop(0.32, 'rgba(255,255,255,0)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = s; g.fillRect(0, h * 0.05, w, h * 0.95);
  });
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
