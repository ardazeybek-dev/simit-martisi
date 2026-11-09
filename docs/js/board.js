// ---------------- sıralama: yerel taraf ----------------
// Asıl tablo sunucuda (net.js, supabase/schema.sql). Burada: bayrak çizimi ve cihazdaki haftalık en iyi kaydı.
import { store } from './util.js';

const KEY = 'simit-martisi-week';
const DAY = 864e5;
// pazartesi 00:00 (yerel) başlayan hafta; anahtar o pazartesinin tarihi
export function week(now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const start = d.getTime() - ((d.getDay() + 6) % 7) * DAY, end = start + 7 * DAY;
  const s = new Date(start);
  return { key: `${s.getFullYear()}-${s.getMonth() + 1}-${s.getDate()}`, left: end - now };
}

// profilde seçilebilen ülkeler: bayrağı aşağıda çizilenler (adlar Intl.DisplayNames ile oyuncunun dilinde)
export const COUNTRIES = ['TR', 'AZ', 'DE', 'NL', 'AT', 'BE', 'FR', 'GB', 'IE', 'CH', 'IT', 'ES', 'PT', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'HU', 'RO', 'BG', 'GR', 'CY', 'RS', 'BA', 'AL', 'MK', 'LT', 'EE', 'UA', 'RU', 'GE', 'KZ', 'UZ', 'TM', 'KG', 'IR', 'IQ', 'SY', 'SA', 'AE', 'QA', 'YE', 'EG', 'MA', 'DZ', 'TN', 'NG', 'PK', 'IN', 'CN', 'JP', 'KR', 'VN', 'ID', 'AU', 'US', 'CA', 'MX', 'BR', 'AR', 'CO', 'PE'];
// ---------------- bayraklar: emoji bayrak Windows'ta görünmez, küçük tuvalde çizilir ----------------
const flagCache = {};
export function flag(cc) {
  if (flagCache[cc]) return flagCache[cc];
  const cv = document.createElement('canvas'); cv.width = 30; cv.height = 20;
  const g = cv.getContext('2d'), W = 30, H = 20;
  const h3 = (a, b, c) => { g.fillStyle = a; g.fillRect(0, 0, W, 7); g.fillStyle = b; g.fillRect(0, 7, W, 6); g.fillStyle = c; g.fillRect(0, 13, W, 7); };
  const v3 = (a, b, c) => { g.fillStyle = a; g.fillRect(0, 0, 10, H); g.fillStyle = b; g.fillRect(10, 0, 10, H); g.fillStyle = c; g.fillRect(20, 0, 10, H); };
  const disc = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const cross = (bg, c, x = 11) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = c; g.fillRect(x - 2, 0, 4, H); g.fillRect(0, 8, W, 4); };
  const star = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.fill(); };
  const fill = c => { g.fillStyle = c; g.fillRect(0, 0, W, H); };
  const cross2 = (bg, o, c) => { cross(bg, o); g.fillStyle = c; g.fillRect(10, 0, 2, H); g.fillRect(0, 9, W, 2); };
  const moon = (x, y, r, c, bg, off) => { disc(x, y, r, c); disc(x + off, y, r * 0.8, bg); };
  switch (cc) {
    case 'TR': g.fillStyle = '#e30a17'; g.fillRect(0, 0, W, H); disc(12, 10, 6, '#fff'); disc(13.6, 10, 4.8, '#e30a17'); disc(19, 10, 2, '#fff'); break;
    case 'DE': h3('#111', '#dd0000', '#ffce00'); break;
    case 'RU': h3('#fff', '#0039a6', '#d52b1e'); break;
    case 'NL': h3('#ae1c28', '#fff', '#21468b'); break;
    case 'AZ': h3('#0092bc', '#e4002b', '#00af66'); disc(15, 10, 2.6, '#fff'); disc(15.8, 10, 2.1, '#e4002b'); break;
    case 'IN': h3('#ff9933', '#fff', '#138808'); disc(15, 10, 2.2, '#000080'); break;
    case 'FR': v3('#0055a4', '#fff', '#ef4135'); break;
    case 'IT': v3('#009246', '#fff', '#ce2b37'); break;
    case 'MX': v3('#006847', '#fff', '#ce1126'); disc(15, 10, 2, '#8a5a2b'); break;
    case 'ES': g.fillStyle = '#aa151b'; g.fillRect(0, 0, W, H); g.fillStyle = '#f1bf00'; g.fillRect(0, 5, W, 10); break;
    case 'PL': g.fillStyle = '#fff'; g.fillRect(0, 0, W, 10); g.fillStyle = '#dc143c'; g.fillRect(0, 10, W, 10); break;
    case 'ID': g.fillStyle = '#ce1126'; g.fillRect(0, 0, W, 10); g.fillStyle = '#fff'; g.fillRect(0, 10, W, 10); break;
    case 'UA': g.fillStyle = '#0057b7'; g.fillRect(0, 0, W, 10); g.fillStyle = '#ffd700'; g.fillRect(0, 10, W, 10); break;
    case 'JP': g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); disc(15, 10, 5.5, '#bc002d'); break;
    case 'KR': g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); disc(15, 10, 5, '#cd2e3a'); g.fillStyle = '#0047a0'; g.beginPath(); g.arc(15, 10, 5, 0, Math.PI); g.fill(); break;
    case 'SE': cross('#006aa7', '#fecc00'); break;
    case 'GR': for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#fff' : '#0d5eaf'; g.fillRect(0, i * H / 9, W, H / 9 + 0.5); } g.fillStyle = '#0d5eaf'; g.fillRect(0, 0, 12, 11); g.fillStyle = '#fff'; g.fillRect(5, 0, 2, 11); g.fillRect(0, 4.5, 12, 2); break;
    case 'GB': g.fillStyle = '#012169'; g.fillRect(0, 0, W, H); g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H); g.moveTo(W, 0); g.lineTo(0, H); g.stroke();
      g.strokeStyle = '#c8102e'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#fff'; g.fillRect(12, 0, 6, H); g.fillRect(0, 7, W, 6); g.fillStyle = '#c8102e'; g.fillRect(13.5, 0, 3, H); g.fillRect(0, 8.5, W, 3); break;
    case 'US': for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, i * H / 7, W, H / 7 + 0.5); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 13, 11); break;
    case 'BR': g.fillStyle = '#009c3b'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffdf00'; g.beginPath(); g.moveTo(15, 2); g.lineTo(28, 10); g.lineTo(15, 18); g.lineTo(2, 10); g.fill(); disc(15, 10, 4, '#002776'); break;
    case 'AT': h3('#c8102e', '#fff', '#c8102e'); break;
    case 'HU': h3('#ce2939', '#fff', '#477050'); break;
    case 'BG': h3('#fff', '#00966e', '#d62612'); break;
    case 'LT': h3('#fdb913', '#006a44', '#c1272d'); break;
    case 'EE': h3('#0072ce', '#000', '#fff'); break;
    case 'IR': h3('#239f40', '#fff', '#da0000'); disc(15, 10, 1.8, '#da0000'); break;
    case 'IQ': h3('#ce1126', '#fff', '#000'); g.fillStyle = '#007a3d'; g.fillRect(9, 9, 12, 2); break;
    case 'EG': h3('#ce1126', '#fff', '#000'); disc(15, 10, 1.8, '#c09300'); break;
    case 'SY': h3('#ce1126', '#fff', '#000'); star(11, 10, 2.2, '#007a3d'); star(19, 10, 2.2, '#007a3d'); break;
    case 'YE': h3('#ce1126', '#fff', '#000'); break;
    case 'RS': h3('#c6363c', '#0c4076', '#fff'); disc(9, 9, 2.5, '#c6363c'); break;
    case 'AR': h3('#74acdf', '#fff', '#74acdf'); disc(15, 10, 2, '#f6b40e'); break;
    case 'CO': g.fillStyle = '#fcd116'; g.fillRect(0, 0, W, 10); g.fillStyle = '#003893'; g.fillRect(0, 10, W, 5); g.fillStyle = '#ce1126'; g.fillRect(0, 15, W, 5); break;
    case 'UZ': h3('#0099b5', '#fff', '#1eb53a'); g.fillStyle = '#ce1126'; g.fillRect(0, 6.5, W, 1); g.fillRect(0, 12.5, W, 1); moon(5, 3.4, 2.4, '#fff', '#0099b5', 1); break;
    case 'TM': fill('#00843d'); g.fillStyle = '#d22630'; g.fillRect(4, 0, 5, H); moon(15, 5, 2.6, '#fff', '#00843d', 1.2); break;
    case 'KZ': fill('#00afca'); disc(15, 9, 4, '#fec50c'); g.fillStyle = '#fec50c'; g.fillRect(2, 0, 1.5, H); break;
    case 'KG': fill('#e8112d'); disc(15, 10, 5, '#ffef00'); disc(15, 10, 3, '#e8112d'); break;
    case 'GE': fill('#fff'); g.fillStyle = '#ff0000'; g.fillRect(13, 0, 4, H); g.fillRect(0, 8, W, 4); break;
    case 'BE': v3('#000', '#fdda24', '#ef3340'); break;
    case 'RO': v3('#002b7f', '#fcd116', '#ce1126'); break;
    case 'IE': v3('#169b62', '#fff', '#ff883e'); break;
    case 'NG': v3('#008751', '#fff', '#008751'); break;
    case 'PE': v3('#d91023', '#fff', '#d91023'); break;
    case 'CA': fill('#d52b1e'); g.fillStyle = '#fff'; g.fillRect(7.5, 0, 15, H); star(15, 10, 4.5, '#d52b1e'); break;
    case 'CH': fill('#d52b1e'); g.fillStyle = '#fff'; g.fillRect(13, 4, 4, 12); g.fillRect(9, 8, 12, 4); break;
    case 'DK': cross('#c8102e', '#fff'); break;
    case 'FI': cross('#fff', '#002f6c'); break;
    case 'NO': cross2('#ba0c2f', '#fff', '#00205b'); break;
    case 'PT': fill('#ff0000'); g.fillStyle = '#006600'; g.fillRect(0, 0, 12, H); disc(12, 10, 3.6, '#ffcc00'); disc(12, 10, 2.2, '#ff0000'); break;
    case 'CZ': g.fillStyle = '#fff'; g.fillRect(0, 0, W, 10); g.fillStyle = '#d7141a'; g.fillRect(0, 10, W, 10); g.fillStyle = '#11457e'; g.beginPath(); g.moveTo(0, 0); g.lineTo(15, 10); g.lineTo(0, 20); g.fill(); break;
    case 'CN': fill('#de2910'); star(6, 6, 3.4, '#ffde00'); star(11.5, 2.8, 1.1, '#ffde00'); star(13.5, 5.3, 1.1, '#ffde00'); star(13.5, 8.6, 1.1, '#ffde00'); star(11.5, 11, 1.1, '#ffde00'); break;
    case 'VN': fill('#da251d'); star(15, 10, 6, '#ffcd00'); break;
    case 'MA': fill('#c1272d'); g.strokeStyle = '#006233'; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; g.lineTo(15 + Math.cos(a) * 5, 10 + Math.sin(a) * 5); } g.stroke(); break;
    case 'DZ': g.fillStyle = '#006233'; g.fillRect(0, 0, 15, H); g.fillStyle = '#fff'; g.fillRect(15, 0, 15, H); disc(15, 10, 5, '#d21034'); disc(16.6, 10, 4.1, '#fff'); g.save(); g.beginPath(); g.rect(0, 0, 15, H); g.clip(); disc(16.6, 10, 4.1, '#006233'); g.restore(); star(19, 10, 2.2, '#d21034'); break;
    case 'TN': fill('#e70013'); disc(15, 10, 5.5, '#fff'); moon(14.5, 10, 4, '#e70013', '#fff', 1.2); star(16.5, 10, 2.2, '#e70013'); break;
    case 'PK': fill('#01411c'); g.fillStyle = '#fff'; g.fillRect(0, 0, 7.5, H); moon(19, 10, 5, '#fff', '#01411c', 1.6); star(21.5, 8, 1.8, '#fff'); break;
    case 'SA': fill('#006c35'); g.fillStyle = '#fff'; g.fillRect(7, 13, 16, 1.5); g.fillRect(8, 6, 14, 1); g.fillRect(8, 8.5, 14, 1); break;
    case 'AE': h3('#00732f', '#fff', '#000'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 8, H); break;
    case 'QA': fill('#8a1538'); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 0); for (let i = 0; i <= 9; i++) g.lineTo(9 + (i % 2 ? 3 : 0), i * H / 9); g.lineTo(0, H); g.fill(); break;
    case 'AU': fill('#012169'); g.fillStyle = '#fff'; g.fillRect(0, 4, 13, 2); g.fillRect(5.5, 0, 2, 10); g.fillStyle = '#c8102e'; g.fillRect(0, 4.5, 13, 1); g.fillRect(6, 0, 1, 10); star(6.5, 15, 2.6, '#fff'); star(22, 5, 1.4, '#fff'); star(25, 10, 1.4, '#fff'); star(22, 16, 1.4, '#fff'); star(19, 10, 1.2, '#fff'); break;
    case 'BA': fill('#002395'); g.fillStyle = '#fecb00'; g.beginPath(); g.moveTo(8, 0); g.lineTo(23, 0); g.lineTo(23, 15); g.fill(); break;
    case 'AL': fill('#e41e20'); disc(15, 10, 4.5, '#000'); g.fillStyle = '#e41e20'; g.fillRect(14, 4, 2, 12); break;
    case 'MK': fill('#d20000'); g.strokeStyle = '#ffe600'; g.lineWidth = 2.5; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.moveTo(15, 10); g.lineTo(15 + Math.cos(a) * 18, 10 + Math.sin(a) * 18); } g.stroke(); disc(15, 10, 3.2, '#ffe600'); break;
    case 'CY': fill('#fff'); g.fillStyle = '#d57800'; g.beginPath(); g.ellipse(15, 9, 7, 3.5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4e5b31'; g.fillRect(10, 14, 10, 1.5); break;
    default: g.fillStyle = '#888'; g.fillRect(0, 0, W, H);
  }
  return (flagCache[cc] = cv.toDataURL());
}

// ---------------- oyuncunun haftası ----------------
// kayıt: { key, best }
const load = () => store.get(KEY, {}) || {};
export function myBest() { const s = load(); return s.key === week().key ? s.best | 0 : 0; }
export function recordRun(score) {
  const w = week(), s = load();
  if (s.key !== w.key) { s.key = w.key; s.best = 0; }
  const before = s.best | 0;
  if (score > before) s.best = score;
  store.set(KEY, s);
  return { before, best: s.best };
}
