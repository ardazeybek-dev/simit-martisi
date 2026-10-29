// ---------------- haftalık sıralama ----------------
// Sunucu yok: tablo haftaya göre tohumlanan botlardan üretilir, herkeste aynı görünür. Botların puanı hafta ilerledikçe
// büyür (sıranı korumak için oynamaya devam et). Oyuncunun haftalık en iyisi yerelde tutulur; hafta bitince son sırasına
// göre ödül verilir. Puan dağılımı: score(r) = A / (r + 30)^a; aynı formülün tersi oyuncunun sırasını verir.
import { store } from './util.js';

const KEY = 'simit-martisi-week';
const DAY = 864e5;
// pazartesi 00:00 (yerel) başlayan hafta; anahtar o pazartesinin tarihi
export function week(now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const start = d.getTime() - ((d.getDay() + 6) % 7) * DAY, end = start + 7 * DAY;
  const s = new Date(start);
  return { key: `${s.getFullYear()}-${s.getMonth() + 1}-${s.getDate()}`, prog: (now - start) / (end - start), left: end - now };
}
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// B: en sondaki oyuncu ~0 puanda kalsın diye eğri aşağı kaydırılır (yoksa az puanla hep sonuncu kalınır)
const params = key => {
  const r = rng(hash('lg' + key)), total = 1100000 + Math.floor(r() * 300000), A = 1.317e6 * (0.9 + r() * 0.2), a = 0.574;
  return { total, A, a, B: A / Math.pow(total + 30, a) };
};
// hafta başında botlar haftanın sonundaki puanlarının %45'inde, pazar gecesi tam
const grow = prog => 0.45 + 0.55 * Math.min(1, Math.max(0, prog));
export function scoreAt(rank, w = week()) { const p = params(w.key); return Math.max(0, Math.round((p.A / Math.pow(rank + 30, p.a) - p.B) * grow(w.prog))); }
export function rankOf(score, w = week()) {
  const p = params(w.key);
  if (!(score > 0)) return p.total;
  const r = Math.ceil(Math.pow(p.A / (score / grow(w.prog) + p.B), 1 / p.a) - 30);
  return Math.min(p.total, Math.max(1, r));
}
export const totalPlayers = (w = week()) => params(w.key).total;

// ödül basamakları: hafta bitince son sıraya göre
export const TIERS = [[100, 1000], [1000, 500], [10000, 250], [100000, 100], [0.5, 40]]; // 0.5: ilk %50
export function tierOf(rank, total) {
  for (const [lim, r] of TIERS) if (rank <= (lim < 1 ? total * lim : lim)) return { lim, reward: r };
  return { lim: 1, reward: 15 }; // katılım
}

