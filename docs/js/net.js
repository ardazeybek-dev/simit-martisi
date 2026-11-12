// ---------------- profil + gerçek sıralama (Supabase) ----------------
// Hesap yok: oyuncu = cihazda saklanan { id, secret, name }. Sunucuda tablolar kapalı, yalnızca RPC'ler açık (supabase/schema.sql).
// anon anahtar herkese açık olabilir; service_role anahtarı asla buraya girmez. Ağ yoksa her çağrı null döner, oyun bozulmaz.
import { store } from './util.js';

const SB_URL = 'https://sznwlsoyssseckgljulb.supabase.co';
const SB_KEY = 'sb_publishable_9L0oBO1uWQKbNaGAfvBBOg_dO8bTWSS'; // publishable: istemcide durabilir
export const KEY_PROFILE = 'simit-martisi-profile';
const KEY_PENDING = 'simit-martisi-pending';
const KEY_GIFT = 'simit-martisi-gift'; // sunucudan gelen, cüzdana henüz eklenmemiş hediye simit // gönderilemeyen skor: { week, run, score, dist, city }

// yerel geliştirmede (localhost) canlı sıralamaya bağlanılmaz: test oturumları sahte oyuncu açmasın. Bağlanmak için adrese ?net=1 ekle.
const LOCAL = (() => { try { return /^(localhost|127\.|\[::1\])/.test(location.hostname) && !/[?&]net=1/.test(location.search); } catch (e) { return false; } })();
export const netOn = () => !LOCAL && !!(SB_URL && SB_KEY);
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
// uygunsuz ad: supabase/schema.sql'deki sm_fold + sm_bad ile aynı listeler ve aynı sadeleştirme (ikisi birlikte güncellenir).
// Benzer harfler (Kiril о, Yunan ο, 0, @ ...) latine çevrilir; BAD adın içinde aranır, WORDS yalnızca tek başına kelimeyse sayılır.
const BAD = ['amcik', 'amck', 'amcuk', 'aminako', 'aminakoy', 'aminaq', 'amk', 'amq', 'arschloch', 'ashole', 'bastard', 'bitch', 'cabron', 'cocksucker', 'cunt', 'dangalak', 'dick', 'dildo', 'fagot', 'fahise', 'fotze', 'fuck', 'gavat', 'gerizekali', 'gilipolas', 'gotlek', 'gotos', 'gotveren', 'hijodeputa', 'hitler', 'hurensohn', 'ibine', 'ibne', 'ipne', 'kahpe', 'kaltak', 'kancik', 'kanirt', 'kerhane', 'kevase', 'kodumun', 'maricon', 'mierda', 'oglanci', 'orosbu', 'orospu', 'orospucocugu', 'orspu', 'pendejo', 'penis', 'pezevenk', 'pickurusu', 'picoglu', 'pijkurusu', 'pijoglu', 'porn', 'porno', 'pusi', 'pust', 'pusy', 'putamadre', 'rapist', 'retard', 'serefsiz', 'sex', 'shit', 'skm', 'sktr', 'slut', 'sokuk', 'surtuk', 'vagina', 'whore', 'wichser', 'yalayan', 'yarak', 'yavsak'];
const WORDS = new Set(['ahmak', 'am', 'amin', 'amina', 'amini', 'amq', 'aptal', 'aq', 'bok', 'boktan', 'cock', 'cum', 'dalama', 'got', 'gote', 'gotler', 'gotu', 'gotum', 'gotun', 'kasar', 'lavuk', 'mal', 'niga', 'nigas', 'niger', 'oc', 'pic', 'pice', 'pij', 'pijo', 'pipi', 'pitik', 'salak', 'salaklar', 'sapik', 'seks', 'seksi', 'sexy', 'sg', 'sik', 'sike', 'sikik', 'sikim', 'tasak', 'tasaklar', 'tits', 'yarami']);
const FROM = 'ışğüöçâîûİŞĞÜÖÇ0134578@$!69авеёкмнорстухѕіїјԁүһԛԝАВЕЁКМНОРСТУХЅІЇЈαβεικνορτυχΑΒΕΖΗΙΚΜΝΟΡΤΥΧɑɡ', TO = 'isguocaiuisguocoieastbasiggabeekmhopctyxsiijdyhqwabeekmhopctyxsiijabeikvoptuxabezhikmnoptyxag';
const fold = s => Array.from(String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()).map(c => { const i = FROM.indexOf(c); return i < 0 ? c : TO[i]; }).join('')
  .replace(/[^a-z]+/g, ' ').replace(/(.)\1+/g, '$1').trim(); // kelimeler boşlukla ayrık, tekrar eden harf teke iner
