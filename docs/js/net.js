// ---------------- profil + gerçek sıralama (Supabase) ----------------
// Hesap yok: oyuncu = cihazda saklanan { id, secret, name }. Sunucuda tablolar kapalı, yalnızca RPC'ler açık (supabase/schema.sql).
// anon anahtar herkese açık olabilir; service_role anahtarı asla buraya girmez. Ağ yoksa her çağrı null döner, oyun bozulmaz.
import { store } from './util.js';

const SB_URL = 'https://sznwlsoyssseckgljulb.supabase.co';
const SB_KEY = 'sb_publishable_9L0oBO1uWQKbNaGAfvBBOg_dO8bTWSS'; // publishable: istemcide durabilir
export const KEY_PROFILE = 'simit-martisi-profile';
const KEY_PENDING = 'simit-martisi-pending'; // gönderilemeyen skor: { week, run, score, dist, city }

export const netOn = () => !!(SB_URL && SB_KEY);
// null: ağ yok / sunucu cevap vermedi (sonra yeniden denenir) · REJECT: sunucu reddetti (yeniden denemenin anlamı yok)
const REJECT = { rejected: true };
async function rpc(fn, args) {
  if (!netOn()) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal, cache: 'no-store',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) return res.status >= 400 && res.status < 500 ? REJECT : null;
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
// uygunsuz ad: supabase/schema.sql'deki sm_norm + sm_bad ile aynı liste ve aynı sadeleştirme (ikisi birlikte güncellenir)
const BAD = ['sokuk', 'skm', 'sktr', 'amk', 'amq', 'amcik', 'aminakoy', 'aminako', 'orospu', 'orosbu', 'orspu', 'pezevenk', 'gavat', 'kahpe',
  'yarrak', 'yarak', 'ibne', 'ipne', 'kaltak', 'surtuk', 'fahise', 'kerhane', 'yavsak', 'serefsiz', 'gotveren', 'gotlek', 'pust', 'dallama',
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'nigga', 'faggot', 'retard', 'asshole', 'bastard', 'porn', 'penis', 'vagina',
  'cocksucker', 'dildo', 'rapist', 'hitler', 'sex',
  'hurensohn', 'fotze', 'wichser', 'arschloch', 'hijodeputa', 'putamadre', 'mierda', 'gilipollas', 'cabron', 'pendejo', 'maricon'];
const MAP = { 'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u', '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
const norm = s => String(s).toLowerCase().replace(/[ışğüöçâîû0134578@$!]/g, c => MAP[c]).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
const BADN = BAD.map(norm);
export const rudeName = s => { const n = norm(s); return BADN.some(w => n.includes(w)) || /(^|[^i])sik(tir|erim|eyim|iyim|ik|is|im|ici)/.test(n); };

export const profile = () => store.get(KEY_PROFILE, null) || {};
// ad seçmeyen de sıralamaya girer: cihaza bir kez "Martı 4821" gibi bir ad verilir; oyuncu ad seçince sunucudaki ad da değişir
function autoName(p) {
  if (!p.auto) { p.auto = 'Martı ' + (1000 + Math.floor(Math.random() * 9000)); store.set(KEY_PROFILE, p); }
  return p.auto;
}
export const myName = () => profile().name || '';
export const shownName = () => { const p = profile(); return p.name || p.srv || p.auto || ''; }; // sıralamada görünen ad (seçilmediyse otomatik)
const myCC = () => {
  const l = (navigator.languages && navigator.languages[0]) || navigator.language || '', m = l.match(/-([A-Za-z]{2})$/);
  return (m ? m[1] : { tr: 'TR', de: 'DE', es: 'ES' }[(window.I18N && window.I18N.lang) || 'tr'] || 'GB').toUpperCase();
};
export const ccOf = () => profile().cc || myCC();

// ad yerelde hemen kaydedilir; sunucuya kayıt/ad değişikliği bağlantı olunca gider (sync)
export function setName(name) {
  const p = profile(), n = cleanName(name);
  if (!validName(n) || rudeName(n)) return false;
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
    if (!netOn()) return false;
    if (!p.id) {
      const r = await rpc('register', { p_name: p.name || autoName(p), p_cc: p.cc || myCC() });
      if (r === REJECT) { if (p.name) p.name = ''; else p.auto = ''; store.set(KEY_PROFILE, p); return false; } // sunucu adı kabul etmedi: menüde yeniden sorulur
      if (!r || !r.id) return false;
      Object.assign(p, { id: r.id, secret: r.secret, srv: r.name, dirty: false }, p.name ? { name: r.name } : {});
      store.set(KEY_PROFILE, p);
    } else if (p.dirty) {
      const n = await rpc('rename', { p_id: p.id, p_secret: p.secret, p_name: p.name });
      if (n === null) return false;
      if (n === REJECT) { p.name = p.srv === p.auto ? '' : p.srv || ''; p.dirty = false; store.set(KEY_PROFILE, p); }
      else { p.name = p.srv = n; p.dirty = false; store.set(KEY_PROFILE, p); }
    }
    const q = store.get(KEY_PENDING, null);
    if (q) {
      if (q.week !== weekKey()) store.set(KEY_PENDING, null); // geçen haftanın skoru bu haftaya yazılmasın
      else {
        const r = await rpc('submit_score', { p_id: p.id, p_secret: p.secret, p_run: q.run, p_score: q.score, p_dist: q.dist, p_city: q.city });
        if (r !== null) { if (r !== REJECT) lastRank = r; store.set(KEY_PENDING, null); } // reddedilen skor bırakılır
      }
    }
    return true;
  })().finally(() => (syncing = null));
  return syncing;
}

// istemci tarafı hafta anahtarı (yalnızca bekleyen skoru eskitmek için; asıl hafta sunucuda İstanbul saatiyle)
const weekKey = (now = Date.now()) => { const d = new Date(now); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// uçuş başı: sunucudan bilet. Skor bu biletin alındığı andan beri geçen süreye göre denetlenir;
// bileti olmayan uçuş (ad yok, uçuş başında ağ yok) sıralamaya girmez, yalnızca yerel haftalık en iyiye yazılır.
let runP = null;
export function startRun() {
  runP = (async () => {
    if (!netOn()) return null;
    await sync();
    const p = profile();
    if (!p.id) return null;
    const r = await rpc('start_run', { p_id: p.id, p_secret: p.secret });
    return typeof r === 'string' ? r : null;
  })();
}

// uçuş sonu: dönen değer bu haftaki sıra ya da null (ağ yok / ad yok / bilet yok)
export async function submitScore(score, dist, city) {
  const run = runP ? await runP : null; runP = null;
  if (!run) return null;
  const q = store.get(KEY_PENDING, null), wk = weekKey();
  if (!q || q.week !== wk || score > q.score) store.set(KEY_PENDING, { week: wk, run, score, dist, city });
  if (syncing) await syncing; // yarıda kalan eşitleme bu skoru görmemiş olabilir
  lastRank = null;
  return (await sync()) ? lastRank : null;
}

// { week, ends, total, top:[{rank,name,cc,score,me}], me:{rank,score}|null, prev:{week,rank,total}|null } ya da null
export async function fetchBoard() {
  await sync();
  return rpc('get_board', { p_id: profile().id || null });
}
