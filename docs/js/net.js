// ---------------- profil + gerçek sıralama (Supabase) ----------------
// Hesap yok: oyuncu = cihazda saklanan { id, secret, name }. Sunucuda tablolar kapalı, yalnızca RPC'ler açık (supabase/schema.sql).
// anon anahtar herkese açık olabilir; service_role anahtarı asla buraya girmez. Ağ yoksa her çağrı null döner, oyun bozulmaz.
import { store } from './util.js';

const SB_URL = 'https://sznwlsoyssseckgljulb.supabase.co';
const SB_KEY = 'sb_publishable_9L0oBO1uWQKbNaGAfvBBOg_dO8bTWSS'; // publishable: istemcide durabilir
export const KEY_PROFILE = 'simit-martisi-profile';
const KEY_PENDING = 'simit-martisi-pending'; // gönderilemeyen skor: { week, score, dist, city }

export const netOn = () => !!(SB_URL && SB_KEY);
async function rpc(fn, args) {
  if (!netOn()) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal, cache: 'no-store',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; } finally { clearTimeout(t); }
}

// ad: kontrol karakteri yok, boşluklar teke iner, 2-16 karakter. Sayım kod noktasıyla (sunucudaki char_length gibi):
// .length emojiyi 2 sayar, sunucu 1 → tek emojili ad burada geçip orada hep reddedilirdi; slice de emojiyi ortadan bölerdi
const cps = s => Array.from(s);
export function cleanName(s) {
  return cps(String(s || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 16).join('').trim();
}
export const validName = s => cps(cleanName(s)).length >= 2;

export const profile = () => store.get(KEY_PROFILE, null) || {};
export const myName = () => profile().name || '';
const myCC = () => {
  const l = (navigator.languages && navigator.languages[0]) || navigator.language || '', m = l.match(/-([A-Za-z]{2})$/);
  return (m ? m[1] : { tr: 'TR', de: 'DE', es: 'ES' }[(window.I18N && window.I18N.lang) || 'tr'] || 'GB').toUpperCase();
};
export const ccOf = () => profile().cc || myCC();

// ad yerelde hemen kaydedilir; sunucuya kayıt/ad değişikliği bağlantı olunca gider (sync)
export function setName(name) {
  const p = profile(), n = cleanName(name);
  if (!validName(n)) return false;
  if (p.name !== n) { p.name = n; p.dirty = true; }
  p.cc = p.cc || myCC();
  store.set(KEY_PROFILE, p);
  sync();
  return true;
}

let syncing = null, lastRank = null;
export function sync() { // profil + bekleyen skor; aynı anda tek çalışır
  if (!syncing) syncing = (async () => {
    const p = profile();
    if (!p.name || !netOn()) return false;
    if (!p.id) {
      const r = await rpc('register', { p_name: p.name, p_cc: p.cc || myCC() });
      if (!r || !r.id) return false;
      Object.assign(p, { id: r.id, secret: r.secret, name: r.name, dirty: false });
      store.set(KEY_PROFILE, p);
    } else if (p.dirty) {
      const n = await rpc('rename', { p_id: p.id, p_secret: p.secret, p_name: p.name });
      if (n === null) return false;
      p.name = n; p.dirty = false; store.set(KEY_PROFILE, p);
    }
    const q = store.get(KEY_PENDING, null);
    if (q) {
      if (q.week !== weekKey()) store.set(KEY_PENDING, null); // geçen haftanın skoru bu haftaya yazılmasın
      else { const r = await rpc('submit_score', { p_id: p.id, p_secret: p.secret, p_score: q.score, p_dist: q.dist, p_city: q.city }); if (r !== null) { lastRank = r; store.set(KEY_PENDING, null); } }
    }
    return true;
  })().finally(() => (syncing = null));
  return syncing;
}

// istemci tarafı hafta anahtarı (yalnızca bekleyen skoru eskitmek için; asıl hafta sunucuda İstanbul saatiyle)
const weekKey = (now = Date.now()) => { const d = new Date(now); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// uçuş sonu: dönen değer bu haftaki sıra ya da null (ağ yok / ad yok)
export async function submitScore(score, dist, city) {
  const q = store.get(KEY_PENDING, null), wk = weekKey();
  if (!q || q.week !== wk || score > q.score) store.set(KEY_PENDING, { week: wk, score, dist, city });
  if (syncing) await syncing; // yarıda kalan eşitleme bu skoru görmemiş olabilir
  lastRank = null;
  return (await sync()) ? lastRank : null;
}

// { week, ends, total, top:[{rank,name,cc,score,me}], me:{rank,score}|null, prev:{week,rank,total}|null } ya da null
export async function fetchBoard() {
  await sync();
  return rpc('get_board', { p_id: profile().id || null });
}