// ad yalnızca Latin/Türkçe harf, rakam, boşluk, . _ - ve emoji içerebilir (Kiril, Yunan, süslü/tam genişlik harfler yasak)
export const oddName = s => /[^A-Za-z0-9 ._çğıöşüÇĞİÖŞÜâîûÂÎÛäëïÿÄËÏßñÑáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙêôÊÔãõÃÕ\u2600-\u27bf\u2b00-\u2bff\u{1f000}-\u{1f0ff}\u{1f200}-\u{1faff}\ufe0f\u200d-]/u.test(String(s).normalize('NFC'));
export const rudeName = s => {
  // harf harf yazılan ("s.i.k", "g ö t") tek harflik parçalar birleşir
  const f = fold(s).replace(/(?<=\b[a-z]) (?=[a-z]\b)/g, '').replace(/(.)\1+/g, '$1'), n = f.replace(/ /g, '').replace(/(.)\1+/g, '$1');
  return oddName(s) || BAD.some(w => n.includes(w)) || f.split(' ').some(w => WORDS.has(w)) || /(^|[^i])sik(tir|erim|eyim|iyim|ik|is|im|ici)/.test(f);
};

export const profile = () => store.get(KEY_PROFILE, null) || {};
// liste sonradan büyüyünce eski uygunsuz ad cihazda kalmasın: ad silinir, menü yeni ad sorar (skor sunucuda kimliğe bağlı, kaybolmaz)
{ const p = profile(); if ((p.name && rudeName(p.name)) || (p.srv && rudeName(p.srv))) { if (rudeName(p.name || '')) p.name = ''; if (rudeName(p.srv || '')) p.srv = ''; p.dirty = false; store.set(KEY_PROFILE, p); } }
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
  if (p.name !== n) { p.name = n; p.dirty = true; edits++; }
  p.cc = p.cc || myCC();
  store.set(KEY_PROFILE, p);
  sync();
  return true;
}

// ülke profilden seçilir: yerelde hemen değişir, sunucuya sync ile gider (bağlantı yoksa sonra)
export function setCountry(cc) {
  if (!/^[A-Z]{2}$/.test(cc)) return false;
  const p = profile();
  if (p.cc !== cc) { p.cc = cc; p.ccDirty = true; edits++; store.set(KEY_PROFILE, p); sync(); }
  return true;
}