// ---------------- botlar: ülke, isim, bayrak ----------------
const C = {
  TR: [['Mehmet', 'Ayşe', 'Emre', 'Zeynep', 'Burak', 'Elif', 'Can', 'Selin', 'Mert', 'Deniz', 'Oğuz', 'Ece', 'Kerem', 'Buse', 'Hakan', 'Gizem', 'Yusuf', 'Merve'], ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Koç']],
  DE: [['Lukas', 'Leon', 'Mia', 'Hannah', 'Jonas', 'Lena', 'Felix', 'Paul', 'Emma', 'Noah'], ['Müller', 'Schmidt', 'Weber', 'Wagner', 'Becker', 'Hoffmann']],
  US: [['James', 'Emily', 'Michael', 'Olivia', 'Ethan', 'Ava', 'Tyler', 'Madison', 'Josh', 'Chloe'], ['Smith', 'Johnson', 'Brown', 'Miller', 'Davis', 'Wilson']],
  BR: [['João', 'Gabriel', 'Lucas', 'Ana', 'Beatriz', 'Pedro', 'Larissa', 'Mateus'], ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa']],
  RU: [['Ivan', 'Dmitry', 'Anna', 'Olga', 'Sergey', 'Nikita', 'Daria'], ['Ivanov', 'Smirnov', 'Petrov', 'Volkov']],
  FR: [['Lucas', 'Chloé', 'Hugo', 'Léa', 'Louis', 'Manon', 'Jules'], ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent']],
  GB: [['Oliver', 'Harry', 'Amelia', 'Isla', 'George', 'Jack', 'Sophie'], ['Taylor', 'Jones', 'Evans', 'Walker', 'Wright']],
  IT: [['Luca', 'Giulia', 'Marco', 'Sofia', 'Matteo', 'Chiara'], ['Rossi', 'Russo', 'Ferrari', 'Bianchi', 'Romano']],
  ES: [['Pablo', 'Lucía', 'Álvaro', 'Martina', 'Javier', 'Paula'], ['García', 'López', 'Martínez', 'Sánchez', 'Pérez']],
  PL: [['Jakub', 'Zuzanna', 'Kacper', 'Julia', 'Szymon'], ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik']],
  NL: [['Daan', 'Sem', 'Julia', 'Tess', 'Lars'], ['de Jong', 'Jansen', 'de Vries', 'Bakker']],
  AZ: [['Elvin', 'Aysel', 'Rauf', 'Leyla', 'Murad'], ['Məmmədov', 'Əliyev', 'Hüseynov', 'Quliyev']],
  ID: [['Budi', 'Siti', 'Agus', 'Dewi', 'Rizky'], ['Santoso', 'Wijaya', 'Saputra', 'Pratama']],
  IN: [['Aarav', 'Priya', 'Rohan', 'Ananya', 'Arjun', 'Kavya'], ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta']],
  MX: [['Diego', 'Valeria', 'Santiago', 'Camila', 'Emiliano'], ['Hernández', 'González', 'Ramírez', 'Torres']],
  JP: [['Haruto', 'Yui', 'Sota', 'Hina', 'Ren'], ['Sato', 'Suzuki', 'Takahashi', 'Tanaka']],
  KR: [['Minjun', 'Seoyeon', 'Jiho', 'Haeun', 'Doyun'], ['Kim', 'Lee', 'Park', 'Choi']],
  UA: [['Andriy', 'Oksana', 'Taras', 'Iryna', 'Bohdan'], ['Shevchenko', 'Bondarenko', 'Kovalenko', 'Tkachenko']],
  GR: [['Giorgos', 'Maria', 'Nikos', 'Eleni', 'Kostas'], ['Papadopoulos', 'Nikolaou', 'Georgiou']],
  SE: [['Elias', 'Alice', 'William', 'Maja', 'Hugo'], ['Andersson', 'Johansson', 'Karlsson', 'Nilsson']],
};
const WEIGHTS = { TR: 34, DE: 9, US: 8, BR: 6, RU: 5, FR: 4, GB: 4, IT: 3, ES: 3, PL: 3, NL: 2, AZ: 4, ID: 3, IN: 3, MX: 2, JP: 1, KR: 1, UA: 2, GR: 2, SE: 1 };
const CODES = Object.keys(WEIGHTS), WSUM = CODES.reduce((s, c) => s + WEIGHTS[c], 0);
const NICK = ['martı', 'simit', 'gull', 'sky', 'pro', 'wing', 'kanat', 'bogaz', 'ferry', 'fly'];
export function bot(rank, w = week()) {
  const r = rng(hash(w.key + ':' + rank));
  let x = r() * WSUM, cc = CODES[0];
  for (const c of CODES) { x -= WEIGHTS[c]; if (x <= 0) { cc = c; break; } }
  const [first, last] = C[cc], f = first[(r() * first.length) | 0], l = last[(r() * last.length) | 0];
  const nick = NICK[(r() * NICK.length) | 0], style = r(), num = (r() * 99 + 1) | 0, lower = s => s.toLocaleLowerCase(cc === 'TR' || cc === 'AZ' ? 'tr' : 'en');
  // isimlerin bir kısmı gerçek ad gibi, bir kısmı kullanıcı adı gibi
  const name = style < 0.4 ? `${f} ${l[0]}.` : style < 0.6 ? `${lower(f)}_${lower(l).slice(0, 4)}` : style < 0.75 ? `${lower(f)}${num}`
    : style < 0.87 ? `${f}${nick[0].toUpperCase()}${nick.slice(1)}` : `${lower(f)}.${lower(l)}`;
  return { rank, cc, name, score: scoreAt(rank, w) };
}

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
// kayıt: { key, best, prev: {key, best}, paidKey } · prev: ödülü henüz alınmamış biten hafta
const load = () => store.get(KEY, {}) || {};
export function myBest() { const s = load(); return s.key === week().key ? s.best | 0 : 0; }
export function recordRun(score) {
  const w = week(), s = load();
  if (s.key !== w.key) {
    if (s.key && s.best > 0 && s.paidKey !== s.key) s.prev = { key: s.key, best: s.best };
    s.key = w.key; s.best = 0;
  }
  const before = s.best | 0;
  if (score > before) s.best = score;
  store.set(KEY, s);
  return { before, best: s.best };
}
// geçen hafta oynandıysa ve ödülü alınmadıysa: o haftanın son sırasına göre ödül
export function pendingReward() {
  const w = week(), s = load();
  const c = s.key && s.key !== w.key && s.best > 0 ? { key: s.key, best: s.best } : s.prev;
  if (!c || c.key === s.paidKey) return null;
  const pw = { key: c.key, prog: 1 }, rank = rankOf(c.best, pw), total = totalPlayers(pw);
  return { key: c.key, rank, total, ...tierOf(rank, total) };
}
export function markPaid(key) { const s = load(); s.paidKey = key; if (s.prev && s.prev.key === key) delete s.prev; store.set(KEY, s); }
