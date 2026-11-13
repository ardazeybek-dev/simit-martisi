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
  // color: sayı ya da (yüzİndeksi, yüzMerkeziY) => sayı; fonksiyonda .vert varsa köşe başına çağrılır: (yüz, y, x, z) => sayı
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