let giftDone = false, giftCb = null; // hediye sayfa başına bir kez sorulur
// hediye: sunucu (gifts tablosu) teslim edilmemiş hediyeleri bir kez verir; önce cihaza yazılır, sonra main.js cüzdana ekler
export const onGift = cb => { giftCb = cb; if (+store.get(KEY_GIFT, 0) > 0) cb(); };
let syncing = null, lastRank = null, edits = 0; // edits: oyuncunun ad/ülke değişiklik sayacı
// await arasında oyuncu ad/ülke değiştirebilir: eski kopyayı yazmak yeni ülkeyi ezerdi → yazarken taze profile birleştirilir
const save = patch => { const p = Object.assign(profile(), patch); store.set(KEY_PROFILE, p); return p; };
export function sync() { // profil + bekleyen skor; aynı anda tek çalışır. Çalışırken gelen değişiklik için bir tur daha döner
  if (!syncing) syncing = (async () => {
    let e0 = edits, ok = await syncOnce();
    for (let i = 0; ok && i < 2 && e0 !== edits; i++) { e0 = edits; ok = await syncOnce(); }
    return ok;
  })().finally(() => (syncing = null));
  return syncing;
}
async function syncOnce() {
  {
    let p = profile();
    if (!netOn()) return false;
    if (!p.id) {
      const r = await rpc('register', { p_name: p.name || autoName(p), p_cc: p.cc || myCC() });
      if (r === REJECT) { save(p.name ? { name: '' } : { auto: '' }); return false; } // sunucu adı kabul etmedi: menüde yeniden sorulur
      if (!r || !r.id) return false;
      const sentCC = p.cc || myCC(), now = profile();
      // ülke kayıtla birlikte gitti; kayıt sürerken değiştiyse işaretli kalır, bir sonraki turda set_cc ile gider
      p = save(Object.assign({ id: r.id, secret: r.secret, srv: r.name, dirty: !!now.name && now.name !== p.name, ccDirty: !!now.cc && now.cc !== sentCC }, now.name && now.name === p.name ? { name: r.name } : {}));
    } else if (p.dirty) {
      const sent = p.name, n = await rpc('rename', { p_id: p.id, p_secret: p.secret, p_name: sent });
      if (n === null) return false;
      const changed = profile().name !== sent; // istek giderken yeni ad yazıldı: o ad işaretli kalır
      if (n === REJECT) p = save(changed ? {} : { name: p.srv === p.auto ? '' : p.srv || '', dirty: false });
      else p = save(changed ? { srv: n } : { name: n, srv: n, dirty: false });
    }
    if (p.ccDirty && p.id) {
      const sent = p.cc, c = await rpc('set_cc', { p_id: p.id, p_secret: p.secret, p_cc: sent });
      // reddedilirse yerelde kalır, sonraki sync'te yeniden denenir; istek giderken ülke yine değiştiyse işaret kalır
      if (c !== null && c !== REJECT && profile().cc === sent) p = save({ ccDirty: false });
    }
    // martı seviyesi sıralamada görünür: değiştikçe bir kez gönderilir (sunucu yalnız artışı kabul eder)
    const lv = +((store.get('simit-martisi-rank', null) || {}).lv) || 0;
    if (p.id && lv > (p.lvSent || 0)) {
      const r = await rpc('set_level', { p_id: p.id, p_secret: p.secret, p_lv: lv });
      if (r !== null) p = save({ lvSent: r === REJECT ? lv : r });
    }
    // sıralama kalıcı oldu: bilet gelmeden (ya da çevrimdışı) yapılmış cihaz rekoru sunucuda yoktu → bir kez yüklenir
    const best = +store.get('simit-martisi-best', 0) || 0;
    if (!p.claimed && best > 0) {
      const c = await rpc('claim_best', { p_id: p.id, p_secret: p.secret, p_score: best });
      if (c === null) return false;
      p = save({ claimed: true });
    }
    if (!giftDone) {
      const g = await rpc('claim_gifts', { p_id: p.id, p_secret: p.secret });
      if (g !== null) { giftDone = true; if (typeof g === 'number' && g > 0) { store.set(KEY_GIFT, (+store.get(KEY_GIFT, 0) || 0) + g); if (giftCb) giftCb(); } }
    }
    const q = store.get(KEY_PENDING, null);
    if (q) {
      {
        const r = await rpc('submit_score', { p_id: p.id, p_secret: p.secret, p_run: q.run, p_score: q.score, p_dist: q.dist, p_city: q.city });
        if (r !== null) { if (r !== REJECT) lastRank = r; store.set(KEY_PENDING, null); } // reddedilen skor bırakılır
      }
    }
    return true;
  }
}

