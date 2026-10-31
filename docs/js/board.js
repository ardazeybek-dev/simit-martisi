// ---------------- haftalık sıralama: yerel taraf ----------------
// Asıl tablo sunucuda (net.js, supabase/schema.sql). Burada: bayrak çizimi, cihazdaki haftalık en iyi (ağ yokken gösterilir)
// ve geçen haftanın ödülünün alınıp alınmadığı.
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
// geçen haftanın son sırasına göre ödül
export const rewardFor = rank => (rank === 1 ? 300 : rank === 2 ? 200 : rank === 3 ? 100 : 25);

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
    default: g.fillStyle = '#888'; g.fillRect(0, 0, W, H);
  }
  return (flagCache[cc] = cv.toDataURL());
}

// ---------------- oyuncunun haftası ----------------
// kayıt: { key, best, paidKey } · paidKey: ödülü alınmış son hafta (sunucunun hafta tarihi, ör. 2026-10-26)
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
export const paidKey = () => load().paidKey || '';
export function markPaid(key) { const s = load(); s.paidKey = key; store.set(KEY, s); }