// istemci tarafı hafta anahtarı (yalnızca bekleyen skoru eskitmek için; asıl hafta sunucuda İstanbul saatiyle)
const weekKey = (now = Date.now()) => { const d = new Date(now); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// uçuş başı: sunucudan bilet. Skor bu biletin alındığı andan beri geçen süreye göre denetlenir;
// bileti olmayan uçuş (ad yok, uçuş başında ağ yok) sıralamaya girmez, yalnızca yerel haftalık en iyiye yazılır.
let runP = null, runId = null; // runId: bu uçuşun bileti (sayfa kapanırken skoru saklamak için eşzamanlı lazım)
export function startRun() {
  runId = null;
  runP = (async () => {
    if (!netOn()) return null;
    await sync();
    const p = profile();
    if (!p.id) return null;
    const r = await rpc('start_run', { p_id: p.id, p_secret: p.secret });
    return (runId = typeof r === 'string' ? r : null);
  })();
}
// uçuş kontrol noktası: oyun her 400 m'de çağırır, beklenmez (ağ yoksa sessizce geçer)
export function markRun(d) { const p = profile(); if (runId && p.id) rpc('run_mark', { p_id: p.id, p_secret: p.secret, p_run: runId, p_dist: Math.floor(d) }); }
// uçuş yarıda kalırken (sekme gizlendi, sayfa yenilendi/kapandı): skor bekleyen olarak saklanır, sonraki açılışta sync onu gönderir.
// Bilet bir gün geçerli; sunucu süreyi biletten sayar, geç gelen skor yine akla yatkın kalır.
export function stashScore(score, dist, city) {
  if (!runId || !(score > 0)) return;
  const q = store.get(KEY_PENDING, null);
  if (!q || score > q.score) store.set(KEY_PENDING, { week: weekKey(), run: runId, score, dist, city });
}

// uçuş sonu: dönen değer bu haftaki sıra ya da null (ağ yok / ad yok / bilet yok)
export async function submitScore(score, dist, city) {
  const run = runP ? await runP : null; // bilet ikinci şansta da geçerli: canlanıp devam eden uçuşun son skoru da gider
  if (!run) return null;
  const q = store.get(KEY_PENDING, null), wk = weekKey();
  if (!q || score > q.score) store.set(KEY_PENDING, { week: wk, run, score, dist, city });
  if (syncing) await syncing; // yarıda kalan eşitleme bu skoru görmemiş olabilir
  lastRank = null;
  return (await sync()) ? lastRank : null;
}

// { week, ends, total, top:[{rank,name,cc,score,me}], me:{rank,score}|null, prev:{week,rank,total}|null } ya da null
// günlük ödül sunucuda: aynı ağ + aynı tarayıcı günde bir kez alır (kayıtlar silinse de). act: peek | claim | save
// günlük ödül oyuncu kimliğine bağlı (IP değil): telefonun IP'si değişince seri 1. güne düşmez. Kayıt henüz gitmediyse eski yol
// günlük balık sınırı sunucuda, oyuncu kimliğine bağlı: take=true yakalananı sayar; dönen bugünkü sayı (ağ yoksa null)
export const fishDayRpc = take => { const p = profile(); return p.id && p.secret ? rpc('fish_day', { p_id: p.id, p_secret: p.secret, p_take: !!take }) : Promise.resolve(null); };
// cihazdaki son alım (main.js KEY_DAILY) da gider: kimliğe geçişte IP değişmişse sunucu eski seriyi bununla bulur
export const dailyRpc = act => {
  const p = profile(); if (!(p.id && p.secret)) return rpc('daily', { p_act: act });
  const d = store.get('simit-martisi-daily', null) || {}, m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(d.last || ''), ok = !!m && Number.isInteger(d.streak); // dayKey sıfırsız yazar: 2026-11-1
  const last = ok ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
  return rpc('daily', { p_act: act, p_id: p.id, p_secret: p.secret, p_last: last, p_streak: ok ? d.streak : null });
};

export async function fetchBoard() {
  await sync();
  const b = await rpc('get_board', { p_id: profile().id || null });
  // ad sunucuda değiştirildiyse (uygunsuz ad cezası) cihazdaki ad da ona döner
  const p = profile(), sn = b && b.me && b.me.name;
  if (sn && p.id && !p.dirty && sn !== p.srv) { p.srv = sn; if (p.name || !/^Martı \d{4}$/.test(sn)) p.name = sn; store.set(KEY_PROFILE, p); } // "Martı ####" verildiyse ad yeniden sorulur
  return b;
}
