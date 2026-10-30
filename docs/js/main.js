import * as THREE from 'three';
import { rand, pick, clamp, damp, store, vcMat, softMat, canvasTex } from './util.js';
import { MOBILE, renderer, scene, camera, sky, far, farShips, updateWater, waveAt, placeSun, sunLight, BEND, BEND2, LEVEL, setHeading, applyWeather, setCityLook } from './scene.js';
import { CITIES, cityOf } from './cities.js';
import { pickWeather, setWeatherFx, updateWeatherFx } from './weather.js';
import { makeGull, flapGull, makeSimit, makePerson, ferryGeo, FERRY_TYPES, pickFerryType, MAST, FLAG, flagMat, makeKite, BUOY, makeChevron, makeSimitBoat, makeSimitPiece, makeFishingBoat, makeSailboat, makeYacht, makeCruise, cargoGeo, tankerGeo, animCrowd, makeMaiden, BENCH, DOLPHIN, BRIDGE, BRIDGE_Y, bridgeMat, ROD_TIP, FISHERS, FLINE, flineMat, BOBBER, FISH, BIN, BIN_LID, CRATES, ROPE, CAT, SALON_LEN, SALON_GAP, SALON_TOP, salonGeo, glassMat, makePowerUp, makeShieldOrb, POWER, ICON_SVG, DECK, GEO, COSTUMES, COSTUME_SVG, dressGull, paintGull, PIER, LIGHTHOUSE, makeStopGate, warmPeople, setBait, TITLE_SETS, SIMITCI_LOOK, makeSimitCart, makeSimitStand, makePirateShip, PIRATE_GATE, PIRATE_GAP, makeFalls, fallsMat } from './models.js';
import { chunks, flats, sparkle, puff, updateSpeedLines, updateFx, clearFx, popText } from './fx.js';
import { audio, sfx } from './audio.js';
import { week, rankOf, totalPlayers, bot, flag, tierOf, TIERS, scoreAt, recordRun, myBest, pendingReward, markPaid } from './board.js';

const $ = id => document.getElementById(id);
// çeviri: js/i18n.js (window.I18N); portal kopyasında reklam köprüsü window.PF ayrıca gelir
const tr = s => window.I18N.t(s);
const FLY_Y = 5.15, LANE = 4.6, EDGE = 3.5, COMBO_T = 1.5, SPEED_MAX = 43, GEAR_M = 300; // GEAR_M: her kaç metrede "Hızlanıyor!"
// şerit vapur kadar geniş (gövde ±4, küpeştenin biraz dışı). Çarpışma payları: engeller affedici (kutu görünenden dar),
// simit ve güçlendirme cömert (yakından geçmek yeter)
const HIT = { obs: 0.12, near: 1.1, rival: 0.6, kiteX: 0.55, kiteZ: 0.38, simX: 1.6, simZ: 1.7, simY: 2.0, power: 2.1 };
const KEY_BEST = 'simit-martisi-best', KEY_TUT = 'simit-martisi-tut', KEY_SET = 'simit-martisi-settings';
const KEY_WALLET = 'simit-martisi-wallet', KEY_LOOK = 'simit-martisi-look', KEY_MIS = 'simit-martisi-missions', KEY_DAILY = 'simit-martisi-daily', KEY_UP = 'simit-martisi-upgrades', KEY_CITY = 'simit-martisi-city', KEY_ACH = 'simit-martisi-ach', KEY_DEAL = 'simit-martisi-deal', KEY_FISH = 'simit-martisi-fish';

// ---------------- ayarlar ----------------
// sfx / music: sessize alma (M tuşu, ses düğmesi); sfxVol / musicVol: Ayarlar'daki kaydırıcılar (0-1)
const settings = Object.assign({ sfx: true, music: true, vibe: true, sfxVol: 1, musicVol: 0.8 }, store.get(KEY_SET, {}));
const soundOpts = () => ({ sfx: settings.sfx, music: settings.music, sfxVol: settings.sfxVol, musicVol: settings.musicVol });
audio.set(soundOpts());
const vibrate = ms => { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

// ---------------- oyuncu ----------------
const gull = makeGull();
gull.scale.setScalar(0.95);
scene.add(gull);
const shieldOrb = makeShieldOrb(); shieldOrb.visible = false; gull.add(shieldOrb);
const outfit = dressGull(gull);
const blob = new THREE.Mesh(GEO.blob, new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.3, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2; scene.add(blob);

// ---------------- dünya ----------------
let ferries = [], obstacles = [], simits = [], rivals = [], kites = [], powerups = [], people = [], decor = [], smokes = [], boats = [], crossers = [], dolphins = [], fishes = [], bridges = [], bins = [], cats = [], piers = [];
let bridgeZ = 0;
let genZ = 0, segCount = 0, sceneryZ = 0, maidenZ = 0, cruiseZ = 0, anchorZ = 0, land = [];
const difficulty = () => clamp(-genZ / 650, 0, 5);
const late = () => clamp((-genZ - 3250) / 3000, 0, 1); // difficulty tavana vurduktan sonra (~1,6 km → ~3,1 km) yavaşça 0 → 1
// ---------------- hat: şehrin iskeleleri (m = uçuşun başından metre). Varmak uçuşu bitirmez, sıradaki durağa devam edilir ----------------
// Şehirler cities.js'te; sıradaki şehir öncekinin son iskelesine varınca açılır
const STOP_K = new URLSearchParams(location.search).has('stop') ? 0.15 : 1; // ?stop → duraklar çok yakın (deneme için)
const routeOf = c => clamp(+store.get(c.routeKey, 0) || 0, 0, c.stops.length - 1); // o şehirde şimdiye dek varılan en uzak iskele
const cityOpen = c => { const i = CITIES.indexOf(c); return !c.soon && (i <= 0 || routeOf(CITIES[i - 1]) === CITIES[i - 1].stops.length - 1); };
let city, STOPS, farStop;
function useCity(c) {
  city = c; farStop = routeOf(c);
  STOPS = c.stops.map(([name, m, to, gift]) => ({ name, m: Math.round(m * STOP_K), to, gift }));
  setCityLook(c.id); setBait(c.bait);
}
// meydan okuma: paylaşılan link #c=puan-metre-şehir taşır. Açan kişi başlıkta hedefi görür, o şehirde arkadaşının düştüğü metrede
// suda mavi bayraklı bir şamandıra durur. Geçilene kadar saklanır; yeni link eskisinin yerini alır.
const KEY_VS = 'simit-martisi-vs';
let vs = null, vsNew = false;
{ const v = store.get(KEY_VS, null);
  if (v && v.s > 0) vs = { s: Math.min(9999999, v.s | 0), d: Math.min(99999, v.d | 0), city: cityOf(v.city).id, won: !!v.won };
  const m = /^#c=(\d{1,7})-(\d{1,6})-([a-z]{2,12})$/.exec(location.hash);
  if (m && +m[1] > 0) {
    const c = cityOf(m[3]), ok = c.id === m[3] && cityOpen(c);
    vs = { s: +m[1], d: ok ? +m[2] : 0, city: ok ? c.id : 'istanbul', won: false }; vsNew = ok; store.set(KEY_VS, vs);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
}
{ // ?city=izmir → kilit olsa da o şehir (deneme için)
  const q = cityOf(new URLSearchParams(location.search).get('city') || (vsNew && vs.city) || store.get(KEY_CITY, 'istanbul'));
  useCity(cityOpen(q) || new URLSearchParams(location.search).has('city') ? q : CITIES[0]);
}
let newStop = 0; // bu uçuşta ilk kez varılan en uzak iskele (oyun sonu için)
let slowT = 0; const GATE_FW_Y = 15;
let stopI = 1, pierI = 1, stopM = STOPS.map(s => s.m); // stopI: sıradaki varış, pierI: sıradaki kurulacak iskele, stopM: bu uçuşta kapıların gerçek metresi
const PIER_HALF = 36; // iskele kesiti: kapıdan önce ve sonra bu kadar boş su

// ---------------- virajlar ----------------
// Mantık düz koridorda kalır, viraj yalnızca çizimde yay olur (scene.js). Virajda martı dışa savrulur;
// simitler içe kıvrılan yarış çizgisine dizilir, çizginin çoğunu kapan sapan gibi fırlar.
// Ayar: TURN_ANG (dönüş açısı, rad), TURN_LEN (viraj boyu), TURN_GAP (iki viraj arası), PUSH (savrulma).
const TURNS_ON = new URLSearchParams(location.search).get('turn') !== '0'; // ?turn=0 → düz Boğaz (karşılaştırma için)
const TURN_ANG = [0.38, 0.6], TURN_LEN = [80, 110], TURN_GAP = [340, 520], S_CHANCE = 0.3, PUSH = 0.75;
let turns = [], turnZ = 0, planYaw = 0, heading = 0, lean = 0, push = 0, sling = 0, slingV = 0, bendOn = 0;
function planTurns(limit) {
  if (!TURNS_ON) return;
  while (turnZ > limit) {
    // ilk viraj kalkıştan ~5 sn sonra; S-viraj: hemen ters yöne
    const last = turns[turns.length - 1], ess = !!last && !last.ess && Math.random() < S_CHANCE;
    let z0 = turnZ - (ess ? rand(14, 22) : last ? rand(...TURN_GAP) : rand(150, 190));
    const len = rand(...TURN_LEN), ang = rand(...TURN_ANG);
    for (const s of STOPS) { const sz = -2 * s.m; if (s.m && z0 + PIER_HALF + 20 > sz && z0 - len - PIER_HALF - 20 < sz) z0 = sz - PIER_HALF - 25; } // virajı iskelenin ötesine at
    const dir = ess ? -last.dir : Math.abs(planYaw) > 0.5 ? -Math.sign(planYaw) : pick([-1, 1]);
    planYaw += dir * ang;
    turns.push({ z0, z1: z0 - len, dir, k: (dir * ang) / len, ess, total: 0, got: 0, built: false, entered: false, done: false });
    turnZ = z0 - len;
  }
}

const wakeMat = new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false,
  map: canvasTex(64, 128, (g) => {
    const img = g.createImageData(64, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      const side = 1 - Math.abs(x - 31.5) / 32, fade = 1 - y / 128;
      img.data.set([255, 255, 255, Math.pow(side, 1.4) * fade * (0.55 + 0.45 * Math.random()) * 210], (y * 64 + x) * 4);
    }
    g.putImageData(img, 0, 0);
  }),
});
const WAKE = new THREE.PlaneGeometry(6.5, 26);

function addSimit(x, y, z, gold, piece = false) {
  const m = piece ? makeSimitPiece(gold) : makeSimit(gold); m.position.set(x, y, z); m.rotation.x = 0.25; scene.add(m);
  const s = { mesh: m, x, y, z, free: true, gold, piece };
  simits.push(s); return s;
}

// ---------------- fırlatılan simitler ----------------
// Açık suda simitler havada asılı durmaz: kenardaki simitçi, simidini bölüp parçalarını martıya atar. Atış martının uzaklığına göre
// zamanlanır; simit kavis çizip yakalama noktasına martıyla aynı anda iner, kaçarsa denize düşer. Suda halka iniş yerini gösterir.
// Ayar: THROW_T (uçuş süresi, sn), THROW_H (kavis yüksekliği). ?throw=0 → eski, havada duran simitler.
const THROW_ON = new URLSearchParams(location.search).get('throw') !== '0';
const BRIDGE_SOON = new URLSearchParams(location.search).has('bridge'), SALON_ALL = new URLSearchParams(location.search).has('salon'); // ?bridge → ilk köprü hemen gelir (deneme için)
const THROW_T = [1.05, 1.35], THROW_H = [2.4, 3.6];
const RING = new THREE.RingGeometry(0.5, 0.72, 20);
const thrownStat = { caught: 0, missed: 0 };
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
function throwVolleys(z0, len, first) {
  const end = z0 - len + 5;
  let z = z0 - (first ? 24 : 7), x = rand(-2, 2), side = pick([-1, 1]);
  while (z > end) {
    const n = 3 + ((Math.random() * 3) | 0), bz = z - (n - 1) * 1.7 + rand(-2, 2);
    const b = makeSimitBoat(side); b.g.position.set(side * rand(9.5, 11), 0, bz); b.g.rotation.y = rand(-0.3, 0.3); scene.add(b.g);
    const bt = { ...b, z: bz, hand: 0, thrown: 0 };
    boats.push(bt); decor.push({ mesh: b.g, z: bz, ph: Math.random() * 6 });
    for (let i = 0; i < n && z > end; i++) {
      addThrown(bt, x, z, !first && Math.random() < 0.035);
      z -= rand(2.8, 4.2);
      x = clamp(x + rand(-2, 2), -LANE + 0.8, LANE - 0.8);
    }
    z -= rand(4, 9); side = -side;
  }
}
function addThrown(bt, cx, cz, gold, ry) { // ry: halkanın yüksekliği (vapur güvertesi); yoksa dalgada
  const m = makeSimitPiece(gold); m.visible = false; m.position.set(cx, FLY_Y, cz); scene.add(m);
  const ring = new THREE.Mesh(RING, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.2, cz); scene.add(ring);
  simits.push({ mesh: m, x: cx, y: FLY_Y, z: cz, free: true, gold, piece: true, th: { bt, cx, cz, T: rand(...THROW_T), H: rand(...THROW_H), u: -1, p0: new THREE.Vector3(), ring, ry } });
}
function dropThrown(s) { if (s.th) scene.remove(s.th.ring); }
function flySimits(dt) {
  const g = gull.position;
  for (const s of simits) {
    const th = s.th;
    if (!th) continue;
    if (s.taken || s.pulled) { if (th.ring.parent) scene.remove(th.ring); continue; }
    if (th.u < 0) {
      th.ring.position.y = th.ry ?? waveAt(th.cx, th.cz, t) + 0.12;
      if (g.z - th.cz > speed * th.T || (state !== 'play' && state !== 'title')) continue;
      th.u = 0; th.bt.person.simit.getWorldPosition(th.p0); th.bt.hand = 0.45;
      const tray = th.bt.tray.find(m => m.visible); if (tray && ++th.bt.thrown % 3 === 0) tray.visible = false; // her simitten üç parça
      s.mesh.visible = true; s.mesh.rotation.set(rand(0, 6), rand(0, 6), 0);
    }
    th.u += dt / th.T;
    const u = th.u;
    if (u <= 1) {
      const h = 1 - (1 - u) * (1 - u); // yatayda yavaşlar → yakalama noktasına dik iner
      s.x = th.p0.x + (th.cx - th.p0.x) * h; s.z = th.p0.z + (th.cz - th.p0.z) * h;
      s.y = th.p0.y + (FLY_Y - th.p0.y) * u + th.H * Math.sin(Math.PI * u);
    } else {
      const k = (u - 1) * th.T, v0 = (FLY_Y - th.p0.y - th.H * Math.PI) / th.T;
      s.y = FLY_Y + v0 * k - 7 * k * k;
      const w = th.ry ?? waveAt(s.x, s.z, t); // güverteye atılan parça tahtaya düşer
      if (s.y < w) {
        s.taken = true; scene.remove(s.mesh); scene.remove(th.ring); thrownStat.missed++;
        chunks.emit(tmp.set(s.x, w + 0.1, s.z), 6, { speed: 2.5, up: 1, life: 0.6, size: 0.09, color: [0xffffff, 0xcfe9f2], gravity: 12, spin: 0.3 });
        continue;
      }
    }
    th.ring.position.y = th.ry ?? waveAt(th.cx, th.cz, t) + 0.12; th.ring.scale.setScalar(1 - Math.min(u, 1) * 0.35);
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.rotation.x += dt * 7; s.mesh.rotation.z += dt * 4;
  }
  for (const b of boats) {
    if (b.hand <= 0) continue;
    b.hand -= dt;
    b.person.mesh.rotation.z = (b.side || (b.g.position.x > 0 ? 1 : -1)) * Math.sin(Math.max(0, b.hand) / 0.45 * Math.PI) * 0.3; // atış hamlesi
    b.person.simit.visible = b.hand < 0.1 && b.tray.some(m => m.visible);
  }
}

function spawnGap(first, fixLen) {
  const d = difficulty();
  const len = fixLen || (first ? (tutorialPending ? 70 : 50) : rand(32, 56 - late() * 10)), z0 = genZ;
  const ph = Math.random() * 6, amp = rand(1.2, 3.4);
  if (THROW_ON && !(first && tutorialPending)) throwVolleys(z0, len, first);
  else for (let z = z0 - 7; z > z0 - len + 5; z -= 3.4) {
    const x = clamp(Math.sin((z0 - z) * 0.09 + ph) * amp, -LANE + 0.5, LANE - 0.5);
    addSimit(x, FLY_Y, z, !first && Math.random() < 0.035);
  }
  if (!first) {
    const n = d < 0.6 ? 0 : d < 1.6 ? (Math.random() < 0.7 ? 1 : 0) : d < 3 ? 1 + (Math.random() < 0.4 ? 1 : 0) : 2 + (Math.random() < late() * 0.35 ? 1 : 0); // rakipler seyrek: tek tek gelir, okunabilsin
    for (let i = 0; i < n; i++) addRival(z0 - rand(10, len - 6), rand(-3, 3), rand(0.6, 1.6), undefined, z0 - 4); // kendi açık suyunda kalır, önceki vapura (salona) dalmaz
    if (d > 1.3 && Math.random() < 0.2 + d * 0.06) {
      const nk = d > 3 && Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < nk; i++) {
        const k = makeKite(), bx = rand(-2.6, 2.6), z = z0 - rand(10, len - 8);
        k.position.set(bx, FLY_Y + 0.2, z); scene.add(k);
        kites.push({ g: k, bx, z, ph: Math.random() * 6, sw: rand(1, 2) });
      }
    }
    // yelkenli koridoru yandan keser: martıya yaklaştıkça karşıya geçer, direği ve yelkeni engel
    if (d > 0.9 && len > 34 && Math.random() < 0.18 + d * 0.05) {
      const side = pick([-1, 1]), z = z0 - rand(14, len - 12), xa = rand(-2.7, 2.7), k = rand(0.2, 0.32);
      const b = makeSailboat(); b.rotation.y = -side * Math.PI / 2; scene.add(b);
      const o = { x: xa + side * 60 * k, z, hw: 1.9, hd: 0.45, top: FLY_Y + 4, kind: 'yelkene', passed: false };
      obstacles.push(o); crossers.push({ mesh: b, o, xa, side, k, z, ph: Math.random() * 6 });
    }
    // yunus sürüsü: önce suda yalnız yüzgeçleri görünür; martı yaklaşınca sırayla koridoru yandan atlayarak keser.
    // Tepe noktası martının geçeceği ana denk gelir: tam üstünden geçen "Yunus!" bonusu alır, kombo süresi tazelenir. Çarpmak yok.
    if (d > 0.15 && len > 30 && Math.random() < 0.38) {
      const dir = pick([-1, 1]), z = z0 - rand(12, len - 10), ax = rand(-2.4, 2.4), n = 2 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0, dz = 0; i < n; i++, dz += rand(1.6, 2.8)) {
        const m = new THREE.Mesh(DOLPHIN, vcMat); m.castShadow = true; m.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(m);
        dolphins.push({ mesh: m, dir, ax: ax + rand(-0.9, 0.9), z: z - dz, w: rand(4.2, 5.6), T: rand(0.95, 1.25), lag: rand(-0.08, 0.14), u: -1, got: false, ph: Math.random() * 6 });
      }
    }
    // zıplayan balık (nadir): önce suda çırpınır, martı gelince martının yüksekliğine sıçrar.
    // Değersen ya yakalarsın (balık cüzdana) ya da elinden kayar: "Kaçtı!"
    if (d > 0.15 && len > 30 && (Math.random() < fishSpawn || (!fishEarly && genZ < -600))) { // ~300 m'den sonra ilk açık suda mutlaka bir balık
      fishEarly = true;
      const dir = pick([-1, 1]), m = new THREE.Mesh(FISH, vcMat); m.visible = false; m.scale.setScalar(1.35); scene.add(m);
      fishes.push({ mesh: m, dir, ax: rand(-LANE + 1.2, LANE - 1.2), z: z0 - rand(12, len - 8), w: rand(2.8, 3.8), T: rand(0.75, 0.95), lag: rand(-0.06, 0.1), u: -1, done: false, spin: 0, splT: 0 });
    }
    if (segCount > 2 && Math.random() < 0.42) {
      const kind = pick(d > 1.5 ? ['shield', 'shield', 'magnet', 'double'] : ['magnet', 'double', 'shield']);
      const z = z0 - len * 0.5, x = clamp(Math.sin((z0 - z) * 0.09 + ph + 1.6) * amp, -LANE + 0.6, LANE - 0.6);
      const p = makePowerUp(kind); p.position.set(x, FLY_Y, z); scene.add(p);
      powerups.push({ g: p, kind, x, y: FLY_Y, z });
    }
    for (let i = 0; i < (THROW_ON ? 1 : 2); i++) {
      const b = new THREE.Mesh(BUOY, vcMat); b.position.set(pick([-1, 1]) * rand(7, 11), 0, z0 - rand(5, len));
      scene.add(b); decor.push({ mesh: b, z: b.position.z, ph: Math.random() * 6 });
    }
  }
  genZ -= len;
}

// rakip martı: rengi davranışını söyler. Gri süzülür; kırmızı hızla üstüne dalar (erken görünür, düz gelir);
// mavi düzensiz zikzak çizer (her an yön değiştirebilir). Zorluk arttıkça renkliler çoğalır.
function addRival(z, bx, sw, kind, zMax = Infinity) {
  const d = difficulty();
  const L = late();
  kind = kind || (d > 1.6 && Math.random() < 0.25 + L * 0.2 ? 'red' : d > 2.2 && Math.random() < 0.3 + L * 0.2 ? 'blue' : 'grey'); // renkliler Beşiktaş'tan sonra
  if (kind === 'red') z -= 18; // hızlı gelir: daha uzaktan başlar
  const r = makeGull(kind); r.scale.setScalar(0.58); r.rotation.y = Math.PI; // oyuncudan belirgin küçük
  r.position.set(bx, FLY_Y, z); scene.add(r);
  rivals.push({ mesh: r, kind, bx, z, zMax, ph: Math.random() * 6, sw, hit: false, spin: 0, tx: bx, zt: 0, dive: 15 + L * 4 });
}
// viraj: açık deniz; simitler dıştan girip içe kıvrılan yarış çizgisinde, tepede altın simit; dış kenarda ok tabelaları
function spawnTurn(tn) {
  const z0 = genZ, end = tn.z1 - 6, len = tn.z0 - tn.z1;
  const lineX = z => tn.dir * (-1.2 + 3.8 * Math.sin(Math.PI * clamp((tn.z0 - z) / len, 0, 1)));
  let apex = false;
  for (let z = z0 - 3; z > end + 3; z -= 3.2) {
    const u = (tn.z0 - z) / len, gold = !apex && u > 0.5;
    if (gold) apex = true;
    addSimit(lineX(z), FLY_Y, z, gold, THROW_ON); // açık denizde bütün simit yok: parçalar
    if (u > 0 && u < 1) { simits[simits.length - 1].turn = tn; tn.total++; }
  }
  for (let z = Math.min(z0, tn.z0 + 30); z > tn.z1; z -= 13) {
    const c = makeChevron(tn.dir); c.position.set(-tn.dir * rand(8.5, 9.5), 0, z); c.rotation.y = rand(-0.08, 0.08);
    scene.add(c); decor.push({ mesh: c, z, ph: Math.random() * 6 });
  }
  const d = difficulty();
  if (d > 1.2 && Math.random() < 0.3 + d * 0.1) { // zorlaştıkça viraj içinde de bir rakip
    const z = tn.z0 - len * rand(0.25, 0.75);
    addRival(z, lineX(z) - tn.dir * 2, rand(0.7, 1.4), 'grey');
  }
  tn.built = true; genZ = end;
}

// Galata Köprüsü: tabliyenin iki yanındaki balıkçıların misinaları suya sarkar (ön sıra, arka sıra), aralıklar düzensiz.
// Martı iplerin arasından geçer, ipe değerse oltaya takılır. Simitler iki sıradaki boşlukları birleştiren yolu gösterir.
// Arka sırayı da geçince "Köprü altı!" bonusu. Arada bir (bridgeZ), açık su yerine gelir.
// ---------------- imbat (İzmir) ----------------
// Körfezin ikindi rüzgârı: suda yana kayan rüzgâr çizgileri uzaktan görünür. Şeridin içinde martı rüzgârın estiği yana itilir,
// gevrekler de rüzgârla savrulur: rüzgârla birlikte yatan yakalar, karşı koyan kaçırır. Köprünün İstanbul'daki yerini alır.
// Ayar: IMBAT_PUSH (şeritte itiş), IMBAT_LEN (şerit boyu), imbatZ aralığı. ?imbat → ilk şerit hemen gelir (deneme için)
const IMBAT_SOON = new URLSearchParams(location.search).has('imbat');
const IMBAT_PUSH = 2.4, IMBAT_LEN = 70;
const STREAK = new THREE.PlaneGeometry(5, 0.42).rotateX(-Math.PI / 2);
const streakMat = new THREE.MeshBasicMaterial({ map: canvasTex(64, 4, g => { const r = g.createLinearGradient(0, 0, 64, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.65, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 4); }), transparent: true, opacity: 0.8, depthWrite: false });
let imbats = [], imbatZ = 0, imbatW = 0;
function spawnImbat() {
  const z0 = genZ, z1 = z0 - IMBAT_LEN, dir = pick([-1, 1]);
  const g = new THREE.Group(); scene.add(g);
  const streaks = [];
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(STREAK, streakMat); m.position.set(rand(-16, 16), 0.5, rand(z1 - 4, z0 + 4)); m.scale.set(rand(0.6, 1.6), 1, rand(0.7, 1.3));
    if (dir < 0) m.rotation.y = Math.PI;
    g.add(m); streaks.push({ m, v: rand(7, 12) });
  }
  // girişte iki gevrek; içeridekiler rüzgârüstü kenardan başlar, martı yaklaşınca rüzgârla savrulur
  const sims = [], x = rand(-1.5, 1.5);
  for (const dz of [6, 9.4]) addSimit(x, FLY_Y, z0 - dz, false);
  for (let z = z0 - 16; z > z1 + 8; z -= rand(5.5, 8)) {
    const s = addSimit(clamp(-dir * rand(0.5, 3.4), -LANE + 0.6, LANE - 0.6), FLY_Y, z, Math.random() < 0.06);
    s.vx = dir * rand(2.6, 4); s.spin = dir * rand(3, 6); sims.push(s);
  }
  if (difficulty() > 0.8) addRival(z0 - rand(26, IMBAT_LEN - 18), dir * rand(2.2, 3.2), rand(0.4, 0.9), undefined, z0 - 4); // rüzgâraltında bekleyen martı
  imbats.push({ g, z0, z1, dir, streaks, sims, felt: false });
  imbatZ = z1 - rand(700, 1100);
  genZ = z1;
}
function updateImbat(dt, gz) {
  let on = 0;
  for (const b of imbats) {
    if (b.z1 > gz + 30 || b.z0 < gz - 260) continue; // geride kaldı ya da henüz uzakta
    for (const s of b.streaks) { const p = s.m.position; p.x += b.dir * s.v * dt; if (p.x * b.dir > 17) p.x -= b.dir * 34; p.y = waveAt(p.x, p.z, t) + 0.18; } // dalgaya oturur
    for (const s of b.sims) if (!s.taken && !s.pulled && gz - s.z < 30) { s.x += s.vx * dt; s.mesh.position.x = s.x; s.mesh.rotation.z += s.spin * dt; }
    if (gz <= b.z0 && gz >= b.z1) {
      on = b.dir;
      if (!b.felt && state === 'play') { b.felt = true; sfx.gust(); vibrate(25); }
    }
  }
  imbatW = damp(imbatW, on * IMBAT_PUSH, on ? 3 : 2, dt);
}
// ---------------- korsan teknesi (Antalya) ----------------
// Turist korsan guleti şeridi yandan yavaşça keser; martı vardığında tekne hep aynı yerdedir (xa). Yelkenler ve kıç köşkü engel,
// iki yelken arasındaki boşluk kapı: güvertedeki turistler simit parçalarını tam o boşluğa fırlatır. Ayar: k (kayma hızı), pirateZ aralığı.
// ?pirate → ilk tekne hemen gelir (deneme için)
const PIRATE_SOON = new URLSearchParams(location.search).has('pirate');
let pirates = [], pirateZ = 0;
function spawnPirate() {
  const z0 = genZ, pz = z0 - 40, side = pick([-1, 1]), gapX = rand(-1.8, 1.8), xa = gapX - side * PIRATE_GAP;
  if (THROW_ON) throwVolleys(z0, 24, false);
  const { g, throwers } = makePirateShip(); g.rotation.y = side * Math.PI / 2; scene.add(g); // pruva gidiş yönüne (-side) bakar
  const os = PIRATE_GATE.map(([lz, hl, hb, top]) => {
    const o = { x: xa + side * lz, z: pz, hw: hl, hd: hb, top, kind: 'korsana', passed: false };
    obstacles.push(o); return { o, off: side * lz };
  });
  for (const [i, p] of throwers.entries()) {
    const bt = { g: p.mesh, side, person: p, tray: [{ visible: true }, { visible: true }], z: pz, hand: 0, thrown: 0 };
    boats.push(bt);
    for (const dz of i ? [-0.6, -2.6] : [3.2, 1.3]) addThrown(bt, gapX + rand(-0.3, 0.3), pz + dz, !i && Math.random() < 0.15);
  }
  pirates.push({ g, xa, side, k: rand(0.08, 0.12), z: pz, os, gapX, ph: Math.random() * 6 });
  pirateZ = pz - rand(700, 1000);
  genZ = z0 - 58;
}
function updatePirates(gz) {
  for (const p of pirates) {
    const x = p.xa + p.side * Math.max(-40, gz - p.z) * p.k;
    p.g.position.set(x, waveAt(x, p.z, t) - 0.1, p.z); p.g.rotation.x = Math.sin(t * 1.1 + p.ph) * 0.04;
    for (const q of p.os) q.o.x = x + q.off;
    if (Math.abs(p.z - gz) < 60) for (const c of p.g.userData.crew) { c.m.position.y = c.y + Math.max(0, Math.sin(t * 6.5 + c.ph)) * 0.35; c.m.rotation.z = Math.sin(t * 3 + c.ph) * 0.1; }
  }
}
// ---------------- Düden şelalesi (Antalya) ----------------
// Şeridin bir yanında falezden denize dökülen şelale; serpintisi şeridin o yarısına taşar. Serpintiye giren martı yukarı kalkar
// ve şelaleden öte yana itilir. Yükseğe dizilmiş simit kavsine (tepede altın) yalnız serpintiye başından giren yetişir.
// Ayar: FALLS_LIFT (en çok yükselme), FALLS_PUSH (yana itiş), FALLS_LEN (serpinti boyu), fallsZ aralığı. ?duden → ilk şelale hemen gelir
const FALLS_SOON = new URLSearchParams(location.search).has('duden');
const FALLS_LIFT = 3, FALLS_PUSH = 1.3, FALLS_LEN = 26;
let falls = [], fallsZ = 0, fallsLift = 0, fallsW = 0;
function spawnFalls() {
  const z0 = genZ, fz = z0 - 34, zA = fz + FALLS_LEN / 2, zB = fz - FALLS_LEN / 2, dir = pick([-1, 1]);
  if (THROW_ON) throwVolleys(z0, 16, false);
  const g = makeFalls(); g.position.set(dir * (LANE + 5.4), 0, fz); if (dir < 0) g.rotation.y = Math.PI; scene.add(g);
  for (const dz of [6, 3]) addSimit(dir * 2.2, FLY_Y, zA + dz, false);
  // serpintide martının izleyeceği yol: hızla kalkar, tepede süzülür, çıkışta alçalır; aralıklar düzensiz, tepedeki altın
  const arc = [];
  for (let z = zA - rand(1, 2); z > zB - 6; z -= rand(2.6, 4.4)) {
    const s = zA - z, up = s < FALLS_LEN ? Math.min(1, s / 9) ** 0.7 : Math.max(0, 1 - (s - FALLS_LEN) / 7);
    arc.push(addSimit(dir * clamp(2.2 - s * 0.05 + rand(-0.35, 0.35), 0.6, 3), FLY_Y + FALLS_LIFT * up * rand(0.82, 0.95), z, false));
  }
  const top = arc.reduce((a, b) => (b.y > a.y ? b : a)); scene.remove(top.mesh); simits.splice(simits.indexOf(top), 1); addSimit(top.x, top.y, top.z, true);
  falls.push({ g, z: fz, zA, zB, dir, acc: 0, felt: false });
  fallsZ = zB - rand(800, 1100);
  genZ = zB - 4;
}
function updateFalls(dt, gz) {
  let on = 0;
  fallsMat.map.offset.y = (fallsMat.map.offset.y + dt * 1.4) % 1;
  for (const f of falls) {
    if (Math.abs(f.z - gz) > 110) continue;
    for (const q of f.g.userData.foam) q.m.scale.x = q.m.scale.z = q.s * (1 + Math.sin(t * 3 + q.ph) * 0.12);
    for (f.acc += dt * 70; f.acc > 1; f.acc--) { const u = Math.random(); puff(f.dir * (0.3 + 7.5 * u * u), rand(0.3, 2) + (1 - u) * rand(0, 4), rand(f.zB, f.zA), false, rand(-0.5, 0.5), rand(1.4, 2.6), rand(3, 5), rand(1.3, 1.9)); } // serpinti şelaleye yakın yoğun, şeride doğru incelir
    if (gz <= f.zA && gz >= f.zB && gull.position.x * f.dir > 0.2) {
      on = f.dir;
      if (!f.felt && state === 'play') { f.felt = true; sfx.splash(); vibrate(20); }
    }
  }
  fallsLift = damp(fallsLift, on ? FALLS_LIFT : 0, on ? 3 : 1.8, dt);
  fallsW = damp(fallsW, -on * FALLS_PUSH, on ? 3 : 2, dt);
}
function spawnBridge() {
  const z0 = genZ, bz = z0 - 22, tipY = BRIDGE_Y + 1 + ROD_TIP.y, rz = 2.55 + ROD_TIP.z;
  const g = new THREE.Group(); g.position.z = bz; scene.add(g);
  const deck = new THREE.Mesh(BRIDGE, bridgeMat); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  // köprünün içine düşen kıyı dekorunu kaldır (tekneler, yolcu gemisi, Kız Kulesi)
  decor = decor.filter(d => (Math.abs(d.z - bz) < (d.vz ? 80 : 12) && Math.abs(d.mesh.position.x) > 7 ? (scene.remove(d.mesh), false) : true));
  land = land.filter(l => (Math.abs(l.z - bz) < 60 ? (scene.remove(l.mesh), false) : true));
  const br = { g, z: bz, lines: [], done: false }, gaps = [];
  for (const s of [1, -1]) { // 1: martıya bakan ön sıra, -1: arka sıra
    const xs = [];
    for (let x = -LANE - 0.2 + rand(0, 1.4); x < LANE + 0.6; x += rand(2.8, 4.2)) xs.push(x);
    const row = [];
    for (let i = 0; i <= xs.length; i++) { const a = i ? xs[i - 1] : -LANE - 1, b = i < xs.length ? xs[i] : LANE + 1, c = clamp((a + b) / 2, -LANE + 0.9, LANE - 0.9), w = Math.min(b - c, c - a); if (w > 0.95) row.push({ c, w }); }
    gaps.push(row);
    for (const x of xs) {
      const f = new THREE.Mesh(pick(FISHERS), vcMat); f.position.set(x - s * 0.16, BRIDGE_Y + 1, s * 2.55); f.rotation.y = s > 0 ? 0 : Math.PI; f.castShadow = true; g.add(f);
      const line = new THREE.Mesh(FLINE, flineMat); line.position.set(x, tipY, s * rz); line.scale.y = tipY; g.add(line);
      const bob = new THREE.Mesh(BOBBER, vcMat); bob.position.set(x, 0, s * rz); g.add(bob);
      const o = { x, z: bz + s * rz, hw: 0.06, hd: 0.06, top: 99, kind: 'oltaya', passed: false };
      obstacles.push(o); br.lines.push({ x, o, line, bob, ph: Math.random() * 6 });
    }
  }
  // simit yolu geniş boşluklardan geçer; arka sıradaki boşluk öndekine çok uzak olmaz (yetişilebilsin)
  const wide = row => { const w = row.filter(r => r.w > 1.15 && Math.abs(r.c) < LANE - 0.6); return w.length ? w : row; };
  const gF = pick(wide(gaps[0])).c, near = wide(gaps[1]).filter(r => Math.abs(r.c - gF) < 3.6);
  const gB = near.length ? pick(near).c : gaps[1].reduce((m, r) => (Math.abs(r.c - gF) < Math.abs(m.c - gF) ? r : m)).c;
  const zF = bz + rz, zB = bz - rz;
  for (const dz of [10, 6.8, 3.6]) addSimit(gF, FLY_Y, zF + dz, false);
  for (const u of [0.3, 0.7]) addSimit(gF + (gB - gF) * u, FLY_Y, zF - (zF - zB) * u, u > 0.5 && Math.random() < 0.35);
  for (const dz of [3.4, 6.6]) addSimit(gB, FLY_Y, zB - dz, false);
  br.path = { gF: +gF.toFixed(2), gB: +gB.toFixed(2), zF, zB, xs: br.lines.map(l => +l.x.toFixed(2) + (l.o.z > bz ? 'F' : 'B')).join(' ') };
  bridges.push(br);
  bridgeZ = bz - rand(1100, 1600);
  genZ = z0 - 44;
}

function spawnFerry() {
  const d = difficulty();
  const ft = pickFerryType(), L = pick(ft.lengths), x0 = 0, zc = genZ - L / 2 - 2; // vapur şeridin tam ortasında: şerit = gövde
  const g = new THREE.Group(); g.position.set(x0, 0, zc); scene.add(g);
  const hull = new THREE.Mesh(ferryGeo(L, ft.id), vcMat); hull.castShadow = hull.receiveShadow = true; g.add(hull);
  const wake = new THREE.Mesh(WAKE, wakeMat); wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.5, L / 2 + 13); g.add(wake);

  const zFront = zc - L / 2 - 1.2, zBack = zc + L / 2 + 1.5;
  const blocked = [];
  const obstacle = (lx, lz, hw, hd, top, kind) => {
    obstacles.push({ x: x0 + lx, z: zc + lz, hw, hd, top, kind, passed: false });
    blocked.push({ x: lx, z: lz, r: Math.max(hw, hd) + 1.1 });
  };
  const mx = rand(-2.4, 2.4), mz = -L / 2 + 3;
  const mast = new THREE.Mesh(MAST, vcMat); mast.position.set(mx, DECK, mz); mast.castShadow = true; g.add(mast);
  const flag = new THREE.Mesh(FLAG, flagMat); flag.position.set(mx, DECK + 6.2, mz + 0.78); flag.rotation.y = Math.PI / 2; g.add(flag);
  obstacle(mx, mz, 0.22, 0.22, DECK + 6.9, 'direğe');

  // camlı salon: zorlaştıkça bazı vapurlar kapalı salonlu olur; martı ortadaki geçitten geçmek zorunda, içinde simit dizisi
  let salon = null;
  if (ft.salon && (SALON_ALL || (d > 0.4 && Math.random() < 0.38))) { // ?salon → her vapur salonlu (deneme için)
    const tx = pick([-0.6, 0, 0.6]), sz = rand(-2, 4), geo = salonGeo(tx);
    const solid = new THREE.Mesh(geo.solid, vcMat); solid.position.z = sz; solid.castShadow = solid.receiveShadow = true; g.add(solid);
    const glass = new THREE.Mesh(geo.glass, glassMat); glass.position.z = sz; glass.renderOrder = 3; g.add(glass);
    for (const [a, b] of [[-3.9, tx - SALON_GAP], [tx + SALON_GAP, 3.9]]) obstacle((a + b) / 2, sz, (b - a) / 2, SALON_LEN / 2, SALON_TOP, 'cama');
    for (let z = sz - SALON_LEN / 2 - 1; z < sz + SALON_LEN / 2 + 2; z += 2) blocked.push({ x: 0, z, r: 4.6 });
    for (let z = sz + SALON_LEN / 2 - 1.5; z > sz - SALON_LEN / 2; z -= 2.6) addSimit(x0 + tx, FLY_Y, zc + z, Math.random() < 0.06);
    salon = { tx, sz };
  }
  const nCh = 1 + (d > 1 ? 1 : 0) + (d > 2.5 ? 1 : 0);
  const chims = [];
  for (let i = 0; i < nCh; i++) {
    const cx = rand(-2.6, 2.6), cz = -L / 2 + 12 + (i + 0.5) * (L - 16) / nCh + rand(-3, 3);
    if (salon && Math.abs(cz - salon.sz) < SALON_LEN / 2 + 7) continue; // bacalar salondan uzak: geçide hizalanacak yer kalsın
    const c = new THREE.Mesh(ft.chim, vcMat); c.position.set(cx, DECK, cz); c.castShadow = c.receiveShadow = true; g.add(c);
    obstacle(cx, cz, ft.hw, ft.hd, DECK + ft.top, 'bacaya');
    const dark = d > 1.2 && Math.random() < clamp((d - 1) * 0.22, 0, 0.55);
    chims.push({ x: x0 + cx, z: zc + cz, dark, t: Math.random() });
    if (dark) smokes.push({ x: x0 + cx, z0: zc + cz + 1.3, z1: zc + cz + 7.5, hw: 1.6, hit: false });
  }
  // banklar küpeşte boyunca: oturanlar denize bakar, çoğunun elinde çay, simit yok (yem değil, manzara)
  const mine = [];
  const seat = (px, lz, mode, hold, look) => {
    const p = makePerson(hold, look, mode); p.mesh.position.set(px, DECK + 0.05, lz);
    if (mode) p.mesh.rotation.y = (px > 0 ? 1 : -1) * Math.PI / 2 + rand(-0.15, 0.15);
    g.add(p.mesh); p.wz = zc + lz; people.push(p); mine.push(p);
    return p;
  };
  for (let i = 0, nb = 2 + (Math.random() < 0.5 ? 1 : 0); i < nb; i++) {
    const s = pick([-1, 1]), lz = rand(-L / 2 + 12, L / 2 - 6);
    if (blocked.some(b => Math.hypot(b.x - s * 3.2, b.z - lz) < b.r + 1)) continue;
    const bench = new THREE.Mesh(BENCH, vcMat); bench.position.set(s * 3.2, DECK, lz); bench.rotation.y = s > 0 ? 0 : Math.PI; bench.castShadow = true; g.add(bench);
    blocked.push({ x: s * 3.2, z: lz, r: 1.5 });
    for (const dz of [-0.55, 0.55]) if (Math.random() < 0.85) { const p = seat(s * 3.2, lz + dz, 'sit', false); p.mesh.position.y = DECK + 0.05; p.mesh.scale.setScalar(1); }
  }
  // ortada sırt sırta banklar (vapurdaki gibi): yolcular iki yana dönüp denize bakarak oturur, çoğunun elinde çay
  if (Math.random() < 0.55) {
    const n = 1 + (Math.random() < 0.5 ? 1 : 0), zb = rand(-L / 2 + 13, L / 2 - 6 - n * 2.2);
    for (let i = 0; i < n; i++) {
      const lz = zb + i * 2.2;
      if (blocked.some(b => Math.hypot(b.x, b.z - lz) < b.r + 1.2)) continue;
      for (const s of [-1, 1]) {
        const bench = new THREE.Mesh(BENCH, vcMat); bench.position.set(s * 0.3, DECK, lz); bench.rotation.y = s > 0 ? 0 : Math.PI; bench.castShadow = true; g.add(bench);
        for (const dz of [-0.55, 0.55]) if (Math.random() < 0.8) seat(s * 0.3, lz + dz, 'sit', false).mesh.scale.setScalar(1);
      }
      blocked.push({ x: 0, z: lz, r: 1.7 });
    }
  }
  // güverte eşyaları: çöp kutusu (martı gelince kapağı fırlar, içinden simit kırığı zıplar), kasalar (bazen üstünde kedi), halat kangalı
  const free = (x, lz, r) => !blocked.some(b => Math.hypot(b.x - x, b.z - lz) < b.r + r);
  for (let i = 0, nb = Math.random() < 0.65 ? 1 + (Math.random() < 0.35 ? 1 : 0) : 0; i < nb; i++) {
    const s = pick([-1, 1]), x = s * 3.3, lz = rand(-L / 2 + 12, L / 2 - 6);
    if (!free(x, lz, 0.8)) continue;
    const bin = new THREE.Mesh(BIN, vcMat); bin.position.set(x, DECK, lz); bin.scale.setScalar(1.35); bin.castShadow = true; g.add(bin);
    const lid = new THREE.Mesh(BIN_LID, vcMat); lid.position.set(x, DECK + 1.08, lz); lid.scale.setScalar(1.35); g.add(lid);
    blocked.push({ x, z: lz, r: 1 });
    addSimit(x0 + x, DECK + 0.8, zc + lz, false, true);
    const sm = simits[simits.length - 1]; sm.mesh.visible = false; sm.bin = { u: -1, y0: DECK + 0.8 };
    bins.push({ lid, s: sm, z: zc + lz, ly: DECK + 1.08 });
  }
  if (Math.random() < 0.4) {
    const s = pick([-1, 1]), x = s * 3.0, lz = rand(-L / 2 + 12, L / 2 - 6);
    if (free(x, lz, 1)) {
      const c = new THREE.Mesh(CRATES, vcMat); c.position.set(x, DECK, lz); c.rotation.y = s > 0 ? Math.PI : 0; c.castShadow = true; g.add(c);
      blocked.push({ x, z: lz, r: 1.4 });
      if (Math.random() < 0.55) {
        const cat = new THREE.Mesh(CAT, vcMat); cat.position.set(x, DECK + 1.06, lz); cat.rotation.y = rand(-0.5, 0.5); cat.castShadow = true; g.add(cat);
        cats.push({ mesh: cat, x: x0 + x, z: zc + lz, done: false, jump: 0 });
      }
    }
  }
  if (Math.random() < 0.3) {
    const x = rand(-1.5, 1.5), lz = L / 2 - rand(3, 5);
    if (free(x, lz, 0.6)) { const r = new THREE.Mesh(ROPE, vcMat); r.position.set(x, DECK, lz); g.add(r); blocked.push({ x, z: lz, r: 0.8 }); }
  }
  // simit ikram eden yolcu: küpeşteden simidi martıya uzatır; ondan almak serbest, kızmaz, sevinir (bonus)
  if (d > 0.2 && Math.random() < 0.55) {
    const s = pick([-1, 1]), lz = rand(-L / 2 + 12, L / 2 - 6);
    if (!blocked.some(b => Math.hypot(b.x - s * 3.35, b.z - lz) < b.r)) { seat(s * 3.35, lz, 'feed', true); blocked.push({ x: s * 3.35, z: lz, r: 1.2 }); }
  }
  // simit atan yolcu: küpeşteden simidini bölüp parçalarını martının önüne fırlatır (simitçi kayığı gibi). Parçalar güvertenin boş havasına iner.
  // Yarısında atan, simit arabasıyla gezen simitçidir: camlı kasadaki simitler dekor (yenmez), atılan parçalar yenir
  if (d > 0.1 && Math.random() < 0.5) {
    const s = pick([-1, 1]), lz = rand(-L / 2 + 14, L / 2 - 8);
    if (free(s * 3.2, lz, 1.2)) {
      const vendor = Math.random() < 0.5 && free(s * 2.25, lz, 1.3);
      const p = seat(s * 3.2, lz, '', true, vendor ? SIMITCI_LOOK : undefined); p.thrower = true; p.mesh.rotation.y = -s * 0.5;
      blocked.push({ x: s * 3.2, z: lz, r: 1.2 });
      if (vendor) { const cart = makeSimitCart(); cart.position.set(s * 2.25, DECK, lz); g.add(cart); blocked.push({ x: s * 2.25, z: lz, r: 1.3 }); }
      const bt = { g: p.mesh, side: s, person: p, tray: [{ visible: true }, { visible: true }], z: zc + lz, hand: 0, thrown: 0 };
      boats.push(bt);
      let x = rand(-1.5, 1.5);
      for (let k = 0, z = lz - 6; k < 4 && z > -L / 2 + 4; z -= rand(3, 4)) {
        x = clamp(x + rand(-1.8, 1.8), -3, 3);
        const ok = !obstacles.some(o => Math.abs(o.x - (x0 + x)) < o.hw + 1.3 && Math.abs(o.z - (zc + z)) < o.hd + 1.6);
        if (ok) { addThrown(bt, x0 + x, zc + z, false, DECK + 0.1); k++; }
      }
    }
  }
  // ayakta duranlar seyrek: çoğunun elinde simit var (kalabalık değil, hedef)
  for (let lz = -L / 2 + 10; lz < L / 2 - 3; lz += rand(3.4, 4.6)) {
    for (const lx of [-2.9, -1.2, 0.5, 2.2]) {
      if (Math.random() < 0.62) continue;
      const px = lx + rand(-0.4, 0.4);
      if (blocked.some(b => Math.hypot(b.x - px, b.z - lz) < b.r)) continue;
      // birkaçı simitsiz: eli boş, telefonda, el sallıyor
      seat(px, lz, '', Math.random() < 0.7 + d * 0.03);
    }
  }
  g.updateMatrixWorld(true);
  for (const p of mine) {
    if (!p.simit || p.thrower) continue;
    const gold = Math.random() < 0.02;
    if (gold) p.simit.material = makeSimit(true).material;
    p.simit.getWorldPosition(tmp);
    simits.push({ mesh: p.simit, x: tmp.x, y: tmp.y, z: tmp.z, person: p, gold });
  }
  ferries.push({ group: g, x: x0, zFront, zBack, ph: Math.random() * 6, chims, flag, salon: salon && { x: x0 + salon.tx, z: zc + salon.sz } });
  genZ = zFront - 2;
}

// ---------------- uzak kuş sürüleri: gökte, şeridin çok dışında V düzeninde süzülür; dokunulmaz, yalnız manzara ----------------
// Tek InstancedMesh (bir çizim çağrısı); sürü geride kalınca ileriye, yeni bir yere taşınır.
const FLOCKS = 6, PER = 9;
const birdMesh = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, -1, 0.3, 0.12, 0, 0, 0.22, 0, 0, -0.18, 0, 0, 0.22, 1, 0.3, 0.12], 3));
  const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x3d3846, side: THREE.DoubleSide }), FLOCKS * PER);
  im.frustumCulled = false; scene.add(im);
  return im;
})();
const flocks = [];
const _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _bp = new THREE.Vector3(), _bm = new THREE.Matrix4(), _by = new THREE.Vector3(0, 1, 0);
function placeFlock(f, gz, first) {
  const side = pick([-1, 1]);
  f.x = side * rand(24, 75); f.y = rand(15, 32); f.z = gz - (first ? rand(30, 260) : rand(200, 300));
  const a = rand(-0.9, 0.9) + (Math.random() < 0.5 ? 0 : Math.PI); // çoğu Boğaz boyunca, bazısı çapraz
  f.vx = Math.sin(a) * rand(4, 8); f.vz = -Math.cos(a) * rand(4, 8); f.yaw = Math.atan2(-f.vx, -f.vz); f.n = 4 + ((Math.random() * (PER - 4)) | 0);
}
for (let i = 0; i < FLOCKS; i++) { const f = { ph: Math.random() * 6 }; placeFlock(f, 0, true); flocks.push(f); }
function updateFlocks(dt, gz) {
  let i = 0;
  for (const f of flocks) {
    f.x += f.vx * dt; f.z += f.vz * dt;
    if (f.z > gz + 25 || f.z < gz - 340 || Math.abs(f.x) > 120) placeFlock(f, gz, false);
    _bq.setFromAxisAngle(_by, f.yaw);
    for (let k = 0; k < PER; k++, i++) {
      if (k >= f.n) { _bm.makeScale(0, 0, 0); birdMesh.setMatrixAt(i, _bm); continue; }
      const row = (k + 1) >> 1, s = k % 2 ? 1 : -1; // V: önde lider, iki kol arkaya açılır
      _bp.set(s * row * 1.7, Math.sin(k * 1.3) * 0.4, row * 1.5).applyQuaternion(_bq).add(_bs.set(f.x, f.y, f.z));
      const flap = 0.35 + Math.sin(t * 7 + f.ph + k * 0.9) * 0.9;
      _bm.compose(_bp, _bq, _bs.set(1.8, flap * 1.4, 1.8)); birdMesh.setMatrixAt(i, _bm);
    }
  }
  birdMesh.instanceMatrix.needsUpdate = true;
}

// ---------------- kıyı dekoru: koridorun dışında balıkçı tekneleri, arada bir yakından geçen Kız Kulesi ----------------
function spawnScenery(limit) {
  while (sceneryZ > limit) {
    sceneryZ -= rand(22, 52);
    if (Math.random() < 0.85 && !piers.some(p => Math.abs(p.z - sceneryZ) < 34)) {
      const side = pick([-1, 1]), r = Math.random();
      const b = r < 0.5 ? makeFishingBoat(side) : r < 0.78 ? makeSailboat() : makeYacht();
      b.position.set(side * rand(15, r < 0.5 ? 30 : 40), 0, sceneryZ); b.rotation.y = rand(-0.5, 0.5) + (r >= 0.5 && Math.random() < 0.5 ? Math.PI : 0);
      scene.add(b); decor.push({ mesh: b, z: sceneryZ, ph: Math.random() * 6 });
    }
    if (sceneryZ < cruiseZ) {
      cruiseZ = sceneryZ - rand(380, 700);
      if (!land.some(l => l.mesh.position.x > 30 && l.mesh.position.x < 45 && Math.abs(l.z - sceneryZ) < 220)) { // Kız Kulesi bu yakadaysa gemi çıkmaz
        const c = makeCruise(), flip = Math.random() < 0.5;
        c.position.set(rand(62, 88), 0, sceneryZ - 40); c.scale.setScalar(rand(1.4, 1.7)); c.rotation.y = rand(-0.25, 0.25) + (flip ? Math.PI : 0);
        c.userData.face = flip ? Math.PI / 2 : -Math.PI / 2; // yolcular koridora (martıya) dönük
        scene.add(c); land.push({ mesh: c, z: sceneryZ - 40, crowd: true });
      }
    }
    if (sceneryZ < maidenZ) {
      maidenZ = sceneryZ - rand(1100, 1700);
      const ship = land.find(l => l.crowd && l.mesh.position.x > 50 && Math.abs(l.z - sceneryZ) < 220); // yolcu gemisi yakınsa öbür yakaya
      const m = makeMaiden(), side = ship ? -1 : pick([-1, 1]);
      m.position.set(side * rand(34, 40), 0, sceneryZ - 20); m.rotation.y = side > 0 ? 0 : Math.PI;
      scene.add(m); land.push({ mesh: m, z: sceneryZ - 20, crowd: true });
    }
    // demir yerindeki büyük gemiler (Boğaz'da, körfezde sıra bekleyen şilepler ve tankerler): sisin içinde, orta uzaklıkta durur.
    // Kız Kulesi ya da yolcu gemisi o yakada yakınsa çıkmaz
    if (sceneryZ < anchorZ) {
      anchorZ = sceneryZ - rand(110, 240);
      const side = pick([-1, 1]), x = side * rand(88, 122), z = sceneryZ - rand(0, 30);
      if (!land.some(l => Math.sign(l.mesh.position.x) === side && Math.abs(l.mesh.position.x) > 30 && Math.abs(l.z - z) < 150)) {
        const tank = Math.random() < 0.45, s = new THREE.Mesh(tank ? tankerGeo((Math.random() * 3) | 0) : cargoGeo((Math.random() * 3) | 0), vcMat);
        s.position.set(x, -0.2, z); s.scale.setScalar(rand(1.6, 2.2)); s.rotation.y = rand(-0.5, 0.5) + (Math.random() < 0.5 ? Math.PI : 0);
        scene.add(s); land.push({ mesh: s, z });
      }
    }
    // açıkta seyreden gemiler: dış şeritte karşıdan gelen ya da bizimle giden vapur, daha açıkta şilep. Dokunulmaz, yalnız manzara.
    // Demirli teknelerin (±15-40) dışında kendi şeritleri var; Kız Kulesi, yolcu gemisi ya da başka gemi o yakada yakınsa çıkmaz
    if (Math.random() < 0.2 && !piers.some(p => Math.abs(p.z - sceneryZ) < 90)) {
      const big = Math.random() < 0.55, side = pick([-1, 1]), x = side * (big ? rand(66, 84) : rand(50, 57));
      const busy = [...land, ...decor.filter(d => d.vz)].some(l => Math.sign(l.mesh.position.x) === side && Math.abs(l.mesh.position.x) > 30 && Math.abs(l.z - sceneryZ) < 170);
      if (!busy) {
        const g = new THREE.Group();
        if (big) g.add(new THREE.Mesh(Math.random() < 0.35 ? tankerGeo((Math.random() * 3) | 0) : cargoGeo((Math.random() * 3) | 0), vcMat));
        else { const ft = pickFerryType(); g.add(new THREE.Mesh(ferryGeo(pick(ft.lengths), ft.id), vcMat)); const c = new THREE.Mesh(ft.chim, vcMat); c.position.set(0, DECK, 0); g.add(c); }
        const toward = Math.random() < 0.6; // çoğu karşıdan gelir
        g.rotation.y = toward ? 0 : Math.PI; g.position.set(x, 0, sceneryZ);
        scene.add(g); decor.push({ mesh: g, z: sceneryZ, ph: Math.random() * 6, calm: true, vz: (toward ? 1 : -1) * rand(3, 6) });
      }
    }
  }
}

// iskele kesiti: açık su, kıyıda iskele binası (son durakta fener), koridorun üstünde isim tabelalı kapı.
// Kapıya giden simit dizisi tabelanın tam altındaki altın simitte biter; kapıdan geçince varış.
function spawnPier() {
  const i = pierI++, z0 = genZ, gz = z0 - PIER_HALF, side = pick([-1, 1]), last = i === STOPS.length - 1;
  stopM[i] = -gz / 2;
  decor = decor.filter(d => (Math.abs(d.z - gz) < (d.vz ? 90 : 34) && Math.abs(d.mesh.position.x) > 7 ? (scene.remove(d.mesh), false) : true));
  land = land.filter(l => (Math.abs(l.z - gz) < 60 ? (scene.remove(l.mesh), false) : true));
  const g = new THREE.Group(); g.position.z = gz; scene.add(g);
  g.add(makeStopGate(STOPS[i].name));
  const b = new THREE.Mesh(last ? LIGHTHOUSE : PIER, vcMat); b.castShadow = true;
  b.position.x = side * (last ? 16 : 17); b.rotation.y = side > 0 ? 0 : Math.PI; g.add(b);
  const throwers = [];
  if (!last) for (let k = 0, n = 3 + ((Math.random() * 3) | 0); k < n; k++) { // iskelede martıyı bekleyenler; ilk ikisi simit atar
    const p = makePerson(k < 2, k === 0 ? SIMITCI_LOOK : undefined); p.mesh.position.set(side * (17 - rand(5.2, 8.4)), 1.28, k < 2 ? -2 - k * 3 : rand(-3, 4.5)); p.mesh.rotation.y = -side * Math.PI / 2 + rand(-0.4, 0.4); g.add(p.mesh);
    if (k === 0) { const st = makeSimitStand(); st.position.set(p.mesh.position.x + side * 0.4, 1.28, -3.4); st.scale.setScalar(1.15); g.add(st); } // simitçinin tablası (dekor)
    if (k < 2) { const bt = { g: b, person: p, tray: [{ visible: true }, { visible: true }, { visible: true }], z: gz, hand: 0, thrown: 0 }; boats.push(bt); throwers.push(bt); }
  }
  const gx = rand(-2.4, 2.4);
  for (let k = 5; k >= 1; k--) addSimit(gx + k * rand(-0.5, 0.5), FLY_Y, gz + k * 3.4, false);
  addSimit(gx, FLY_Y, gz, true);
  // kapının ardında simit yağmuru: iskeledekiler parça parça atar, martı geldiğinde inerler
  for (let k = 0, x = gx; throwers.length && k < 9; k++) { x = clamp(x + rand(-2.2, 2.2), -LANE + 0.8, LANE - 0.8); addThrown(throwers[k % 2], x, gz - 5 - k * 3.4, k === 8); }
  piers.push({ g, z: gz, i, side });
  genZ = z0 - PIER_HALF * 2;
}
function clearWorld() {
  for (const l of land) scene.remove(l.mesh);
  land = [];
  for (const f of ferries) scene.remove(f.group);
  for (const s of simits) { if (s.free) scene.remove(s.mesh); dropThrown(s); }
  for (const a of [...rivals.map(r => r.mesh), ...kites.map(k => k.g), ...powerups.map(p => p.g), ...decor.map(d => d.mesh)]) scene.remove(a);
  for (const c of crossers) scene.remove(c.mesh);
  for (const f of dolphins) scene.remove(f.mesh);
  for (const f of fishes) scene.remove(f.mesh);
  for (const b of bridges) scene.remove(b.g);
  for (const b of imbats) scene.remove(b.g);
  imbats = []; imbatW = 0;
  for (const p of pirates) scene.remove(p.g);
  pirates = [];
  for (const f of falls) scene.remove(f.g);
  falls = []; fallsLift = 0; fallsW = 0;
  for (const p of piers) scene.remove(p.g);
  ferries = []; obstacles = []; simits = []; rivals = []; kites = []; powerups = []; people = []; decor = []; smokes = []; boats = []; crossers = []; dolphins = []; fishes = []; bridges = []; bins = []; cats = []; piers = [];
  clearFx();
}
function generate(limit) {
  planTurns(limit - 200); spawnScenery(limit);
  while (genZ > limit) {
    if (pierI < STOPS.length) { // sıradaki iskele yaklaştıysa önünü düz suyla tam kapıya denk gelecek şekilde doldur
      const pz = -2 * STOPS[pierI].m + PIER_HALF;
      if (genZ - pz < 130) { if (genZ - pz > 30) spawnGap(segCount === 0, genZ - pz); else spawnPier(); continue; }
    }
    const tn = turns.find(u => !u.built && u.z0 > genZ - 75); // yaklaşan virajın öncesini düz suyla doldur
    if (!tn) { segCount % 2 === 0 ? (genZ < bridgeZ ? spawnBridge() : genZ < imbatZ ? spawnImbat() : genZ < pirateZ ? spawnPirate() : genZ < fallsZ ? spawnFalls() : spawnGap(segCount === 0)) : spawnFerry(); segCount++; }
    else if (genZ - tn.z0 > 30) spawnGap(segCount === 0, genZ - tn.z0);
    else { spawnTurn(tn); if (segCount % 2 === 0) segCount++; }
  }
}
function cleanup(z) {
  const behind = z + 30;
  ferries = ferries.filter(f => (f.zFront > behind ? (scene.remove(f.group), false) : true));
  obstacles = obstacles.filter(o => o.z < behind);
  smokes = smokes.filter(s => s.z0 < behind);
  simits = simits.filter(s => (s.z > behind ? (s.free && scene.remove(s.mesh), dropThrown(s), false) : true));
  boats = boats.filter(b => b.z < behind);
  crossers = crossers.filter(c => (c.z > behind ? (scene.remove(c.mesh), false) : true));
  dolphins = dolphins.filter(f => (f.z > behind ? (scene.remove(f.mesh), false) : true));
  fishes = fishes.filter(f => (f.z > behind ? (scene.remove(f.mesh), false) : true));
  bridges = bridges.filter(b => (b.z > behind + 10 ? (scene.remove(b.g), false) : true));
  imbats = imbats.filter(b => (b.z1 > behind ? (scene.remove(b.g), false) : true));
  pirates = pirates.filter(p => (p.z > behind + 10 ? (scene.remove(p.g), false) : true));
  falls = falls.filter(f => (f.zB > behind + 20 ? (scene.remove(f.g), false) : true));
  piers = piers.filter(p => (p.z > behind + 30 ? (scene.remove(p.g), false) : true));
  bins = bins.filter(b => b.z < behind); cats = cats.filter(c => c.z < behind);
  rivals = rivals.filter(r => (r.mesh.position.z > behind ? (scene.remove(r.mesh), false) : true));
  kites = kites.filter(k => (k.z > behind ? (scene.remove(k.g), false) : true));
  powerups = powerups.filter(p => (p.z > behind ? (scene.remove(p.g), false) : true));
  decor = decor.filter(d => (d.z > behind ? (scene.remove(d.mesh), false) : true));
  land = land.filter(l => (l.z > behind + 30 ? (scene.remove(l.mesh), false) : true));
  people = people.filter(p => p.wz < behind);
  turns = turns.filter(u => u.z1 < behind);
}
// dev gemideki kalabalık (frame içinde 'land' başka anlamda kullanılıyor, o yüzden ayrı)
function animLand(gz) { for (const l of land) if (l.crowd && l.z > gz - 320 && l.z < gz + 60) animCrowd(l.mesh, t); }
function deckUnder(x, z) {
  for (const f of ferries) if (z < f.zBack - 1 && z > f.zFront + 2 && Math.abs(x - f.x) < 4) return true;
  return false;
}

// ---------------- oyun durumu ----------------
let state = 'loading';
let speed = 15, playT = 0, points = 0, simitCount = 0, goldCount = 0, combo = 0, bestCombo = 0, comboT = 0, dist = 0;
let crashT = 0, vy = 0, cause = '', trauma = 0, hitStop = 0, timeScale = 1, flapPh = 0, flapPow = 0.5, flapBurst = 0;
let tx = 0, vx = 0, cryT = 4, invuln = 0, smokeT = 0, overLock = 0, countdown = 0, god = false, splashed = false, revives = 0, fishRev = 0, adRevived = false;
const pw = { magnet: 0, shield: 0, double: 0 };
// güçlendirme yükseltmeleri: simitle alınır, her seviye süreyi tabanın %25'i kadar uzatır (Subway Surfers usulü)
const UP_COST = [300, 700, 1400, 2500, 4000];
const ups = { magnet: 0, shield: 0, double: 0 };
{ const u = store.get(KEY_UP, {}) || {}; for (const k in ups) ups[k] = clamp(u[k] | 0, 0, UP_COST.length); }
const dur = k => POWER[k].dur * (1 + ups[k] * 0.25);
let best = +store.get(KEY_BEST, 0) || 0;
// simit cüzdanı: kapılan sekiz simitte (32 parça) bir simit cüzdana girer (altın simit 5 sayılır); banked = bu uçuştan cüzdana geçen
const WALLET_RATE = 8;
let wallet = Math.max(0, +store.get(KEY_WALLET, 0) || 0), banked = 0;
// balık: ikinci para birimi (Subway'deki anahtar gibi). Zıplayan balıklardan nadiren gelir, yeniden doğmak için harcanır.
// Bir uçuşta her yeniden doğuş bir öncekinin iki katı balık ister (1, 2, 4...).
let fish = Math.max(0, +store.get(KEY_FISH, 0) || 0), fishRun = 0, fishSpawn = 0.12, fishCatch = 0.4, fishEarly = false;
const fishCost = () => 2 ** fishRev;
function setFish(n) { fish = Math.max(0, n); store.set(KEY_FISH, fish); }
const look = { owned: [], on: [] };
{ const l = store.get(KEY_LOOK, {}), ok = id => COSTUMES.some(c => c.id === id);
  look.owned = (Array.isArray(l.owned) ? l.owned : []).filter(ok); look.on = (Array.isArray(l.on) ? l.on : []).filter(id => look.owned.includes(id)); }
let tutorialPending = !store.get(KEY_TUT, false);
const keys = {};
let gear = 0, gearAt = GEAR_M;
// hava (weather.js): yağmurda rüzgâr esintisi martıyı yana iter, karda simit yemezsen üşürsün, siste ufuk kısalır
let weather = 'clear', wind = 0, gustT = 0, gustDir = 1, gustNext = 8, boltNext = 10, hornNext = 12, warmth = 1, shownWarm = -1;
const GUST = 6.5, COLD_S = 28; // GUST: esinti gücü, COLD_S: hiç simit yemeden kaç saniyede donarsın
const run = { near: 0, power: 0, steal: 0, turn: 0, dolphin: 0, bridge: 0, feed: 0, piece: 0, fish: 0 }; // görevler ve başarımlar için uçuş sayaçları

function resetWorld(newWeather = true) {
  clearWorld(); genZ = -8; segCount = 0; sceneryZ = 10; maidenZ = city.maiden ? rand(-500, -300) : -Infinity; cruiseZ = rand(-120, -40); anchorZ = rand(-60, -10);
  bridgeZ = !city.bridges ? -Infinity : BRIDGE_SOON ? -90 : -rand(1150, 1450); // ilk köprü Karaköy'den sonra
  imbatZ = !city.imbat ? -Infinity : IMBAT_SOON ? -90 : -rand(800, 1000); // ilk imbat Göztepe'den sonra
  pirateZ = !city.pirate ? -Infinity : PIRATE_SOON ? -90 : -rand(1050, 1300); // ilk korsan teknesi Kaleiçi'nden sonra
  fallsZ = !city.falls ? -Infinity : FALLS_SOON ? -90 : -rand(1600, 1900); // ilk şelale Mermerli'den önce
  turns = []; turnZ = 0; planYaw = 0; heading = 0; lean = 0; push = 0; sling = 0; slingV = 0;
  gull.position.set(0, FLY_Y, 0); gull.rotation.set(0, 0, 0); tx = 0; vx = 0;
  speed = 15; playT = 0; points = 0; simitCount = 0; goldCount = 0; banked = 0; combo = 0; bestCombo = 0; comboT = 0; dist = 0;
  crashT = 0; vy = 0; trauma = 0; hitStop = 0; timeScale = 1; invuln = 0; smokeT = 0; splashed = false; revives = 0; fishRev = 0; adRevived = false; fishRun = 0; fishEarly = false;
  pw.magnet = pw.shield = pw.double = 0;
  for (const k in run) run[k] = 0; gear = 0; gearAt = GEAR_M; stopI = 1; pierI = 1; stopM = STOPS.map(s => s.m); shownStop = -1; newStop = 0; slowT = 0;
  if (newWeather) { weather = pickWeather(); applyWeather(weather); setWeatherFx(weather); } // başlıkta görülen hava uçuşta da sürer
  wind = 0; gustT = 0; gustNext = rand(6, 9); boltNext = rand(4, 9); hornNext = rand(5, 10); warmth = 1; shownWarm = -1;
  show('warm', false); $('warm').classList.remove('cold');
  generate(-280); placeMarks();
  camera.position.set(0, FLY_Y + 5.4, 13.5);
}
// suda bayraklı şamandıralar: altın olan en uzun uçuşun, mavi olan meydan okuyan arkadaşının metresi. Şeridin dışında durur, çarpmaz.
// Yanından geçmek: kendi rekorunda ses ve parıltı, arkadaşınınkinde ayrıca küçük bonus ve konfeti.
let marks = [];
const markMats = new Map(), MARK_POLE = new THREE.CylinderGeometry(0.08, 0.08, 6.6, 6), MARK_FLAG = new THREE.PlaneGeometry(2.6, 1.3), markPole = new THREE.MeshBasicMaterial({ color: 0xf3efe6 });
function markMat(text, bg) {
  const k = text + bg;
  if (!markMats.has(k)) markMats.set(k, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff8e8'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff8e8'; g.font = '800 56px "Baloo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4, w - 34);
  }) }));
  return markMats.get(k);
}
function addMark(m, text, bg, kind) {
  const side = kind === 'vs' ? -1 : 1, x = side * (LANE + 2.4), z = -2 * m, g = new THREE.Group();
  const b = new THREE.Mesh(BUOY, vcMat); b.scale.setScalar(1.35); g.add(b);
  const p = new THREE.Mesh(MARK_POLE, markPole); p.position.y = 3.7; g.add(p);
  const f = new THREE.Mesh(MARK_FLAG, markMat(text, bg)); f.position.set(side * 1.3, 6.3, 0); g.add(f);
  g.position.set(x, 0, z); scene.add(g);
  marks.push({ g, f, x, z, kind, passed: false });
}
function placeMarks() {
  for (const k of marks) scene.remove(k.g);
  marks = [];
  const own = Math.floor(((store.get(KEY_ACH, {}) || {}).st || {}).maxDist || 0);
  if (own >= 150) addMark(own, tr('Rekor'), '#d9952a', 'own');
  if (vs && !vs.won && vs.d >= 60 && vs.city === city.id) addMark(vs.d, fmt(vs.s), '#2f7fd6', 'vs');
}
// ana menü arka sahnesi: şehrin tanıdık yerleri martının gerisinde onunla ilerler; uçuş başlayınca gizlenir
// üç katman (ön kıyı, orta yamaç, arka karşı kıyı) salınımı farklı oranda izler: ön çok kayar, arka gök gibi neredeyse durur (2.5D)
const titleSets = {};
const TITLE_LAYERS = { near: 0.12, mid: 0.28, far: 0.5 };
function updateTitleSet(gz) {
  for (const id in titleSets) titleSets[id].visible = false;
  if (state !== 'title' || !TITLE_SETS[city.id]) return;
  let set = titleSets[city.id];
  if (!set) {
    const geos = TITLE_SETS[city.id]();
    set = titleSets[city.id] = new THREE.Group(); scene.add(set);
    for (const k in TITLE_LAYERS) { const m = new THREE.Mesh(geos[k], softMat); m.scale.setScalar(TITLE_SCALE); m.userData.follow = TITLE_LAYERS[k]; set.add(m); set.userData[k] = m; }
    if (city.maiden) { const k = makeMaiden(); k.position.set(46, 0, -34); k.rotation.y = -Math.PI / 2 - 0.35; set.userData.near.add(k); set.userData.crowd = k; } // İstanbul: önde Kız Kulesi, terastakiler el sallar
  }
  if (set.userData.crowd) animCrowd(set.userData.crowd, t);
  // vitrin kamerası martıya önden bakar ve yavaşça salınır: her katman kameranın doğrultusunda martının arkasına oturur,
  // salınımın yalnız bir kısmını izler: uzak manzara gibi kayar, kameranın peşinden gelmez
  set.visible = true;
  for (const m of set.children) {
    const a = TITLE_A + (titleCamA - TITLE_A) * m.userData.follow;
    m.rotation.y = a - Math.PI; m.position.set(-Math.sin(a) * TITLE_D, 0, gz - Math.cos(a) * TITLE_D);
  }
}
const TITLE_A = Math.PI - 0.5, TITLE_D = 88, TITLE_SCALE = 0.4;
let titleCamA = TITLE_A;
function updateMarks(gz) {
  for (const k of marks) {
    k.g.position.y = waveAt(k.x, k.z, t) * 0.6;
    k.f.rotation.y = Math.sin(t * 2.3 + k.x) * 0.2;
    if (!k.passed && state === 'play' && gz < k.z) { k.passed = true; passMark(k); }
  }
}
function passMark(k) {
  const p = tmp2.set(k.x, 6.3, k.z);
  if (k.kind === 'vs') {
    points += 50 * mult(); flapBurst = 1; trauma = Math.min(1, trauma + 0.2);
    sfx.record(); vibrate([20, 30, 20]); confetti(); sparkle(p, 44, 0x6fb8ff, 7, 1);
  } else { sfx.near(); vibrate(15); sparkle(p, 30, 0xffd36b, 6, 0.8); }
}

// ---------------- arayüz ----------------
const ui = {
  score: $('score'), simits: $('simits'), dist: $('dist'), combo: $('combo'), mult: $('mult'), comboRing: $('comboRing'),
  hud: $('hud'), powers: $('powers'), vignette: $('vignette'), flash: $('flash'),
};
let shownFish = -1, shownScore = -1, shownSimit = -1, shownDist = -1, shownMult = 0, shownStop = -1, shownLeft = -1;
function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
function bump(el, cls = 'bump') { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const total = () => points + Math.floor(dist / 10);
const fmt = n => n.toLocaleString(window.I18N.locale);

// hat: oyun sonunda tek satır, ana menüde nokta nokta harita + hedef cümlesi
const toStop = (i, n) => tr('{to} {n} m kaldı').replace('{to}', STOPS[i].to).replace('{s}', STOPS[i].name).replace('{n}', fmt(n));
function renderRouteLine() {
  const el = $('overRoute');
  el.classList.toggle('new', newStop > 0);
  if (newStop) el.innerHTML = `${tr('Yeni iskele')}: <b>${STOPS[newStop].name}</b> +${fmt(STOPS[newStop].gift)} <svg class="ico"><use href="#i-simit"/></svg>`;
  else if (stopI < STOPS.length) el.textContent = toStop(stopI, Math.max(1, Math.ceil(stopM[stopI] - dist)));
  else el.textContent = tr(city.end);
}
function renderRouteMap() {
  const open = cityOpen(city);
  $('cityName').textContent = city.name;
  $('cityPick').classList.toggle('locked', !open); $('playBtn').classList.toggle('locked', !open); $('routeMap').classList.toggle('locked', !open);
  if (!open) {
    $('routeMap').innerHTML = STOPS.map(s => `<i title="${s.name}"></i>`).join('');
    $('routeGoal').textContent = '🔒 ' + tr(city.after);
    return;
  }
  const goal = Math.min(farStop + 1, STOPS.length - 1), done = farStop === STOPS.length - 1;
  $('routeMap').innerHTML = STOPS.map((s, i) => `<i class="${i <= farStop ? 'got' : i === goal ? 'goal' : ''}" title="${s.name}"></i>`).join('');
  $('routeGoal').innerHTML = done ? tr(city.end) : `${tr('Hedef')}: <b>${STOPS[goal].name}</b> · ${fmt(STOPS[goal].m)} m`;
}
let dailyAuto = false, leagueAuto = false; // kendiliğinden açılan ödül pencereleri: sayfa açılışında bir kez
function showTitle() {
  state = 'title'; applyShadows(); bank(); resetWorld(); refillMissions();
  document.querySelector('.legend').classList.toggle('hidden', !tutorialPending);
  document.querySelectorAll('.menu-side').forEach(n => n.classList.toggle('hidden', tutorialPending));
  renderMissions($('titleMis')); renderMenuBadges(); renderRouteMap();
  show('missionsPanel', false); show('achPanel', false); show('dailyPanel', false); show('upPanel', false); show('boardPanel', false); show('leaguePanel', false);
  ui.powers.textContent = '';
  dressing = false; show('wardrobe', false); if (cosSel) { cosSel = null; applyLook(); }
  $('titleWallet').textContent = fmt(wallet); $('titleFish').textContent = fmt(fish);
  show('title'); show('over', false); show('pause', false); show('hud', false); show('settings', false); show('countdown', false);
  $('titleBest').textContent = best ? `${tr('Rekor')} ${fmt(best)}` : tr('İlk uçuşun!');
  show('vsPill', !!vs && !vs.won);
  if (vs && !vs.won) $('vsPill').textContent = tr('Bir arkadaşın {s} puan yaptı. Geçebilir misin?').replace('{s}', fmt(vs.s));
  audio.music(true);
  // günün ilk açılışında ödül kendiliğinden gelir; alınmadan geçilirse her oyun sonunda yeniden açılmaz (menüdeki nokta kalır)
  if (!tutorialPending && !dailyAuto && dailyState().ready) setTimeout(() => { if (state === 'title' && !dressing && !menuModal()) { dailyAuto = true; openDaily(); } }, 700);
  else if (!tutorialPending && !leagueAuto) setTimeout(() => state === 'title' && !dressing && !menuModal() && offerLeague(), 700); // biten haftanın sıralama ödülü
}
function stepCity(d) { // menüde şehirler arasında gez; kilitli şehir görünür ama uçulmaz
  if (state !== 'title') return;
  useCity(CITIES[(CITIES.indexOf(city) + d + CITIES.length) % CITIES.length]);
  store.set(KEY_CITY, city.id);
  applyWeather(weather); resetWorld(false); renderRouteMap();
}
function startGame() {
  if (!cityOpen(city)) { bump($('cityPick'), 'shake'); vibrate(30); return; }
  audio.unlock();
  sfx.click();
  refillMissions();
  achRun = {}; saidRun.clear();
  for (const m of missions) { m.p0 = misDef(m.k).total ? m.p || 0 : 0; m.wasDone = m.done; } // oyun sonunda çubuk buradan dolar
  resetWorld(state !== 'title'); state = 'play';
  qWarm = 4;
  show('title', false); show('over', false); show('hud'); show('pause', false);
  for (const id of ['missionsPanel', 'achPanel', 'dailyPanel', 'upPanel', 'boardPanel', 'leaguePanel', 'settings']) show(id, false);
  shownScore = shownSimit = shownDist = shownFish = -1; shownMult = 0;
  ui.combo.classList.remove('on');
  renderPowers();
  if (tutorialPending) startTutorial();
  sfx.horn(); sfx.cry(0.12, 0.6);
  audio.music(true); audio.duck(false);
  updateHud();
}
function crash(why) {
  if (state !== 'play' || invuln > 0 || god) return;
  if (pw.shield > 0) { // kalkan çarpmayı yutar
    pw.shield = 0; invuln = 1.3; hitStop = 0.07; trauma = Math.min(1, trauma + 0.45);
    sparkle(gull.position, 40, 0x8fd3ff, 7, 0.7, 0.6);
    flats.emit(gull.position, 16, { speed: 7, life: 0.8, size: 0.5, color: [0x8fd3ff, 0xffffff], gravity: 4 });
    sfx.shieldBreak(); vibrate(40); renderPowers();
    return;
  }
  state = 'dead'; cause = why; crashT = 0; vy = 5.5; ui.powers.textContent = '';
  hitStop = 0.14; timeScale = 0.3; trauma = 1;
  bump(ui.flash, 'flashing');
  sfx.crash(); vibrate([60, 40, 90]);
  audio.duck(true);
  flats.emit(gull.position, 26, { speed: 6, life: 1.6, size: 0.42, color: [0xffffff, 0xf0f0f0, 0xaab4c0], gravity: 2.5, drag: 2.4, flutter: 5 });
  sparkle(gull.position, 24, 0xffffff, 8, 0.4, 0.3);
  hideTutorial();
}
function showOver() {
  show('warm', false); shownWarm = -1;
  state = 'over'; overLock = 0.8; applyShadows();
  const final = total();
  const isBest = final > best, prevBest = best;
  if (isBest) { best = final; store.set(KEY_BEST, best); }
  const msg = { 'rakip martıya': 'Martı kavgası!', 'uçurtmaya': 'Uçurtmaya dolandın!', 'bacaya': 'Bacaya çarptın!', 'direğe': 'Direğe çarptın!', 'yelkene': 'Yelkene takıldın!', 'oltaya': 'Oltaya takıldın!', 'cama': 'Cama çarptın!', 'korsana': 'Korsan teknesine çarptın!' };
  $('overTitle').textContent = tr(msg[cause] || 'Pat!');
  $('stSimit').textContent = fmt(Math.floor(simitCount)) + (goldCount >= 1 ? ` (+${Math.floor(goldCount)} ${tr('altın')})` : '');
  $('stDist').textContent = `${fmt(Math.round(dist))} m`;
  $('stCombo').textContent = `${bestCombo}`;
  ui.powers.textContent = '';
  renderRouteLine();
  $('overBest').textContent = isBest ? tr('Önceki rekoru geçtin') : `${tr('Rekor')} ${fmt(best)}`;
  $('newRecord').classList.toggle('hidden', !isBest);
  { // haftalık sıra: bu uçuş sıranı yükselttiyse eski sırayı da göster
    const wk = recordRun(final), now = rankOf(wk.best), was = wk.before > 0 ? rankOf(wk.before) : 0;
    $('overRank').textContent = tr('Haftalık sıran: {r}').replace('{r}', '#' + fmt(now)) + (was && now < was ? `  ▲ ${fmt(was - now)}` : '');
  }
  { // meydan okuma: arkadaşını geçtin mi, kaç puan kaldı
    const el = $('overVs'), beat = !!vs && !vs.won && final > vs.s;
    show('overVs', !!vs && (!vs.won || beat)); el.classList.toggle('won', beat);
    if (beat) { vs.won = true; store.set(KEY_VS, vs); el.textContent = tr('Arkadaşını geçtin! Şimdi sıra onda.'); }
    else if (vs && !vs.won) el.textContent = tr('Arkadaşını geçmene {n} puan kaldı').replace('{n}', fmt(vs.s - final + 1));
    shareWon = beat; shareLbl = tr(beat ? 'Rövanş iste' : 'Meydan oku'); $('shareBtn').textContent = shareLbl;
  }
  const achBefore = achReady(), bdgBefore = badgesGot(); achRecord();
  if (!revives) countMission('runs');
  checkMissions(); store.set(KEY_MIS, missions); bank();
  renderMissions($('overMis'), true);
  { const n = achReady() - achBefore, nb = badgesGot() - bdgBefore; show('overAch', n > 0 || nb > 0);
    const part = (k, s) => (k > 0 ? `${tr(s)}${k > 1 ? ' ×' + k : ''}` : '');
    $('overAch').innerHTML = `<svg><use href="#i-medal"/></svg>${[part(n, 'Yeni başarım!'), part(nb, 'Yeni rozet!')].filter(Boolean).join(' · ')}`; }
  $('overEarn').innerHTML = `<span id="earnN">+0 <svg class="ico"><use href="#i-simit"/></svg></span><small class="earn-rate">${fmt(Math.floor(simitCount + goldCount * 4))} ÷ ${WALLET_RATE}</small><span id="earnW">${tr('Cüzdan')} <b>${fmt(wallet - banked)}</b> <svg class="ico"><use href="#i-simit"/></svg></span>`
    + (fishRun ? `<span class="earn-fish">+${fmt(fishRun)} <svg class="ico"><use href="#i-fish"/></svg></span>` : '');
  setTimeout(() => state === 'over' && earnFlow(banked, wallet), 700);
  show('over'); show('hud', false); hideTutorial();
  // yeniden doğuş: balık harcayarak (her seferinde iki katı), portalda ayrıca uçuş başına bir kez ödüllü reklamla (iyi bir uçuşta)
  const canRevive = !!window.PF && !adRevived && final >= 250 && final >= prevBest * 0.4 && rewardReady();
  $('reviveLbl').textContent = tr('Reklam izle, devam et');
  $('reviveBtn').disabled = false;
  show('reviveBtn', canRevive); show('reviveNote', false);
  if (canRevive && window.PF.offerReward) window.PF.offerReward();
  renderFishBtn();
  const el = $('overScore'), t0 = performance.now(), dur = Math.min(1400, 500 + final * 2);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(final * e));
    if (k < 1) requestAnimationFrame(step);
    else { bump(el); if (isBest) { bump($('newRecord'), 'popin'); sfx.record(); confetti(); vibrate([30, 40, 30]); } }
  };
  el.textContent = '0';
  requestAnimationFrame(step);
  audio.duck(false);
}
// oyun sonu: kazanç sayarak artar, simitler cüzdan hapına akar, cüzdan aynı anda dolar
function earnFlow(gain, to) {
  const n = $('earnN'), w = $('earnW'); if (!n || !w) return;
  const from = to - gain, t0 = performance.now(), d = Math.min(1100, 300 + gain * 6);
  const a = n.getBoundingClientRect(), b = w.getBoundingClientRect();
  for (let i = 0; i < Math.min(10, Math.ceil(gain / 4)); i++) setTimeout(() => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('class', 'over-coin'); el.innerHTML = '<use href="#i-simit"/>';
    el.style.left = `${a.left + a.width * 0.4}px`; el.style.top = `${a.top + a.height / 2}px`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `translate(${b.left + b.width * 0.7 - a.left - a.width * 0.4}px, ${b.top - a.top}px) rotate(180deg)`; el.style.opacity = '.3'; }));
    setTimeout(() => { el.remove(); bump(w); sfx.catch(2 + (i % 6)); }, 620);
  }, i * (d / 10));
  const step = now => {
    const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 2);
    n.firstChild.nodeValue = `+${fmt(Math.round(gain * e))} `;
    w.querySelector('b').textContent = fmt(Math.round(from + gain * Math.min(1, Math.max(0, (now - t0 - 600) / d))));
    if (k < 1 || now - t0 < d + 600) requestAnimationFrame(step); else w.querySelector('b').textContent = fmt(to);
  };
  if (gain > 0) requestAnimationFrame(step); else n.firstChild.nodeValue = '+0 ';
}
// ---------------- haftalık sıralama (board.js) ----------------
const tierName = (lim, total) => (lim < 1 ? tr('ilk %50') : `${tr('ilk')} ${fmt(lim)}`);
function renderBoard() {
  const w = week(), total = totalPlayers(w), mb = myBest(), me = mb > 0 ? rankOf(mb, w) : 0;
  const d = Math.floor(w.left / 864e5), h = Math.floor(w.left / 36e5) % 24;
  $('boardInfo').textContent = tr('{n} oyuncu · bitmesine {d}g {h}s').replace('{n}', fmt(total)).replace('{d}', d).replace('{h}', h);
  // ilk beş + oyuncunun üstündeki ve altındaki üçer kişi; oyuncu kendi sırasına girer, alttakiler bir aşağı kayar
  const ranks = [1, 2, 3, 4, 5];
  if (me) for (let r = Math.max(1, me - 3); r <= Math.min(total, me + 3); r++) if (!ranks.includes(r)) ranks.push(r);
  if (me && !ranks.includes(me)) ranks.push(me);
  ranks.sort((a, b) => a - b);
  const li = (r, img, name, score, cls = '') => `<li class="${cls}"><b>#${fmt(r)}</b><img src="${img}" alt=""><span>${name}</span><em>${fmt(score)}</em></li>`;
  const meCC = { tr: 'TR', de: 'DE', es: 'ES' }[window.I18N.lang] || 'GB';
  let html = '', prev = 0;
  for (const r of ranks) {
    if (r > prev + 1) html += '<li class="gap">⋮</li>';
    if (me && r === me) html += li(r, flag(meCC), tr('Sen'), mb, 'me');
    else { const b = bot(me && r > me ? r - 1 : r, w); html += li(r, flag(b.cc), b.name, b.score, r <= 3 ? 'top' : ''); }
    prev = r;
  }
  if (!me) html += `<li class="gap">⋮</li><li class="me"><b>—</b><img src="${flag(meCC)}" alt=""><span>${tr('Sen')}</span><em>${tr('Henüz uçmadın')}</em></li>`;
  const list = $('boardList'); list.innerHTML = html;
  const meEl = list.querySelector('.me'); if (meEl) setTimeout(() => meEl.scrollIntoView({ block: 'nearest' }), 0);
  // ödül: şu anki basamak ve bir üstüne kaç puan kaldığı
  const cur = tierOf(me || total, total), i = TIERS.findIndex(([l]) => l === cur.lim), up = i < 0 ? TIERS[TIERS.length - 1] : TIERS[i - 1];
  let t = tr('Hafta sonu ödülün: {r} simit').replace('{r}', fmt(cur.reward));
  if (up) {
    const lim = up[0] < 1 ? Math.floor(total * up[0]) : up[0], need = Math.max(1, scoreAt(lim, w) - mb + 1);
    t += `<small>${tr('{p} puan daha → {t}: {r} simit').replace('{p}', fmt(need)).replace('{t}', tierName(up[0], total)).replace('{r}', fmt(up[1]))}</small>`;
  }
  $('boardTier').innerHTML = t;
}
let leagueKey = '';
function offerLeague() { // geçen haftanın ödülü bekliyorsa ana menüde bir kez sorulur
  const p = pendingReward();
  if (!p || !$('dailyPanel').classList.contains('hidden')) return;
  leagueKey = p.key; leagueAuto = true;
  $('leagueNote').textContent = tr('Geçen haftayı {r}. sırada bitirdin!').replace('{r}', fmt(p.rank)) + ` (${tierName(p.lim, p.total)})`;
  $('leagueReward').textContent = `+${fmt(p.reward)}`;
  show('leaguePanel');
}
function claimLeague() {
  const p = pendingReward();
  if (p && p.key === leagueKey) { wallet += p.reward; store.set(KEY_WALLET, wallet); markPaid(p.key); sfx.gold(); vibrate([20, 30, 20]); $('titleWallet').textContent = fmt(wallet); }
  show('leaguePanel', false);
}

// ---------------- cüzdan ve kostümler ----------------
function bank() {
  const earned = Math.floor((simitCount + goldCount * 4) / WALLET_RATE), gain = earned - banked;
  if (gain > 0) { banked = earned; wallet += gain; store.set(KEY_WALLET, wallet); }
}
// ids: giyili olanlar; kostüm panelinde seçilen parça önizleme olarak üstüne giydirilir
function applyLook(ids = look.on) {
  for (const c of COSTUMES) if (outfit[c.id]) outfit[c.id].visible = ids.includes(c.id);
  paintGull(gull, COSTUMES.find(c => c.slot === 'body' && ids.includes(c.id))?.id || 'player');
}
const slotOf = id => COSTUMES.find(x => x.id === id).slot;
const withItem = (ids, c) => ids.filter(id => slotOf(id) !== c.slot).concat(c.id); // aynı yuvada (baş, göz, boyun...) tek parça
applyLook();
// günün fırsatı: her gün alınmamış kostümlerden biri %40 indirimli; o gün alınınca yenisi ertesi gün gelir
function dealToday() {
  const day = dayKey(), d = store.get(KEY_DEAL, {}) || {};
  if (d.day === day) return d.id;
  const left = COSTUMES.filter(c => !look.owned.includes(c.id));
  let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const id = left.length ? left[h % left.length].id : '';
  store.set(KEY_DEAL, { day, id });
  return id;
}
const priceOf = c => (c.id === dealToday() ? Math.round((c.price * 0.6) / 10) * 10 : c.price);
let dressing = false, showcase = 0, cosSel = null; // cosSel: panelde dokunulan (önizlenen) kostüm
function openWardrobe() {
  if (state !== 'title') return;
  dressing = true; cosSel = null; $('wardNote').textContent = tr('Dokun, martında dene; beğenirsen al.');
  for (const id of ['missionsPanel', 'achPanel', 'dailyPanel', 'upPanel', 'boardPanel', 'leaguePanel', 'settings']) show(id, false);
  renderWardrobe(); show('title', false); show('wardrobe');
}
function closeWardrobe() {
  dressing = false; show('wardrobe', false);
  if (cosSel) { cosSel = null; applyLook(); } // satın alınmayan önizleme çıkarılır
  if (state === 'title') { $('titleWallet').textContent = fmt(wallet); renderMenuBadges(); show('title'); }
}
function renderWardrobe() {
  $('walletN').textContent = fmt(wallet);
  const box = $('costumes'); box.textContent = '';
  for (const c of COSTUMES) {
    const own = look.owned.includes(c.id), on = look.on.includes(c.id);
    const b = document.createElement('button');
    const price = priceOf(c), deal = !own && price < c.price;
    b.className = 'cos' + (on ? ' on' : '') + (own ? ' own' : wallet < price ? ' poor' : '') + (cosSel === c.id ? ' sel' : '') + (deal ? ' deal' : '');
    b.dataset.id = c.id;
    b.innerHTML = `<span class="cos-i">${COSTUME_SVG[c.id]}</span><b></b><small></small>`;
    b.querySelector('b').textContent = tr(c.name);
    const tag = b.querySelector('small');
    if (own) tag.textContent = on ? tr('Giyili') : tr('Giy');
    else tag.innerHTML = `<svg class="ico"><use href="#i-simit"/></svg>${fmt(price)}` + (deal ? `<s>${fmt(c.price)}</s>` : '');
    if (deal) b.insertAdjacentHTML('beforeend', '<em class="cos-deal">-40%</em>');
    b.addEventListener('click', e => { e.stopPropagation(); pickCostume(c); });
    box.appendChild(b);
  }
  // alttaki düğme seçilene göre: satın al (fiyatlı) / giy / çıkar
  const act = $('cosAct'), c = COSTUMES.find(x => x.id === cosSel);
  show('cosAct', !!c);
  if (!c) return;
  const own = look.owned.includes(c.id);
  act.classList.toggle('poor', !own && wallet < priceOf(c));
  if (!own) act.innerHTML = `${tr('Satın al')} <svg class="ico"><use href="#i-simit"/></svg>${fmt(priceOf(c))}`;
  else act.textContent = look.on.includes(c.id) ? tr('Çıkar') : tr('Giy');
}
// dokununca yalnızca önizleme: martı o parçayla gösterilir, cüzdana dokunulmaz
function pickCostume(c) {
  cosSel = c.id;
  applyLook(look.on.includes(c.id) ? look.on : withItem(look.on, c));
  sfx.click(); flapBurst = 1;
  sparkle(gull.position, 12, 0xffe7a8, 3, 0.45, 0.25);
  const own = look.owned.includes(c.id);
  $('wardNote').textContent = own ? tr(c.name) : wallet < priceOf(c) ? `${tr('Yeterli simit yok')}: ${fmt(priceOf(c) - wallet)}` : `${tr(priceOf(c) < c.price ? 'Günün fırsatı' : 'Önizleme')}: ${tr(c.name)}`;
  renderWardrobe();
}
function costumeAction() {
  const c = COSTUMES.find(x => x.id === cosSel);
  if (!c) return;
  if (!look.owned.includes(c.id)) {
    const price = priceOf(c);
    if (wallet < price) { sfx.click(); bump($('cosAct'), 'shake'); $('wardNote').textContent = `${tr('Yeterli simit yok')}: ${fmt(price - wallet)}`; return; }
    wallet -= price; look.owned.push(c.id); store.set(KEY_WALLET, wallet); sfx.record(); vibrate([20, 30, 20]);
    look.on = withItem(look.on, c);
    sparkle(gull.position, 40, 0xffd35a, 6, 0.8, 0.35);
    $('wardNote').textContent = `${tr(c.name)} ✓`;
  } else if (look.on.includes(c.id)) {
    look.on = look.on.filter(id => id !== c.id); sfx.click();
  } else {
    look.on = withItem(look.on, c); sfx.power();
    sparkle(gull.position, 24, 0xffe7a8, 4, 0.6, 0.3);
  }
  store.set(KEY_LOOK, look); applyLook(); flapBurst = 1;
  renderWardrobe();
}
// ---------------- güçlendirme yükseltmeleri ----------------
function renderUps() {
  $('upWallet').textContent = fmt(wallet);
  const box = $('ups'); box.textContent = '';
  for (const k of Object.keys(ups)) {
    const lv = ups[k], max = lv >= UP_COST.length, cost = UP_COST[lv];
    const d = document.createElement('div');
    d.className = 'up'; d.style.setProperty('--c', POWER[k].color);
    d.innerHTML = `<span class="up-i">${ICON_SVG[k]}</span><div class="up-m"><b></b><small></small><i class="up-pips">${UP_COST.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</i></div><button class="up-buy"></button>`;
    d.querySelector('b').textContent = tr(POWER[k].name);
    d.querySelector('small').textContent = `${fmt(Math.round(dur(k)))} ${tr('sn')}` + (max ? '' : ` → ${fmt(Math.round(POWER[k].dur * (1 + (lv + 1) * 0.25)))} ${tr('sn')}`);
    const b = d.querySelector('.up-buy');
    if (max) { b.textContent = tr('Tam'); b.disabled = true; }
    else { b.innerHTML = `<svg class="ico"><use href="#i-simit"/></svg>${fmt(cost)}`; b.classList.toggle('poor', wallet < cost); }
    b.addEventListener('click', e => { e.stopPropagation(); buyUp(k, d); });
    box.appendChild(d);
  }
}
function buyUp(k, el) {
  const lv = ups[k], cost = UP_COST[lv];
  if (lv >= UP_COST.length) return;
  if (wallet < cost) { sfx.click(); bump(el, 'shake'); $('upNote').textContent = `${tr('Yeterli simit yok')}: ${fmt(cost - wallet)}`; return; }
  wallet -= cost; ups[k]++; store.set(KEY_WALLET, wallet); store.set(KEY_UP, ups);
  sfx.power(); vibrate([20, 30, 20]); $('upNote').textContent = tr('Güçlendirmeler daha uzun sürer.');
  renderUps(); $('titleWallet').textContent = fmt(wallet);
  bump($('ups').children[Object.keys(ups).indexOf(k)], 'bump');
}
// ---------------- görevler ----------------
// Aynı anda üç görev; biten görev hemen simit kazandırır, yerine bir sonraki uçuşta yenisi gelir.
// total: uçuşlar boyunca birikir (p), diğerleri tek uçuşta tutturulmalı.
const MISSIONS = [
  { k: 'simit', text: 'Bir uçuşta {n} simit kap', n: [20, 30, 45, 60], r: [10, 15, 20, 30] },
  { k: 'near', text: 'Bir uçuşta {n} kez kıl payı geç', n: [3, 5, 8], r: [10, 15, 20], cap: 25 },
  { k: 'gold', text: 'Bir uçuşta {n} altın simit kap', n: [2, 3], r: [15, 25], cap: 6 },
  { k: 'dist', text: 'Bir uçuşta {n} m uç', n: [300, 500, 800], r: [10, 15, 25] },
  { k: 'combo', text: '{n} simitlik seri yap', n: [8, 12, 16], r: [10, 15, 20], cap: 40 },
  { k: 'power', text: 'Bir uçuşta {n} güçlendirme topla', n: [2, 3], r: [10, 20], cap: 6 },
  { k: 'steal', text: 'Bir uçuşta yolcuların elinden {n} simit kap', n: [8, 15], r: [10, 20], cap: 40 },
  { k: 'score', text: 'Bir uçuşta {n} puan yap', n: [800, 1500, 3000], r: [10, 20, 30] },
  { k: 'turn', text: 'Bir uçuşta {n} kusursuz viraj al', n: [2, 3, 5], r: [10, 15, 20], cap: 10 },
  { k: 'dolphin', text: 'Bir uçuşta {n} yunusun üstünden geç', n: [3, 6], r: [10, 20], cap: 12 },
  { k: 'stop', text: 'Bir uçuşta {n} iskeleye var', n: [1, 2, 3], r: [10, 20, 35], cap: 5 },
  { k: 'bridge', text: 'Bir uçuşta {n} kez köprü altından geç', n: [1, 2], r: [15, 30], cap: 4 },
  { k: 'feed', text: 'Bir uçuşta ikramcılardan {n} simit al', n: [2, 4], r: [10, 20], cap: 8 },
  { k: 'piece', text: 'Bir uçuşta atılan {n} simit parçası yakala', n: [8, 16], r: [10, 20], cap: 40 },
  { k: 'runs', text: '{n} kez uç', n: [3, 5], r: [5, 10], total: true, cap: 15 },
  { k: 'simitTotal', text: 'Toplam {n} simit topla', n: [100, 200], r: [15, 25], total: true },
];
const misDef = k => MISSIONS.find(d => d.k === k);
let missions = (store.get(KEY_MIS, []) || []).filter(m => m && misDef(m.k) && m.n > 0 && m.r > 0).slice(0, 3);
function runVal(k) {
  return { simit: Math.floor(simitCount), gold: Math.floor(goldCount), dist: Math.floor(dist), combo: bestCombo, score: total(), near: run.near, stop: stopI - 1, power: run.power, steal: run.steal, bridge: run.bridge, feed: run.feed, piece: run.piece, turn: run.turn, dolphin: run.dolphin }[k] || 0;
}
const misProgress = m => Math.floor(misDef(m.k).total ? m.p || 0 : runVal(m.k));
const misText = m => tr(misDef(m.k).text).replace('{n}', fmt(m.n));
// görev setleri: üç görev birlikte gelir, üçü de bitince sıradaki set gelir. Her set bir öncekinden zor (hedef %15, ödül %10 artar;
// cap: bir uçuşta yapılabilecek sınır). Günde en fazla MIS_SETS set; yeni gün takılı kalan seti de yeniler.
const KEY_MISLV = 'simit-martisi-mislv', MIS_SETS = 3;
const misLv = Object.assign({ lv: 0, day: '', sets: 0 }, store.get(KEY_MISLV, {}) || {});
const niceN = v => (v < 20 ? Math.round(v) : v < 200 ? Math.round(v / 5) * 5 : Math.round(v / 50) * 50);
function newMission(d, lv) {
  const i = (Math.random() * d.n.length) | 0;
  return { k: d.k, n: Math.min(d.cap || Infinity, niceN(d.n[i] * Math.min(3, 1 + lv * 0.15))), r: Math.round(d.r[i] * Math.min(2, 1 + lv * 0.1)), p: 0, done: false };
}
const misAllDone = () => missions.length > 0 && missions.every(m => m.done);
function refillMissions() {
  const today = dayKey();
  if (misLv.day !== today) { misLv.day = today; misLv.sets = 0; if (!misAllDone()) missions = []; }
  if (misAllDone() && misLv.sets < MIS_SETS) { misLv.lv++; missions = []; }
  if (!missions.length) misLv.sets++;
  while (missions.length < 3) {
    const d = pick(MISSIONS.filter(x => (TURNS_ON || x.k !== 'turn') && !missions.some(m => m.k === x.k)));
    missions.push(newMission(d, misLv.lv));
  }
  store.set(KEY_MIS, missions); store.set(KEY_MISLV, misLv);
}
function misNote() {
  if (misAllDone() && misLv.sets >= MIS_SETS) return tr('Bugünlük görevler bitti. Yenileri yarın!');
  return `${tr('Set')} ${misLv.lv + 1} · ${tr('Üçünü bitir, sıradaki set gelsin (biraz daha zor, biraz daha çok simit).')}`;
}
function countMission(k, n = 1) { for (const m of missions) if (!m.done && m.k === k) m.p = (m.p || 0) + n; }
function checkMissions() {
  for (const m of missions) {
    if (m.done || misProgress(m) < m.n) continue;
    m.done = true; wallet += m.r; store.set(KEY_WALLET, wallet); store.set(KEY_MIS, missions);
    if (state === 'play') {
      sfx.gold(); vibrate([20, 30, 20]);
    }
  }
}
// fill: oyun sonunda çubuklar uçuştan önceki yerden (m.p0) dolar; bu uçuşta biten görev parlar ve simiti sayılır
function renderMissions(box, fill = false) {
  box.textContent = '';
  if ($('misNote')) $('misNote').textContent = misNote();
  missions.forEach((m, i) => {
    const v = Math.min(m.n, misProgress(m)), v0 = fill ? Math.min(v, m.p0 || 0) : v, now = fill && m.done && !m.wasDone;
    const d = document.createElement('div');
    d.className = 'mis' + (m.done && !now ? ' done' : '');
    d.innerHTML = `<span class="mis-t"></span><span class="mis-r">+${m.r}<svg class="ico"><use href="#i-simit"/></svg></span><i class="mis-bar"><b style="width:${(v0 / m.n) * 100}%"></b></i>`;
    d.querySelector('.mis-t').textContent = m.done || !v ? misText(m) : `${misText(m)} · ${fmt(v)}/${fmt(m.n)}`;
    box.appendChild(d);
    if (fill && v > v0) setTimeout(() => {
      d.querySelector('.mis-bar b').style.width = `${(v / m.n) * 100}%`;
      if (now) setTimeout(() => { d.classList.add('done', 'just'); sfx.gold(); vibrate(15); }, 850);
    }, 900 + i * 350);
  });
}
// menüdeki rozetler: biten görev sayısı, alınmamış günlük ödül
function renderMenuBadges() {
  const fresh = missions.filter(m => !m.done && !m.seen).length; // yeni gelen, henüz bakılmamış görevler
  $('misBadge').textContent = fresh; show('misBadge', fresh > 0);
  show('dailyDot', dailyState().ready);
  const ar = achReady() + badgesNew(); $('achBadge').textContent = ar; show('achBadge', ar > 0); // alınmamış başarım + bakılmamış rozet
}
// ---------------- başarımlar ----------------
// Kalıcı; her biri üç kademe (bronz, gümüş, altın). Sayaçlar her uçuşun sonunda (showOver) toplanır,
// rekor ve en uzak iskele eski kayıtlardan gelir: önceden oynayan sıfırdan başlamaz. Ödül panelden alınır, uçuşta bildirim yok.
const ACH = [
  { id: 'simit', name: 'Simit avcısı', text: 'Toplam {n} simit kap', n: [100, 1000, 5000] },
  { id: 'gold', name: 'Altın göz', text: 'Toplam {n} altın simit kap', n: [10, 50, 200] },
  { id: 'maxDist', name: 'Boğaz yolcusu', text: 'Bir uçuşta {n} m uç', n: [1000, 3000, 6800] },
  { id: 'maxScore', name: 'Rekortmen', text: 'Bir uçuşta {n} puan yap', n: [2000, 6000, 15000] },
  { id: 'maxCombo', name: 'Seri ustası', text: '{n} simitlik seri yap', n: [15, 30, 50] },
  { id: 'steal', name: 'Hınzır martı', text: 'Yolcuların elinden toplam {n} simit kap', n: [50, 300, 1000] },
  { id: 'near', name: 'Kıl payı', text: 'Toplam {n} kez kıl payı geç', n: [30, 150, 500] },
  { id: 'turn', name: 'Viraj ustası', text: 'Toplam {n} kusursuz viraj al', n: [10, 50, 200] },
  { id: 'dolphin', name: 'Yunus dostu', text: 'Toplam {n} yunusun üstünden geç', n: [10, 60, 200] },
  { id: 'bridge', name: 'Köprü altı', text: 'Toplam {n} kez köprü altından geç', n: [3, 15, 50] },
  { id: 'runs', name: 'Sadık martı', text: '{n} kez uç', n: [10, 50, 200] },
  { id: 'owned', name: 'Moda martı', text: '{n} kostüm al', n: [3, 8, 17] },
];
const ACH_R = [25, 75, 200];
const ach = Object.assign({ st: {}, got: {} }, store.get(KEY_ACH, {}));
let achRun = {}; // bu uçuşta istatistiğe eklenmiş olan (ikinci şansta iki kez sayılmasın)
function achVal(id) {
  const s = ach.st;
  if (id === 'maxScore') return Math.max(s.maxScore || 0, best);
  if (id === 'maxDist') return Math.max(s.maxDist || 0, STOPS[farStop].m);
  if (id === 'owned') return look.owned.length;
  return s[id] || 0;
}
const achTier = id => ACH.find(a => a.id === id).n.filter(n => achVal(id) >= n).length;
const achReady = () => ACH.reduce((k, a) => k + Math.max(0, achTier(a.id) - (ach.got[a.id] || 0)), 0);
function achRecord() { // uçuş sonu: farkı ekle, en iyileri güncelle
  const now = { simit: Math.floor(simitCount), gold: Math.floor(goldCount), steal: run.steal, near: run.near, turn: run.turn, dolphin: run.dolphin, bridge: run.bridge, runs: 1, distTot: Math.floor(dist), fish: fishRun };
  for (const k in now) { ach.st[k] = (ach.st[k] || 0) + now[k] - (achRun[k] || 0); achRun[k] = now[k]; }
  ach.st.maxScore = Math.max(ach.st.maxScore || 0, total());
  ach.st.maxDist = Math.max(ach.st.maxDist || 0, Math.floor(dist));
  ach.st.maxCombo = Math.max(ach.st.maxCombo || 0, bestCombo);
  if (weather !== 'clear') ach.st['wx_' + weather] = Math.max(ach.st['wx_' + weather] || 0, Math.floor(dist)); // rozet: o havada en uzun uçuş
  store.set(KEY_ACH, ach);
}
function renderAch() {
  $('achWallet').textContent = fmt(wallet);
  const box = $('achList'); box.textContent = '';
  for (const a of ACH) {
    const tier = achTier(a.id), got = ach.got[a.id] || 0, v = achVal(a.id), next = a.n[Math.min(got, 2)];
    const d = document.createElement('div');
    d.className = 'ach'; d.dataset.t = got;
    const goal = tier > got ? a.n[got] : a.n[Math.min(tier, 2)];
    d.innerHTML = `<span class="ach-i"><svg><use href="#i-medal"/></svg></span><div class="ach-m"><b></b><small></small><span class="ach-bar"><i style="width:${Math.min(1, v / goal) * 100}%"></i></span></div>`;
    d.querySelector('b').textContent = tr(a.name);
    d.querySelector('small').textContent = `${tr(a.text).replace('{n}', fmt(goal))} · ${fmt(Math.min(v, goal))}/${fmt(goal)}`;
    if (tier > got) {
      const b = document.createElement('button'); b.className = 'ach-get';
      b.innerHTML = `+${fmt(ACH_R[got])}<svg class="ico"><use href="#i-simit"/></svg>`;
      b.addEventListener('click', e => { e.stopPropagation(); claimAch(a.id); });
      d.appendChild(b);
    } else d.insertAdjacentHTML('beforeend', `<span class="ach-stars">${[0, 1, 2].map(i => `<i class="${i < got ? 'on' : ''}">★</i>`).join('')}</span>`);
    void next; box.appendChild(d);
  }
}
function claimAch(id) {
  const got = ach.got[id] || 0;
  if (achTier(id) <= got) return;
  wallet += ACH_R[got]; ach.got[id] = got + 1;
  store.set(KEY_WALLET, wallet); store.set(KEY_ACH, ach);
  sfx.record(); vibrate([20, 30, 20]);
  renderAch(); renderMenuBadges(); $('titleWallet').textContent = fmt(wallet);
  const row = $('achList').children[ACH.findIndex(a => a.id === id)]; if (row) bump(row, 'got');
}
function openAch() { if (state !== 'title') return; renderAch(); achTab('ach'); show('achPanel'); }

// ---------------- günlük ödül ----------------
// Her gün bir kez; üst üste gelinen günler ödülü büyütür, bir gün kaçarsa seri baştan başlar.
const DAILY = [10, 15, 20, 30, 40, 50, 80];
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function dailyState() {
  const s = store.get(KEY_DAILY, {}) || {}, today = dayKey(), y = new Date(); y.setDate(y.getDate() - 1);
  if (s.last === today) return { ready: false, streak: s.streak || 1 };
  const streak = s.last === dayKey(y) ? (s.streak || 0) % DAILY.length + 1 : 1;
  return { ready: true, streak };
}
function openDaily() {
  if (state !== 'title') return;
  const d = dailyState(), box = $('days'); box.textContent = '';
  DAILY.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'day' + (i + 1 < d.streak || (!d.ready && i + 1 === d.streak) ? ' got' : '') + (d.ready && i + 1 === d.streak ? ' now' : '');
    el.innerHTML = `<span></span><b>${fmt(r)}<svg class="ico"><use href="#i-simit"/></svg></b>` + (i === DAILY.length - 1 ? '<b class="day-fish">+1<svg class="ico"><use href="#i-fish"/></svg></b>' : '');
    el.querySelector('span').textContent = `${tr('Gün')} ${i + 1}`;
    box.appendChild(el);
  });
  $('dailyNote').textContent = tr(d.ready ? 'Her gün uğra, ödül büyüsün. Bir gün kaçırırsan baştan başlar.' : 'Bugünün ödülünü aldın. Yarın yine gel!');
  $('claimBtn').textContent = tr(d.ready ? 'Al' : 'Tamam');
  show('dailyPanel');
}
function claimDaily() {
  const d = dailyState();
  if (d.ready) {
    const r = DAILY[d.streak - 1];
    wallet += r; store.set(KEY_WALLET, wallet); store.set(KEY_DAILY, { last: dayKey(), streak: d.streak });
    if (d.streak === DAILY.length) { setFish(fish + 1); $('titleFish').textContent = fmt(fish); } // haftanın son günü bir balık
    $('titleWallet').textContent = fmt(wallet); bump($('titleWallet').parentNode);
    sfx.gold(); vibrate([20, 30, 20]); renderMenuBadges();
  }
  show('dailyPanel', false);
}

// ---------------- rozet koleksiyonu ----------------
// Ödülsüz, uzun soluklu koleksiyon: toplam yol, art arda giriş günü, uçuş, balık, simit, biten şehirler, zor havalar.
// Kazanılan rozet, Rozetler sekmesine bakılana dek menüde sayılır ve ızgarada parlar.
const KEY_VISIT = 'simit-martisi-visit';
const visit = Object.assign({ last: '', streak: 0, best: 0, days: 0 }, store.get(KEY_VISIT, {}) || {});
{ // bugünün girişi: dün de girildiyse seri uzar, yoksa 1'den başlar
  const today = dayKey(), y = new Date(); y.setDate(y.getDate() - 1);
  if (visit.last !== today) { visit.streak = visit.last === dayKey(y) ? visit.streak + 1 : 1; visit.days++; visit.best = Math.max(visit.best, visit.streak); visit.last = today; store.set(KEY_VISIT, visit); }
}
const kLab = n => (n >= 1000 ? `${n / 1000}k` : `${n}`);
const fam = (f, icon, list, text, v, lab = kLab) => list.map(([n, name]) => ({ id: f + n, fam: f, icon, n, name, text, v, lab: lab(n) }));
const BADGES = [
  ...fam('km', 'i-pin', [[1, 'Kanat açtı'], [10, 'Uzun yol'], [100, 'Boğaz aşığı'], [1000, 'Kıtalar arası'], [10000, 'Efsane kanat']], 'Toplam {n} km uç', () => (ach.st.distTot || 0) / 1000, n => `${kLab(n)} km`),
  ...fam('day', 'i-gift', [[3, 'Üç gün'], [7, 'Bir hafta'], [30, 'Bir ay'], [80, 'Vazgeçmez'], [365, 'Bir yıl']], '{n} gün art arda gir', () => visit.best, n => `${n} ${tr('gün')}`),
  ...fam('run', 'i-play', [[100, 'Yüz uçuş'], [1000, 'Bin uçuş']], '{n} kez uç', () => ach.st.runs || 0),
  ...fam('fish', 'i-fish', [[10, 'Balıkçı'], [100, 'Balık reisi']], 'Toplam {n} balık yakala', () => ach.st.fish || 0),
  ...fam('sim', 'i-simit', [[10000, 'Simit sevdalısı'], [100000, 'Simit sarayı']], 'Toplam {n} simit kap', () => ach.st.simit || 0),
  ...CITIES.filter(c => !c.soon).map(c => ({ id: 'city-' + c.id, fam: 'city', icon: 'i-trophy', n: 1, name: c.name, text: c.end, lab: c.name, v: () => (routeOf(c) === c.stops.length - 1 ? 1 : 0) })),
  ...[['rain', 'i-drop', 'Yağmur kuşu', 'Yağmurda bir uçuşta {n} m uç'], ['snow', 'i-snow', 'Kar tanesi', 'Karda bir uçuşta {n} m uç'], ['fog', 'i-fog', 'Sis kaptanı', 'Siste bir uçuşta {n} m uç']]
    .map(([w, icon, name, text]) => ({ id: 'wx-' + w, fam: 'wx', icon, n: 500, name, text, lab: '500 m', v: () => ach.st['wx_' + w] || 0 })),
];
ach.bseen ||= [];
const badgeOn = b => b.v() >= b.n;
const badgesGot = () => BADGES.filter(badgeOn).length;
const badgesNew = () => BADGES.filter(b => badgeOn(b) && !ach.bseen.includes(b.id)).length;
function renderBadges() {
  const box = $('badgeGrid'); box.textContent = '';
  for (const b of BADGES) {
    const on = badgeOn(b), el = document.createElement('button');
    el.className = `bdg f-${b.fam}` + (on ? ' on' : '') + (on && !ach.bseen.includes(b.id) ? ' new' : '');
    el.innerHTML = `<span class="bdg-c"><svg><use href="#${b.icon}"/></svg></span><em></em>`;
    el.querySelector('em').textContent = b.lab;
    el.addEventListener('click', () => { box.querySelectorAll('.sel').forEach(n => n.classList.remove('sel')); el.classList.add('sel'); badgeInfo(b); sfx.click(); });
    box.appendChild(el);
  }
  $('badgeCount').textContent = `${badgesGot()} / ${BADGES.length} ${tr('rozet')}`;
  badgeInfo(null);
}
function badgeInfo(b) {
  const el = $('badgeInfo');
  if (!b) { el.textContent = tr('Bir rozete dokun, nasıl kazanılır gör.'); return; }
  const v = b.v(), on = v >= b.n, cur = b.fam === 'km' ? (Math.floor(Math.min(v, b.n) * 10) / 10).toLocaleString(window.I18N.lang) : fmt(Math.floor(Math.min(v, b.n)));
  el.innerHTML = '<b></b><small></small>';
  el.querySelector('b').textContent = tr(b.name);
  el.querySelector('small').textContent = tr(b.text).replace('{n}', fmt(b.n)) + ' · ' + (on ? tr('Kazanıldı!') : `${cur}/${fmt(b.n)}`);
}
function achTab(t) {
  const bd = t === 'bdg';
  $('tabAch').classList.toggle('on', !bd); $('tabBdg').classList.toggle('on', bd);
  show('achList', !bd); show('achFine', !bd); show('bdgBox', bd);
  if (bd) { renderBadges(); ach.bseen = BADGES.filter(badgeOn).map(b => b.id); store.set(KEY_ACH, ach); renderMenuBadges(); }
  const nb = badgesNew(); $('bdgBadge').textContent = nb; show('bdgBadge', nb > 0);
}
function rewardReady() { return !window.PF || !window.PF.canReward || window.PF.canReward(); }
function renderFishBtn() {
  const cost = fishCost(), b = $('fishBtn');
  show('fishBtn', fish > 0 || fishRev > 0); // hiç balığı olmayana boş düğme gösterilmez
  b.classList.toggle('poor', fish < cost);
  $('fishCost').textContent = fmt(cost);
}
function fishRevive() {
  if (state !== 'over' || overLock > 0) return;
  const cost = fishCost();
  if (fish < cost) { bump($('fishBtn'), 'shake'); $('reviveNote').textContent = `${tr('Balık yetmiyor')}: ${fmt(fish)}/${fmt(cost)}`; show('reviveNote'); return; }
  setFish(fish - cost); fishRev++;
  revive();
}
function askRevive() {
  if (state !== 'over' || adRevived || overLock > 0) return;
  $('reviveBtn').disabled = true;
  const done = ok => {
    if (state !== 'over') return;
    if (ok) { adRevived = true; revive(); return; }
    show('reviveBtn', false); $('reviveNote').textContent = tr('Reklam şu an yok, sonra tekrar dene'); show('reviveNote');
  };
  if (window.PF && window.PF.rewarded) window.PF.rewarded(done); else done(true);
}
// çarptığı yerden kalkanla devam: dünya aynı kalır, 3-2-1 sayımıyla başlar
function revive() {
  revives++;
  gull.position.y = FLY_Y; gull.rotation.set(0, 0, 0); gull.visible = true;
  tx = gull.position.x; vx = 0; crashT = 0; vy = 0; splashed = false; hitStop = 0; timeScale = 1; trauma = 0;
  combo = 0; comboT = 0;
  pw.shield = dur('shield'); invuln = 2.2; // çarptığı bacanın içinden çıkarken kalkan harcanmasın
  show('over', false); show('hud'); hideTutorial();
  shownScore = shownSimit = shownDist = -1; shownMult = 0;
  ui.combo.classList.remove('on'); renderPowers(); updateHud();
  sfx.power(); audio.music(true); audio.duck(false);
  state = 'countdown'; countdown = 3; cdShown = 0; show('countdown');
}
function confetti() {
  const box = $('confetti'); box.textContent = '';
  const cols = ['#ffc23a', '#e5484d', '#2bb3a3', '#fff4e2', '#3aa7ff', '#f08a3a'];
  for (let i = 0; i < 46; i++) {
    const c = document.createElement('i');
    c.style.cssText = `left:${rand(5, 95)}%;background:${pick(cols)};animation-delay:${rand(0, 0.35)}s;animation-duration:${rand(1.4, 2.4)}s;--dx:${rand(-80, 80)}px;--r:${rand(-720, 720)}deg`;
    box.appendChild(c);
  }
  setTimeout(() => (box.textContent = ''), 3000);
}
function updateHud() {
  const s = total();
  if (s !== shownScore) { ui.score.textContent = fmt(s); shownScore = s; }
  if (Math.floor(simitCount) !== shownSimit) { shownSimit = Math.floor(simitCount); ui.simits.textContent = fmt(shownSimit); }
  if (fish !== shownFish) { if (shownFish >= 0 && fish > shownFish) bump($('hudFish')); shownFish = fish; $('fishN').textContent = fmt(fish); show('hudFish', fish > 0 || fishRun > 0); }
  const dm = Math.floor(dist);
  if (dm !== shownDist) { ui.dist.textContent = fmt(dm); shownDist = dm; }
  // hat çubuğu: sıradaki iskele, kalan metre, aradaki yolun ne kadarı uçuldu
  if (stopI !== shownStop) {
    shownStop = stopI; shownLeft = -1; show('route', stopI < STOPS.length);
    if (stopI < STOPS.length) $('routeTo').textContent = STOPS[stopI].name;
  }
  if (stopI < STOPS.length) {
    const a = stopM[stopI - 1], b = stopM[stopI], left = Math.max(0, Math.ceil(b - dist));
    if (left !== shownLeft) { shownLeft = left; $('routeLeft').textContent = fmt(left); $('routeFill').style.transform = `scaleX(${clamp((dist - a) / (b - a), 0, 1)})`; }
  }
}
// çarpan yavaş dolar: x2 için 3, x3 için 12, x4 için 27, x5 için 48 simitlik seri
const mult = () => Math.min(5, 1 + Math.floor(Math.sqrt(combo / 3)));
function renderPowers() {
  ui.powers.textContent = '';
  for (const k of Object.keys(pw)) {
    if (pw[k] <= 0) continue;
    const d = document.createElement('div');
    d.className = 'pw'; d.dataset.k = k; d.style.setProperty('--c', POWER[k].color);
    d.innerHTML = `<span class="ico">${ICON_SVG[k]}</span><span class="bar"><i></i></span>`;
    ui.powers.appendChild(d);
  }
}
function tickPowers() {
  for (const el of ui.powers.children) {
    const k = el.dataset.k, f = pw[k] / dur(k);
    el.querySelector('i').style.transform = `scaleX(${clamp(f, 0, 1)})`;
    el.classList.toggle('ending', pw[k] < 2);
  }
}

// ---------------- öğretici (yalnızca ilk açılışta) ----------------
let tutT = 0, tutMoves = 0, tutLastSide = 0;
function startTutorial() { tutT = 3.6; tutMoves = 0; tutLastSide = 0; show('tutorial'); }
function hideTutorial() {
  if ($('tutorial').classList.contains('hidden')) return;
  show('tutorial', false);
  if (tutorialPending) { tutorialPending = false; store.set(KEY_TUT, true); }
}

// ---------------- duraklatma ----------------
function pause() {
  if (state !== 'play' && state !== 'countdown') return;
  state = 'paused'; show('pause'); show('countdown', false);
  audio.suspend();
}
function resume() {
  if (state !== 'paused') return;
  show('pause', false); audio.resume();
  state = 'countdown'; countdown = 3; cdShown = 0;
  show('countdown');
}
let cdShown = 0, shownSign = 0;

// ---------------- girdi: tek parmak, ekranın X konumu = martının hedefi ----------------
function steerFromX(clientX) {
  // ekranın ortadaki %80'i tüm şeridi kapsar → başparmağın kenara uzanması gerekmez
  // kenara doğru biraz daha yaslanmak virajda savrulmayı yener
  tx = clamp((clientX / innerWidth - 0.5) / 0.4, -1, 1) * EDGE;
  if (tutT > 0) {
    const side = Math.sign(tx) * (Math.abs(tx) > 2 ? 1 : 0);
    if (side && side !== tutLastSide) { tutMoves++; tutLastSide = side; }
  }
}
const menuModal = () => !$('achPanel').classList.contains('hidden') || !$('upPanel').classList.contains('hidden') || !$('missionsPanel').classList.contains('hidden') || !$('dailyPanel').classList.contains('hidden') || !$('settings').classList.contains('hidden') || !$('boardPanel').classList.contains('hidden') || !$('leaguePanel').classList.contains('hidden');
const isUi = e => e.target.closest && e.target.closest('button, .card, .no-steer');
addEventListener('pointerdown', e => {
  audio.unlock();
  if (state === 'play' && !isUi(e)) steerFromX(e.clientX);
});
addEventListener('pointermove', e => {
  if (state === 'play' && (e.pointerType === 'mouse' || e.buttons || e.pressure > 0)) steerFromX(e.clientX);
});
$('title').addEventListener('pointerup', e => { if (state === 'title' && !isUi(e)) startGame(); });
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (dressing) { if (e.code === 'Escape') closeWardrobe(); return; }
  if (e.code === 'KeyM') { settings.sfx = settings.music = !(settings.sfx || settings.music); saveSettings(); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { if (state === 'play' || state === 'countdown') pause(); else if (state === 'paused') resume(); }
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
    if ((state === 'title' && !menuModal()) || (state === 'over' && overLock <= 0)) { e.preventDefault(); startGame(); }
    else if (state === 'paused') { e.preventDefault(); resume(); }
  }
});
addEventListener('keyup', e => (keys[e.code] = false));
const onBtn = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); sfx.click(); fn(e); });
onBtn('againBtn', () => { if (overLock <= 0) startGame(); });
onBtn('homeBtn', () => showTitle());
onBtn('reviveBtn', () => askRevive());
onBtn('fishBtn', () => fishRevive());
onBtn('wardrobeBtn', () => openWardrobe());
onBtn('playBtn', () => { if (state === 'title') startGame(); });
onBtn('cityPrev', () => stepCity(-1));
onBtn('cityNext', () => stepCity(1));
onBtn('missionsBtn', () => { renderMissions($('titleMis')); show('missionsPanel'); for (const m of missions) m.seen = true; store.set(KEY_MIS, missions); renderMenuBadges(); });
onBtn('closeMissions', () => show('missionsPanel', false));
onBtn('achBtn', () => openAch());
onBtn('closeAch', () => show('achPanel', false));
onBtn('tabAch', () => achTab('ach'));
onBtn('tabBdg', () => achTab('bdg'));
onBtn('upsBtn', () => { $('upNote').textContent = tr('Simitle güçlendirmeleri yükselt: her seviye süreyi uzatır.'); renderUps(); show('upPanel'); });
onBtn('closeUps', () => { show('upPanel', false); $('titleWallet').textContent = fmt(wallet); });
onBtn('dailyBtn', () => openDaily());
onBtn('boardBtn', () => { renderBoard(); show('boardPanel'); });
onBtn('closeBoard', () => show('boardPanel', false));
onBtn('leagueClaim', () => claimLeague());
onBtn('claimBtn', () => claimDaily());
onBtn('closeWardrobe', () => closeWardrobe());
onBtn('cosAct', () => costumeAction());
onBtn('pauseBtn', () => pause());
onBtn('resumeBtn', () => resume());
onBtn('quitBtn', () => { audio.resume(); showTitle(); });
onBtn('settingsBtn', () => { show('settings'); syncToggles(); });
onBtn('closeSettings', () => show('settings', false));
onBtn('soundBtn', () => { settings.sfx = settings.music = !(settings.sfx || settings.music); saveSettings(); });
// paylaşım kartı: o anki sahnenin karesi üstüne puan, simit, metre ve şehir (1080x1080). Telefonda görsel olarak paylaşılır.
function scoreCard() {
  renderer.render(scene, camera); // çizim tamponu korunmuyor: aynı görevde çizip hemen kopyala
  const S = 1080, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), src = renderer.domElement, k = Math.max(S / src.width, S / src.height);
  g.drawImage(src, (S - src.width * k) / 2, (S - src.height * k) / 2, src.width * k, src.height * k);
  const sh = g.createLinearGradient(0, 0, 0, S); sh.addColorStop(0, 'rgba(27,24,56,.55)'); sh.addColorStop(0.45, 'rgba(27,24,56,.15)'); sh.addColorStop(1, 'rgba(27,24,56,.85)');
  g.fillStyle = sh; g.fillRect(0, 0, S, S);
  const txt = (s, x, y, size, col, w = 800) => { g.font = `${w} ${size}px "Baloo 2", Arial, sans-serif`; g.fillStyle = 'rgba(27,24,56,.55)'; g.fillText(s, x, y + size * 0.07); g.fillStyle = col; g.fillText(s, x, y); };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  txt(tr('Simit'), S / 2, 120, 104, '#fff4e2'); txt(tr('Martısı'), S / 2, 220, 104, '#f0a04b');
  txt(fmt(total()), S / 2, 640, 230, '#fff4e2');
  txt(`${fmt(Math.floor(simitCount))} ${tr('simit')}  ·  ${fmt(Math.floor(dist))} m  ·  ${city.name}`, S / 2, 790, 50, '#f6dcc0', 700);
  g.fillStyle = '#ffc23a'; const bw = 760, bh = 108; g.beginPath(); g.roundRect((S - bw) / 2, 880, bw, bh, 54); g.fill();
  g.font = '800 52px "Baloo 2", Arial, sans-serif'; g.fillStyle = '#1b1838'; g.fillText(tr(shareWon ? 'Rövanş?' : 'Beni geçebilir misin?'), S / 2, 936);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
// paylaşılan link meydan okumadır: açan kişi bu puanı ve metreyi hedef olarak görür
let shareLbl = '', shareWon = false;
onBtn('shareBtn', async () => {
  const text = tr(shareWon ? 'Simit Martısı\'nda seni {s} puanla geçtim! Rövanş?' : 'Simit Martısı\'nda {s} puan yaptım, {n} simit kaptım! Sen kaç yaparsın?').replace('{s}', fmt(total())).replace('{n}', fmt(Math.floor(simitCount)));
  const url = location.href.split('#')[0].split('?')[0] + `#c=${total()}-${Math.floor(dist)}-${city.id}`;
  try {
    let files = null;
    if (navigator.share && navigator.canShare) { const b = await scoreCard(); const f = b && new File([b], 'simit-martisi.png', { type: 'image/png' }); if (f && navigator.canShare({ files: [f] })) files = [f]; }
    if (files) await navigator.share({ files, text: `${text} ${url}` }); // görselle paylaşınca bazı uygulamalar url alanını atar: metnin içinde gider
    else if (navigator.share) await navigator.share({ title: document.title, text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); $('shareBtn').textContent = tr('Kopyalandı'); setTimeout(() => ($('shareBtn').textContent = shareLbl || tr('Paylaş')), 1800); }
  } catch (e) {}
});
for (const el of document.querySelectorAll('[data-toggle]')) {
  el.addEventListener('click', e => { e.stopPropagation(); const k = el.dataset.toggle; settings[k] = !settings[k]; saveSettings(); sfx.click(); if (k === 'vibe') vibrate(30); });
}
for (const el of document.querySelectorAll('[data-vol]')) {
  const k = el.dataset.vol;
  el.addEventListener('click', e => e.stopPropagation());
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('input', () => { settings[k + 'Vol'] = el.value / 100; settings[k] = el.value > 0; saveSettings(); });
  el.addEventListener('change', () => { if (k === 'sfx') sfx.catch(1); }); // bırakınca örnek ses
}
for (const el of document.querySelectorAll('[data-lang]')) {
  el.addEventListener('click', e => { e.stopPropagation(); if (el.dataset.lang === window.I18N.lang) return; settings.lang = el.dataset.lang; store.set(KEY_SET, settings); sfx.click(); location.reload(); });
}
function saveSettings() {
  for (const k of ['sfx', 'music']) if (settings[k] && !(settings[k + 'Vol'] > 0)) settings[k + 'Vol'] = 0.8; // sessizden açınca kaydırıcı sıfırda kalmasın
  store.set(KEY_SET, settings); audio.set(soundOpts()); syncToggles();
}
function syncToggles() {
  for (const el of document.querySelectorAll('[data-toggle]')) el.setAttribute('aria-pressed', settings[el.dataset.toggle] ? 'true' : 'false');
  $('soundUse').setAttribute('href', settings.sfx || settings.music ? '#i-sound' : '#i-mute');
  for (const el of document.querySelectorAll('[data-vol]')) el.value = settings[el.dataset.vol] ? Math.round(settings[el.dataset.vol + 'Vol'] * 100) : 0;
  for (const el of document.querySelectorAll('[data-lang]')) el.setAttribute('aria-pressed', el.dataset.lang === window.I18N.lang ? 'true' : 'false');
}
syncToggles();
// sekme arka plana geçince otomatik duraklat
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); audio.suspend(); } else if (state !== 'paused') audio.resume(); });
addEventListener('pagehide', () => pause());

// ---------------- kalite: zayıf cihazda kendini kısar ----------------
const DPR = Math.min(2, devicePixelRatio || 1);
// Ölçüm yalnızca uçuşta ve kalkıştan 4 sn sonra: yükleme ve ilk gölgelendirici derlemesi telefonu yavaş sanmasın.
// Kalite düşerse, uzun süre akıcı kalınca geri çıkar; geri çıktıktan sonra yine düşerse orada kilitlenir.
// Uçuşta yalnızca çözünürlük değişir. Gölgeyi açıp kapamak bütün shader'ları yeniden derletir (telefonda saniyelerce donma):
// o yüzden gölge kararı bekletilir, menüye ya da oyun sonuna dönünce uygulanır.
// Telefon orta kaliteden başlar, çözünürlük basamakları daha dar: en düşükte de bulanıklaşmasın.
const PR = MOBILE ? [1.3, 1.5, 1.75] : [1.15, 1.5, 2];
let shadowWant = true;
let quality = 2, qFrames = 0, qTime = 0, fpsSmooth = 60, qWarm = 4, qGood = 0, qMax = 2;
// ?q=0|1|2 kaliteyi sabitler (otomatik ayar kapanır) — ölçüm ve test için
const qLock = /^[012]$/.test(new URLSearchParams(location.search).get('q') || '') ? +new URLSearchParams(location.search).get('q') : -1;
function setQuality(q) {
  quality = q;
  renderer.setPixelRatio(Math.min(DPR, PR[q]));
  const size = q === 2 && !MOBILE ? 1024 : 512; // orta kalitede de gölge var, sadece daha kaba
  if (sunLight.shadow.mapSize.x !== size) { sunLight.shadow.mapSize.set(size, size); sunLight.shadow.map?.dispose(); sunLight.shadow.map = null; }
  shadowWant = MOBILE ? q > 1 : q > 0; // telefonda gölge haritası yalnız en yüksek kalitede (martının altında blob gölge hep var)
  if (state !== 'play' && state !== 'countdown' && state !== 'dead') applyShadows();
  resize();
}
function applyShadows() {
  if (renderer.shadowMap.enabled === shadowWant) return;
  renderer.shadowMap.enabled = shadowWant; sunLight.castShadow = shadowWant;
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => (m.needsUpdate = true)); });
  try { renderer.compile(scene, camera); } catch (e) {}
}

// ---------------- döngü ----------------
const clock = new THREE.Clock();
let t = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const _fw = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _qy = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
let firstFrame = true;
function frame() {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, clock.getDelta());
  // FPS ölçümü + otomatik kalite
  fpsSmooth = fpsSmooth * 0.95 + (1 / Math.max(realDt, 1e-3)) * 0.05;
  if (state === 'play' && (qWarm -= realDt) < 0) {
    qFrames++; qTime += realDt;
    if (qTime > 2.5) {
      const f = qFrames / qTime;
      if (qLock >= 0) {}
      else if (f < 42 && quality > 0) { if (qGood < 0) qMax = quality - 1; setQuality(quality - 1); qGood = 0; }
      else if (f > 56 && quality < qMax && ++qGood >= 4) { setQuality(quality + 1); qGood = -1; } // -1: yeni çıkıldı
      else if (f <= 56 && qGood > 0) qGood = 0;
      qFrames = 0; qTime = 0;
    }
  } else if (state !== 'play') { qFrames = 0; qTime = 0; }
  if (state === 'paused') { renderer.render(scene, camera); return; }

  // hit-stop: simülasyon donar, kamera sarsıntısı ve arayüz sürer
  let dt = realDt;
  if (hitStop > 0) { hitStop -= realDt; dt = 0; }
  timeScale = damp(timeScale, 1, 2.2, realDt);
  dt *= state === 'dead' ? timeScale : 1;
  if (slowT > 0) { slowT -= realDt; dt *= 0.4; }
  if (state === 'countdown') {
    countdown -= realDt;
    const n = Math.ceil(countdown / 0.5);
    if (n !== cdShown && n > 0) { cdShown = n; $('countdown').textContent = Math.min(3, n); bump($('countdown')); sfx.count(); }
    if (countdown <= 0) { state = 'play'; show('countdown', false); sfx.go(); }
    dt = 0;
  }
  t += dt;
  const g = gull.position;

  if (state === 'play' || state === 'title') {
    if (state === 'play') {
      playT += dt;
      sling = Math.max(0, sling - dt);
      slingV = damp(slingV, sling > 0 ? 11 : 0, sling > 0 ? 8 : 1.6, dt);
      // ilerledikçe hızlanır: önce hızlı tırmanır, sonra tavana (SPEED_MAX) kadar yavaşça artmayı sürdürür
      speed = Math.min(SPEED_MAX, 15 + 14 * (1 - Math.exp(-playT / 75)) + playT * 0.032) + slingV;
      if (dist >= gearAt) { gearAt += GEAR_M; gear++; gearUp(); }
      if (stopI < STOPS.length && dist >= stopM[stopI]) arrive();
    } else { speed = 15; autopilot(); }
    // viraj: içindeyken martı dışa savrulur (push), gövde ve kamera içe yatar (lean)
    const cur = turns.find(u => g.z < u.z0 && g.z > u.z1);
    lean = damp(lean, cur ? cur.dir : 0, 3, dt);
    push = Math.abs(lean) * (0.9 + speed * 0.045) * PUSH;
    if (state === 'play') weatherTick(dt);
    const txl = EDGE; // martı vapur küpeştesinin içinde kalır: kapalı salonun dışından dolaşılamaz
    if (keys.ArrowLeft || keys.KeyA) tx = clamp(tx - 17 * dt, -txl, txl);
    if (keys.ArrowRight || keys.KeyD) tx = clamp(tx + 17 * dt, -txl, txl);
    const dz = speed * dt; g.z -= dz; if (state === 'play') dist += dz / 2;
    if (cur) heading += cur.k * dz * bendOn; else heading *= Math.exp(-dt / 30); // ufuk, düzlükte yavaşça toparlanır
    // kritik sönümlü yay: hızlı ama yumuşak takip (çevik: engelden son anda kaçılabilsin)
    // alt adımlar (en çok 1/60 sn): kare hızı düşen telefonda sert yay titremesin
    const k = 230, c = 2 * Math.sqrt(k) * 0.95, aim = clamp(tx - Math.sign(lean) * push + (state === 'play' ? wind * 0.32 + imbatW + fallsW : 0), -EDGE, EDGE);
    for (let i = 0, n = Math.ceil(dt * 60), h = dt / Math.max(1, n); i < n; i++) { vx += ((aim - g.x) * k - vx * c) * h; g.x += vx * h; }
    gull.rotation.z = damp(gull.rotation.z, clamp(-vx * 0.07 - lean * 0.5, -0.85, 0.85), 10, dt) + (weather === 'snow' && warmth < 0.25 && state === 'play' ? Math.sin(t * 55) * 0.05 : 0); // titreme
    gull.rotation.y = damp(gull.rotation.y, clamp(-vx * 0.025 - lean * 0.28, -0.45, 0.45), 10, dt);
    gull.rotation.x = damp(gull.rotation.x, -0.05 + Math.sin(t * 1.1) * 0.03, 4, dt);
    g.y = FLY_Y + Math.sin(t * 2.2) * 0.12 + fallsLift;
    // çırpış: aralıklı patlamalar + dönüşte fazladan; arada süzülme
    if (flapBurst <= 0 && Math.random() < dt * 0.6) flapBurst = rand(0.8, 1.6);
    flapBurst -= dt;
    const want = flapBurst > 0 || Math.abs(vx) > 6 ? 1 : 0.18;
    flapPow = damp(flapPow, want, 5, dt);
    flapPh += dt * (9 + speed * 0.18) * (0.6 + flapPow * 0.4);
    flapGull(gull, flapPh, flapPow, 0.1 + (1 - flapPow) * 0.08);
  } else if (state === 'dead' || state === 'over') {
    crashT += dt; lean = damp(lean, 0, 3, dt);
    const floor = waveAt(g.x, g.z, t) + 0.25;
    if (g.y > floor + 0.01) {
      vy -= 18 * dt; g.y = Math.max(floor, g.y + vy * dt); g.z -= Math.max(0, 7 - crashT * 7) * dt;
      gull.rotation.x += dt * 7; gull.rotation.z += dt * 10;
    } else {
      g.y = floor;
      gull.rotation.x = damp(gull.rotation.x, Math.PI * 0.9, 3, dt); gull.rotation.z = damp(gull.rotation.z, 0.3, 3, dt);
      if (!splashed) {
        splashed = true; sfx.splash(); trauma = Math.min(1, trauma + 0.3);
        chunks.emit(tmp.set(g.x, 0.3, g.z), 26, { speed: 6, up: 1, life: 1, size: 0.16, color: [0xffffff, 0xcfe9f2, 0x8cc7da], gravity: 14, spin: 0.3 });
        sparkle(tmp, 14, 0xdff6ff, 5, 0.5, 0.4);
      }
    }
    flapGull(gull, t * 3, 0.2, -0.3);
    if (state === 'dead' && crashT > 1.4) showOver();
  }
  if (overLock > 0) overLock -= realDt;

  generate(g.z - 280); cleanup(g.z);
  flySimits(dt); updateImbat(dt, g.z);

  // ---- toplama, güçlendirme, çarpışma ----
  if (state === 'play' || state === 'title') {
    const magnet = pw.magnet > 0 && state === 'play';
    for (const s of simits) {
      if (s.taken || (s.th && s.th.u < 0) || (s.bin && s.bin.u < 0)) continue; // henüz atılmamış simit tepside / kapalı çöp kutusunda
      const dzs = g.z - s.z;
      if (magnet && dzs > -2 && dzs < 16 && Math.abs(s.x - g.x) < 7) {
        if (!s.free) { // yolcunun elinden kopar
          s.mesh.getWorldPosition(tmp); s.mesh.removeFromParent(); s.mesh.position.copy(tmp); scene.add(s.mesh);
          s.x = tmp.x; s.y = tmp.y; s.z = tmp.z; s.free = true; angry(s.person);
        }
        s.pulled = true;
      }
      if (s.pulled) {
        const k = 1 - Math.exp(-dt * 9);
        s.x += (g.x - s.x) * k; s.y += (g.y - s.y) * k; s.z += (g.z - s.z) * k - speed * dt * 0.6;
        s.mesh.position.set(s.x, s.y, s.z);
      }
      if (Math.abs(s.z - g.z) > HIT.simZ || Math.abs(s.x - g.x) > HIT.simX || Math.abs(s.y - g.y) > HIT.simY) continue;
      s.taken = true;
      if (s.free) scene.remove(s.mesh); else s.mesh.visible = false;
      if (state === 'play') takeSimit(s);
    }
    if (state === 'play') {
      for (const p of powerups) {
        if (p.taken || Math.abs(p.z - g.z) > HIT.power || Math.abs(p.x - g.x) > HIT.power) continue;
        p.taken = true; scene.remove(p.g);
        pw[p.kind] = dur(p.kind); renderPowers(); run.power++;
        hitStop = 0.05; trauma = Math.min(1, trauma + 0.2);
        sparkle(tmp.set(p.x, p.y, p.z), 40, new THREE.Color(POWER[p.kind].color).getHex(), 7, 0.8, 0.5);
        sfx.power(); vibrate(25);
      }
      const gz0 = g.z + speed * dt; // bu karede martının geçtiği z aralığı: [g.z, gz0]
      const swept = (z, h) => g.z < z + h && gz0 > z - h;
      for (const o of obstacles) {
        const dx = Math.abs(g.x - o.x);
        if (g.y < o.top && dx < o.hw + HIT.obs && swept(o.z, o.hd + HIT.obs)) crash(o.kind);
        else if (!o.passed && g.z < o.z - o.hd) {
          o.passed = true;
          if (dx < o.hw + HIT.near && state === 'play') nearMiss(o.x);
        }
      }
      for (const r of rivals) {
        if (r.hit) continue;
        const rp = r.mesh.position, rel = rp.z - g.z, rel0 = r.rel ?? rel, dxr = Math.abs(rp.x - g.x); r.rel = rel;
        if (!r.passed && rel > 0) { r.passed = true; if (dxr < HIT.rival + 1.1 && dxr >= HIT.rival && state === 'play') nearMiss(rp.x); } // yanından sıyırdın
        if (dxr < HIT.rival && Math.min(rel, rel0) < HIT.rival && Math.max(rel, rel0) > -HIT.rival) {
          if (pw.shield > 0 || invuln > 0 || god) { // kalkanla rakibi savur
            if (pw.shield > 0) crash('rakip martıya');
            r.hit = true; r.spin = rp.x > g.x ? 1 : -1;
            flats.emit(rp, 12, { speed: 5, life: 1.2, size: 0.4, color: [0x6f7682, 0x474d58], gravity: 2, flutter: 4 });
          } else crash('rakip martıya');
        }
      }
      for (const k of kites) if (Math.abs(k.g.position.x - g.x) < HIT.kiteX && swept(k.z, HIT.kiteZ)) crash('uçurtmaya');
      for (const s of smokes) {
        if (!s.hit && g.z < s.z1 && g.z > s.z0 && Math.abs(g.x - s.x) < s.hw) {
          s.hit = true; smokeT = 1.4;
          if (combo > 0) { combo = 0; comboT = 0; }
          sfx.cough(); vibrate(30);
        }
      }
      for (const u of turns) {
        if (!u.entered && g.z < u.z0) { u.entered = true; sfx.whoosh(); trauma = Math.min(1, trauma + 0.12); }
        if (!u.done && g.z < u.z1) { u.done = true; judgeTurn(u); }
      }
      if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
      if ((cryT -= dt) < 0) { cryT = rand(6, 12); sfx.cry(0.08 + Math.random() * 0.05); }
      for (const k of Object.keys(pw)) if (pw[k] > 0) { pw[k] -= dt; if (pw[k] <= 0) { pw[k] = 0; renderPowers(); } }
      if (invuln > 0) invuln -= dt;
      if (smokeT > 0) smokeT -= dt;
      // öğretici
      if (tutT > 0) { tutT -= dt; if (tutT <= 0 || tutMoves >= 3) { tutT = 0; hideTutorial(); } }
    }
  }

  // ---- canlılar ----
  for (const r of rivals) {
    const p = r.mesh.position;
    if (r.hit) { p.x += r.spin * 14 * dt; p.y += 6 * dt; r.mesh.rotation.z += r.spin * 12 * dt; continue; }
    const go = g.z - p.z < Math.max(35, speed * 1.4) ? 1 : 0; // martı yaklaşınca harekete geçer: önceden kayıp başka bölgeye (vapur salonuna) girmez
    if (r.kind === 'red') { // dalış: hızlı ve düz, hafif kayar
      p.z = Math.min(p.z + r.dive * dt * go, r.zMax);
      p.x = r.bx + Math.sin(t * 0.9 + r.ph) * 0.5; r.mesh.rotation.z = Math.cos(t * 0.9 + r.ph) * 0.15; r.mesh.rotation.x = 0.18;
      flapGull(r.mesh, t * 16 + r.ph, 1);
    } else if (r.kind === 'blue') { // zikzak: rastgele aralıklarla yeni hedef, sabit hızla keskin dönüş
      p.z = Math.min(p.z + 5 * dt * go, r.zMax);
      if ((r.zt -= dt) <= 0) { r.zt = rand(0.75, 1.3); r.tx = clamp(r.bx + rand(-2, 2), -LANE, LANE); }
      const dx = r.tx - p.x, step = Math.min(Math.abs(dx), 4.5 * dt) * Math.sign(dx);
      p.x += step; r.mesh.rotation.z = damp(r.mesh.rotation.z, -Math.sign(dx) * (Math.abs(dx) > 0.1 ? 0.55 : 0), 10, dt);
      flapGull(r.mesh, t * 13 + r.ph, 1);
    } else {
      p.z = Math.min(p.z + 5 * dt * go, r.zMax); p.x = r.bx + Math.sin(t * 0.9 + r.ph) * r.sw;
      r.mesh.rotation.z = Math.cos(t * 0.9 + r.ph) * 0.3;
      flapGull(r.mesh, t * 11 + r.ph, 0.9);
    }
    p.y = FLY_Y + Math.sin(t * 3 + r.ph) * 0.15;
  }
  for (const k of kites) {
    const kp = k.g.position;
    kp.x = k.bx + Math.sin(t * 1.9 + k.ph) * k.sw;
    kp.y = FLY_Y + 0.2 + Math.sin(t * 2.6 + k.ph) * 0.3;
    k.g.rotation.z = Math.cos(t * 1.9 + k.ph) * 0.4;
    k.g.userData.tail.forEach((b, i) => { b.position.x = Math.sin(t * 5 - i * 0.8) * 0.18 * (i + 1); b.rotation.z = Math.sin(t * 6 - i) * 0.6; });
  }
  for (const p of powerups) {
    p.g.position.y = p.y + Math.sin(t * 3 + p.z) * 0.22;
    p.g.children[0].rotation.y = t * 1.4; p.g.children[0].rotation.x = t * 0.7;
    const s = 1 + Math.sin(t * 6) * 0.05; p.g.scale.setScalar(s);
  }
  for (const p of people) {
    if (Math.abs(p.wz - g.z) > 70) continue;
    if (p.angry > 0) {
      p.angry -= dt;
      p.mesh.position.y = DECK + 0.05 + Math.abs(Math.sin(p.angry * 12)) * 0.35;
      if (p.angry <= 0) { p.mesh.position.y = DECK + 0.05; p.mesh.geometry = p.calmGeo; }
    } else if (p.simit && p.simit.visible) p.simit.position.y = p.sy + Math.sin(t * 3 + p.ph) * 0.06;
  }
  for (const f of ferries) {
    if (f.zFront > g.z + 40 || f.zBack < g.z - 200) continue;
    f.group.rotation.z = Math.sin(t * 0.8 + f.ph) * 0.015;
    f.flag.rotation.x = Math.sin(t * 7 + f.ph) * 0.08;
    for (const c of f.chims) {
      c.t -= dt;
      if (c.t <= 0 && c.z < g.z + 5 && c.z > g.z - 130) {
        if (c.dark) { c.t = 0.09; puff(c.x + rand(-0.3, 0.3), DECK + 4.9, c.z + 0.3, true, rand(2.6, 3.4), -1.25, 1.9, 2.1); }
        else { c.t = 0.28; puff(c.x, DECK + 4.9, c.z, false, 1.6, 1.6, 1.1, 2.4); }
      }
    }
  }
  for (const d of decor) {
    if (d.vz) { if (bridges.some(b => Math.abs(b.z - d.z) < 12)) d.vz = 0; d.z += d.vz * dt; d.mesh.position.z = d.z; } // köprüye gelen gemi demirler (tabliyenin içinden geçmesin)
    d.mesh.position.y = waveAt(d.mesh.position.x, d.z, t) - 0.1; d.mesh.rotation.z = Math.sin(t * 1.7 + d.ph) * (d.calm ? 0.012 : 0.12);
    const crew = d.mesh.userData.crew; // dekor teknelerindekiler martı yaklaşınca zıplar, el sallar
    if (crew && crew.length && Math.abs(d.z - g.z) < 60) for (const c of crew) {
      if (c.sit) { c.m.rotation.z = Math.sin(t * 4 + c.ph) * 0.12; continue; }
      c.m.position.y = c.y + Math.max(0, Math.sin(t * 6.5 + c.ph)) * 0.35; c.m.rotation.z = Math.sin(t * 3 + c.ph) * 0.1;
    }
  }
  animLand(g.z); updateFlocks(dt, g.z); updateMarks(g.z); updateTitleSet(g.z);
  for (const s of farShips) { s.position.x += s.userData.v * dt; if (Math.abs(s.position.x) > 320) s.position.x = -Math.sign(s.position.x) * 300; }
  updatePirates(g.z); updateFalls(dt, g.z);
  for (const c of crossers) { // martı geldiğinde xa'da olacak şekilde yandan kayar
    c.o.x = c.xa + c.side * Math.max(-40, g.z - c.z) * c.k;
    c.mesh.position.set(c.o.x, waveAt(c.o.x, c.z, t) - 0.1, c.z); c.mesh.rotation.x = Math.sin(t * 1.3 + c.ph) * 0.06;
  }
  for (const b of bins) { // martı yaklaşınca kapak fırlar, kırık simit tam önüne zıplar
    const s = b.s, bn = s.bin;
    if (bn.u < 0) { if (g.z - b.z < speed * 0.55 && (state === 'play' || state === 'title')) { bn.u = 0; s.mesh.visible = true; sfx.click(); sparkle(tmp2.set(s.x, s.y + 0.3, s.z), 10, 0xffe7a8, 3, 0.5); } continue; }
    if (bn.u > 1.6) continue;
    bn.u += dt / 0.5;
    const k = Math.min(1, bn.u);
    b.lid.position.y = b.ly + Math.sin(Math.min(1, bn.u * 1.4) * Math.PI) * 1.2; b.lid.rotation.x = Math.min(1, bn.u) * 2.2;
    if (!s.taken && !s.pulled) { s.y = bn.y0 + (FLY_Y - bn.y0) * (1 - (1 - k) * (1 - k)); s.mesh.position.y = s.y; s.mesh.rotation.x += dt * 9; }
  }
  for (const c of cats) { // kasadaki kedi: martı yakından geçerse tıslar, sıçrar
    if (c.jump > 0) { c.jump -= dt; c.mesh.position.y = DECK + 1.06 + Math.sin((1 - c.jump / 0.5) * Math.PI) * 0.5; }
    if (c.done || state !== 'play' || Math.abs(g.z - c.z) > 2.5 || Math.abs(g.x - c.x) > 3) continue;
    c.done = true; c.jump = 0.5;
    sfx.click();
  }
  for (const b of bridges) {
    for (const l of b.lines) {
      const r = Math.sin(t * 1.1 + l.ph) * 0.009 + Math.sin(t * 2.3 + l.ph * 2) * 0.004; // misina rüzgârda hafif salınır
      l.line.rotation.z = r; l.o.x = l.x - r * (l.line.position.y - FLY_Y);
      l.bob.position.set(l.x - r * l.line.position.y, waveAt(l.x, b.z + l.line.position.z, t) - 0.08, l.line.position.z);
    }
    if (!b.done && state === 'play' && g.z < b.z - 6) {
      b.done = true; run.bridge++;
      const gain = 30 * mult(); points += gain;
      sfx.power(); vibrate(20);
      sparkle(tmp2.set(g.x, g.y + 0.5, g.z), 16, 0xffe7a8, 4, 0.6);
    }
  }
  for (const f of dolphins) {
    const x0 = f.ax - f.dir * f.w / 2, H = FLY_Y - 1.45;
    if (f.u < 0) { // atlamadan önce: sırt yüzgeci suyu yararak kalkış noktasında oyalanır
      const x = x0 - f.dir * (0.6 + Math.sin(t * 0.9 + f.ph) * 0.5);
      f.mesh.position.set(x, waveAt(x, f.z, t) - 0.6, f.z); f.mesh.rotation.z = Math.sin(t * 2 + f.ph) * 0.05;
      if (g.z - f.z < speed * (f.T * 0.5 + f.lag) && (state === 'play' || state === 'title')) { f.u = 0; splash(x0, f.z, 8); }
      continue;
    }
    if (f.u > 1.4) continue;
    const u = (f.u += dt / f.T), x = x0 + f.dir * f.w * u, y = -0.6 + (H + 0.6) * 4 * u * (1 - u);
    f.mesh.position.set(x, y, f.z);
    f.mesh.rotation.z = Math.atan((H + 0.6) * 4 * (1 - 2 * u) / f.w) * 0.85;
    if (u > 1 && u - dt / f.T <= 1) splash(x, f.z, 12);
    if (u > 1.4) f.mesh.visible = false;
    if (!f.got && state === 'play' && u > 0.3 && u < 0.7 && Math.abs(g.x - x) < 1.6 && Math.abs(g.z - f.z) < 1.4) { f.got = true; dolphinBonus(f); }
  }
  for (const f of fishes) {
    const x0 = f.ax - f.dir * f.w / 2, H = FLY_Y + 0.45;
    if (f.u < 0) { // sıçramadan önce: su yüzünde arada bir çırpınır (küçük sıçrantılar yerini belli eder)
      if ((f.splT -= dt) <= 0) { f.splT = rand(0.3, 0.6); if (f.z < g.z + 5 && f.z > g.z - 110) splash(x0 + rand(-0.5, 0.5), f.z, 4); }
      if (g.z - f.z < speed * (f.T * 0.5 + f.lag) && (state === 'play' || state === 'title')) { f.u = 0; f.mesh.visible = true; splash(x0, f.z, 10); }
      continue;
    }
    if (f.u > 1.3) continue;
    const u = (f.u += dt / f.T), x = x0 + f.dir * f.w * u, y = -0.5 + (H + 0.5) * 4 * u * (1 - u);
    f.mesh.position.set(x, y, f.z);
    f.mesh.rotation.set(f.spin ? f.mesh.rotation.x + f.spin * dt * 18 : 0, f.dir > 0 ? 0 : Math.PI, Math.atan((H + 0.5) * 4 * (1 - 2 * u) / f.w) * 0.9 + Math.sin(t * 30) * 0.12);
    if (u > 1 && u - dt / f.T <= 1) splash(x, f.z, 8);
    if (u > 1.3) f.mesh.visible = false;
    if (!f.done && state === 'play' && u > 0.25 && u < 0.75 && Math.abs(g.x - x) < 1.15 && Math.abs(g.z - f.z) < 1.3 && Math.abs(g.y - y) < 1.3) {
      f.done = true;
      if (Math.random() < fishCatch) catchFish(f); else slipFish(f);
    }
  }
  for (const s of simits) if (s.free && !s.taken && !s.pulled && s.mesh.visible) { if (!s.th) s.mesh.rotation.y = t * 2.4 + s.z; if (s.gold && Math.random() < dt * 8) sparkle(s.mesh.position, 1, 0xffe08a, 1, 0.6, 0.4); }
  updateFx(dt);

  // ---- kalkan / sis ----
  shieldOrb.visible = (pw.shield > 0 || (invuln > 0 && Math.sin(t * 40) > 0));
  if (shieldOrb.visible) { shieldOrb.rotation.y = t * 1.5; shieldOrb.scale.setScalar(1 + Math.sin(t * 8) * 0.04); }
  gull.visible = !(invuln > 0 && pw.shield <= 0 && Math.sin(t * 50) < -0.3);
  ui.vignette.style.opacity = smokeT > 0 ? Math.min(1, smokeT) : 0;

  // ---- gölge (blob), ışık ----
  const onDeck = deckUnder(g.x, g.z);
  const gy = onDeck ? DECK + 0.08 : waveAt(g.x, g.z, t) + 0.2;
  blob.position.set(g.x, gy, g.z);
  blob.scale.setScalar(clamp(1.2 - (g.y - gy) * 0.07, 0.4, 1.1));
  blob.visible = state !== 'over' && showcase < 0.5 && !(onDeck && renderer.shadowMap.enabled);
  placeSun(g.x, g.z);

  // ---- kamera: yumuşak takip + sarsıntı ----
  const land = camera.aspect > 1;
  const back = land ? 11 : 13.5, up = land ? 4.2 : 5.4; // martının arkasında, yukarısında
  const followZ = state === 'dead' || state === 'over' ? camera.position.z - back : g.z;
  let cx = g.x * 0.85 - lean * 1.3, cy = FLY_Y + up + fallsLift * 0.45, cz = followZ + back;
  showcase = damp(showcase, state === 'title' && !dressing ? 1 : 0, state === 'title' ? 4 : 1.6, realDt);
  if (dressing) { cx = g.x + (land ? 1.6 : 1.6); cy = FLY_Y + (land ? 1.9 : 1.5); cz = g.z - (land ? 6.8 : 5.2); } // kostüm paneli: önden yakın çekim
  else if (showcase > 0.001) {
    // oyun kamerasının martıya göre açısından vitrin açısına yay çizerek geç: kamera martının içinden geçmez
    const a0 = Math.atan2(cx - g.x, cz - g.z), r0 = Math.hypot(cx - g.x, cz - g.z);
    const a1 = (titleCamA = TITLE_A + Math.sin(t * 0.23) * 0.35 + Math.sin(t * 0.61 + 1) * 0.12), r1 = land ? 7.5 : 9.5;
    const k = showcase * showcase * (3 - 2 * showcase), a = a0 + (a1 - a0) * k, r = r0 + (r1 - r0) * k;
    cx = g.x + Math.sin(a) * r; cz = g.z + Math.cos(a) * r; cy = cy + (FLY_Y + (land ? 0.55 : 0.9) - cy) * k; // göz hizası: ufuk ve şehir martının arkasına düşer
  }
  camera.position.x = damp(camera.position.x, cx, 5, realDt);
  camera.position.y = damp(camera.position.y, cy, 5, realDt);
  camera.position.z = damp(camera.position.z, cz, showcase > 0.001 ? 8 : 12, realDt);
  if (dressing) camera.lookAt(g.x - (land ? 2.6 : 0), g.y - (land ? 0.1 : 1.6), g.z); // yatayda martı solda, panel sağda
  else if (showcase > 0.001) {
    const k = showcase * showcase * (3 - 2 * showcase);
    camera.lookAt(g.x * 0.92 + lean * 2.6 + (g.x - g.x * 0.92 - lean * 2.6) * k, FLY_Y - (land ? 0.2 : 0.6) + (g.y + (land ? 0.05 : 0.6) - FLY_Y + (land ? 0.2 : 0.6)) * k, followZ - 12 + (g.z + 12 - followZ) * k);
  }
  else camera.lookAt(g.x * 0.92 + lean * 2.6, FLY_Y - (land ? 0.2 : 0.6), followZ - 12); // virajın içine bak
  camera.rotation.z += gull.rotation.z * 0.06 - lean * 0.13;
  trauma = Math.max(0, trauma - realDt * 1.6);
  if (trauma > 0) {
    const s = trauma * trauma, tt = performance.now() * 0.001;
    camera.position.x += Math.sin(tt * 47.3) * 0.5 * s; camera.position.y += Math.sin(tt * 53.1 + 1) * 0.4 * s;
    camera.rotation.z += Math.sin(tt * 39.7 + 2) * 0.05 * s;
  }
  const fovBase = (land ? 56 : 68) - showcase * (land ? 10 : 14);
  const boost = pw.magnet > 0 || pw.double > 0 ? 2 : 0;
  camera.fov = damp(camera.fov, fovBase + (speed - 15) * 0.42 + boost + slingV * 0.5, 3, realDt);
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  // önümüzdeki en fazla iki viraj çizimde yay olarak bükülür; ufuk, güneş ve siluet yönle döner
  bendOn = damp(bendOn, dressing ? 0 : 1 - showcase, 2, realDt);
  const ahead = turns.filter(u => u.z1 < g.z), wD = Math.max(4, camera.position.z - g.z);
  for (const [i, B] of [BEND, BEND2].entries()) {
    const u = ahead[i];
    if (u) B.value.set(u.k * bendOn, Math.max(0, g.z - u.z0), g.z - u.z1, wD); else B.value.set(0, 1e4, 1e4, wD);
  }
  // bükme çerçevesi: kameranın eğimi ve yatışı çıkarılır, yalnız yönü kalır (scene.js LEVEL)
  _fw.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _qy.setFromAxisAngle(_up, Math.atan2(-_fw.x, -_fw.z)).invert().multiply(camera.quaternion);
  LEVEL.value.setFromMatrix4(_m4.makeRotationFromQuaternion(_qy));
  far.position.set(camera.position.x * 0.9, 0, camera.position.z);
  far.rotation.y = heading * bendOn;
  setHeading(heading * bendOn);
  const sign = state === 'play' && ahead[0] && !ahead[0].entered && ahead[0].z0 > g.z - 70 ? ahead[0].dir : 0;
  if (sign !== shownSign) { shownSign = sign; $('turnSign').classList.toggle('on', !!sign); $('turnSign').classList.toggle('left', sign < 0); }
  updateWater(t, camera.position.x, camera.position.z);
  updateWeatherFx(dt, t, camera.position.x, camera.position.z, wind);
  updateSpeedLines(dt, g.x, g.y, g.z, speed, state === 'play' ? (speed - 20) / 12 + (pw.double > 0 ? 0.4 : 0) + slingV / 6 : 0);

  // ---- ses, arayüz ----
  audio.tick();
  audio.setSpeed((speed - 15) / 19);
  if (state === 'play') {
    updateHud(); checkMissions();
    const m = mult();
    const on = combo >= 2;
    ui.combo.classList.toggle('on', on);
    if (on) {
      ui.comboRing.style.strokeDashoffset = 100 - (comboT / COMBO_T) * 100;
      if (m !== shownMult) { ui.mult.textContent = `x${m}`; if (m > shownMult && m > 1) bump(ui.combo, 'bump'); shownMult = m; }
      $('comboN').textContent = combo;
    } else if (shownMult !== 0) { shownMult = 0; }
    tickPowers();
  }

  renderer.render(scene, camera);
  if (firstFrame) { firstFrame = false; const l = $('loader'); l.classList.add('done'); setTimeout(() => l.remove(), 700); warmPeople(); }
}

function angry(p) {
  if (!p) return;
  p.angry = 1.6;
  if (!p.feeder) p.mesh.geometry = p.angryGeo(); // ikramcı kızmaz, sevinçten zıplar
}
// simidi kapılan yolcu tipine göre laf eder (amca, dede, teyze, abla, genç, çocuk); ikramcı sevinir.
// Söz torbası: bir uçuşta aynı söz iki kez çıkmaz; tipin sözleri biterse ortak havuzdan gelir (ikinci şans aynı uçuştur)
const CHEERS = ["Afiyet olsun!", "Al bakalım!", "Hadi gel!", "Ye ye, gürbüz ol!", "Sana sakladım!", "Bravo martı!", "Tam isabet!", "Bir tane daha var!", "Paylaşmak güzeldir!", "Sıcak sıcak!", "Martıma kurban olurum!", "Yakaladı!", "Kap bakalım!", "Bol susamlısından!", "Hoş geldin martı!"];
const SHOUTS = {
  amca: ["Oha ulen!", "Ulennn!", "Hoop hemşerim!", "Bırak onu ulen!", "Simidim gitti ya!", "Martıya bak martıya!", "Yuh artık!", "Allah Allah!", "Çayın yanına neyle yicem?", "Ulen martı!", "Bu martı sabıkalı!", "Yirmi beş liraya aldım onu!", "Zabıta çağırırım ha!", "Martı değil korsan bu!", "Gel buraya gel!", "Hanım, simidi kaptırdım!", "Kaşarlı simitti o!", "Bu vapurda huzur yok!"],
  dede: ["Ahhh simidim…", "Evlat, o benim!", "Hey gidi günler…", "Bizim zamanımızda martılar böyle değildi!", "Gözlüğüm nerde?", "Vay terbiyesiz!", "Bastonla kovarım ha!", "Hayırsız martı!", "Dişlerim takılıydı ona!", "Altmış yıldır bu vapura binerim!", "Gençliğimde ben de böyleydim…", "Kuş beyinli!", "Hanım bunu duymasın…", "Ne oldu, ne oldu?"],
  teyze: ["Ay simidim!", "Aaa! Martıya bak!", "Ay kalbim!", "Vay hınzır!", "Ayol!", "Torunumun simidiydi o!", "Kış kış!", "Ay yüreğim ağzıma geldi!", "Ay, tansiyonum çıktı!", "Çantama da gözü var bunun!", "Ay kuzum, aç mıydın?", "Bu martının annesi yok mu?", "Ay, rujum bulaştı mı?", "Elimden aldı, gördünüz mü?", "Maşallah, ne çevik!"],
  abla: ["Yaaa!", "Videoya çekecektim!", "Bu ne hız?", "Aşk olsun!", "İnanamıyorum!", "Hikâyeye atıyorum bunu!", "Diyetteydim zaten…", "Tırnaklarım!", "Fotoğraf çekiyordum!", "Ciddi misin şu an?", "Story kaçtı!", "Ayy, kanatları değdi!", "Bu martı benden hızlı!"],
  genc: ["Kanka simidim!", "Efsane martı!", "Bro?!", "Çakal martı!", "Ahahah gördün mü?", "Oha!", "Efsane!", "Kanka ne oldu az önce?", "Turbo martı!", "Bunu kimse görmedi değil mi?", "Speedrun mı atıyorsun?", "Tamam, sen kazandın.", "Martı da mı spor yapıyor?", "GG martı, GG."],
  cocuk: ["Annee martı!", "Bir daha yap!", "Martı abi bana da!", "Yaşasın martı!", "Ahaha!", "Ahahaha!", "Martı simidimi yedi!", "Babaa, bir simit daha!", "Martıyı eve götürelim!", "Ben de uçmak istiyorum!", "Adı ne bunun?", "Bir daha gel!"],
  genel: ["Simidim!", "Hoop!", "Yaa!", "Martıya bak!", "Bırak onu!", "Ah simidim…", "Hah, oh olsun!", "Bizimkini de alma ha!", "Tövbe tövbe…", "Martılar azdı!", "Aman simidini sakla!", "Ay gördün mü?", "Çektin mi onu?", "Hayırdır?", "Kaptan, martı var!", "Herkes simidine sahip çıksın!", "Bu kaçıncı?", "Simit hırsızı!", "Bu martı her gün burada!", "Martıya simit verilmez!", "Kim yaptı bunu?", "Susamlar uçuştu!", "Bir simit de bana!", "Gözümün önünde!", "Ne biçim martı bu?", "Martı da acıkır tabii.", "Simitçi, bir tane daha!", "Tutun şunu!"],
};
const saidRun = new Set();
function line(list) {
  const fresh = list.filter(s => !saidRun.has(s));
  if (!fresh.length) return '';
  const s = pick(fresh); saidRun.add(s); return s;
}
let shoutT = 0;
function shout(p, s, cheer) {
  const now = performance.now();
  if (now - shoutT < 2200) return; // balonlar seyrek: ekranı doldurmasın
  const say = cheer ? line(CHEERS) || line(SHOUTS.genel) : line(SHOUTS[p.kind] || SHOUTS.amca) || line(SHOUTS.genel);
  if (!say) return; // bu uçuşta söylenecek söz kalmadı
  shoutT = now;
  popText(tr(say), tmp2.set(s.x, s.y + 1.3, s.z), cheer ? 'shout cheer' : 'shout');
}
// kapılan simit, martının ekrandaki yerinden HUD'daki simit sayacına uçar (seyrekleştirilmiş: telefonda DOM yükü olmasın)
const coinV = new THREE.Vector3();
let coinT = 0;
function coinFly(gold, sel = '.sub .ico', icon = 'i-simit') {
  const now = performance.now(), ico = () => document.querySelector(sel);
  if (!gold && icon === 'i-simit' && now - coinT < 140) return;
  if (icon === 'i-simit') coinT = now;
  coinV.copy(gull.position).project(camera);
  const x = (coinV.x * 0.5 + 0.5) * innerWidth, y = (-coinV.y * 0.5 + 0.5) * innerHeight, r = ico().getBoundingClientRect();
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('class', 'coin-fly' + (gold ? ' gold' : '')); el.innerHTML = `<use href="#${icon}"/>`;
  el.style.transform = `translate(${x}px, ${y}px)`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px) scale(.6) rotate(200deg)`; el.style.opacity = '.4'; }));
  setTimeout(() => { el.remove(); bump(ico()); }, 560);
}
function takeSimit(s) {
  combo = comboT > 0 ? combo + 1 : 1; comboT = COMBO_T; bestCombo = Math.max(bestCombo, combo);
  const m = mult() * (pw.double > 0 ? 2 : 1);
  // simit parçası (atılan, çöpten çıkan) çeyrek simittir: puanın ve cüzdana katkısının dörtte biri
  const q = s.piece ? 0.25 : 1, base = s.gold ? 50 : 10, gain = Math.max(1, Math.round(base * m * q));
  points += gain; simitCount += q; countMission('simitTotal', q);
  if (s.turn) s.turn.got++;
  if (s.th) thrownStat.caught++;
  if (weather === 'snow') warmth = Math.min(1, warmth + (s.gold ? 0.35 : 0.08)); // sıcak simit ısıtır
  if (s.person) run.steal++;
  if (s.person && s.person.feeder) run.feed++;
  if (s.th) run.piece++;
  if (s.gold) {
    goldCount += q; sfx.gold(); hitStop = 0.06; trauma = Math.min(1, trauma + 0.25); vibrate(20);
    sparkle(tmp.set(s.x, s.y, s.z), 34, 0xffd35a, 6, 0.8, 0.3);
    chunks.emit(tmp, 10, { speed: 4, life: 0.8, size: 0.09, color: [0xffd35a, 0xfff0b0], gravity: 8 });
  } else {
    sfx.catch(combo);
    sparkle(tmp.set(s.x, s.y, s.z), 8, 0xffe7a8, 3, 0.45, 0.2);
    chunks.emit(tmp, 7, { speed: 3, life: 0.7, size: 0.075, color: [0xc97835, 0xf6e2b3, 0xb8642a], gravity: 9 });
    vibrate(8);
  }
  bump(ui.score); coinFly(s.gold);
  flapBurst = Math.max(flapBurst, 0.4);
  if (s.person && s.person.feeder) { angry(s.person); points += 15 * m; shout(s.person, s, true); }
  else if (s.person) { angry(s.person); if (Math.random() < 0.7) shout(s.person, s); }
}
// viraj çıkışı: çizgideki simitlerin çoğu alındıysa bonus ve sapan gibi fırlama
function judgeTurn(u) {
  if (state !== 'play' || u.total < 3) return;
  const r = u.got / u.total;
  if (r >= 0.8) {
    const gain = 40 * mult() * (pw.double > 0 ? 2 : 1);
    points += gain; run.turn++; sling = 1.5;
    sfx.sling(); vibrate([15, 30, 25]); trauma = Math.min(1, trauma + 0.3); flapBurst = 1;
    sparkle(gull.position, 30, 0xffe7a8, 6, 0.7, 0.3);
  } else if (r >= 0.5) {
    points += 10;
  }
}
function weatherTick(dt) {
  if (weather === 'rain') {
    gustNext -= dt;
    if (gustNext <= 0) {
      gustT = rand(1.4, 2.2); gustDir = pick([-1, 1]); gustNext = rand(7, 12); sfx.gust();
    }
    gustT -= dt;
    wind = damp(wind, gustDir * (gustT > 0 ? GUST : 1), gustT > 0 ? 2.5 : 1.2, dt);
    boltNext -= dt;
    if (boltNext <= 0) { boltNext = rand(9, 18); bump(ui.flash, 'flashing'); sfx.thunder(); }
  } else wind = damp(wind, 0, 2, dt);
  if (weather === 'fog') { hornNext -= dt; if (hornNext <= 0) { hornNext = rand(12, 20); sfx.horn(); } }
  if (weather === 'snow') {
    const was = warmth;
    warmth -= dt / COLD_S;
    if (was >= 0.25 && warmth < 0.25) sfx.shiver();
    if (warmth <= 0) { // dondun: kombo sıfırlanır, biraz ısınıp devam
      warmth = 0.45; combo = 0; comboT = 0; trauma = Math.min(1, trauma + 0.35); sfx.shiver(); vibrate([30, 30, 30]);
      sparkle(gull.position, 30, 0xdff6ff, 4, 0.8, 0.6);
    }
    const w = Math.round(warmth * 50);
    if (w !== shownWarm) {
      if (shownWarm < 0) show('warm');
      shownWarm = w; $('warm').querySelector('i').style.transform = `scaleX(${warmth})`; $('warm').classList.toggle('cold', warmth < 0.25);
    }
  }
}
// iskeleye varış (kapının altından geçiş): uçuş sürer, çubuk sıradaki durağa geçer
function arrive() {
  const i = stopI++, gain = 25 * i * mult();
  points += gain; if (combo > 0) comboT = COMBO_T;
  const el = $('arrive');
  $('arriveName').textContent = STOPS[i].name.toLocaleUpperCase(window.I18N.lang === 'tr' ? 'tr' : 'en'); // iskele adları Türkçe kalır
  $('arriveSub').textContent = tr(i === STOPS.length - 1 ? city.end : 'İskeleye vardın');
  $('arriveGain').textContent = `+${fmt(gain)}`;
  if (i > farStop) { // ilk kez: iskele haritada açılır, cüzdana hediye
    farStop = newStop = i; store.set(city.routeKey, i);
    wallet += STOPS[i].gift; store.set(KEY_WALLET, wallet);
    $('arriveSub').textContent = tr(i === STOPS.length - 1 ? city.end : 'Yeni iskele!');
    $('arriveGain').innerHTML = `+${fmt(gain)} · +${fmt(STOPS[i].gift)} <svg class="ico"><use href="#i-simit"/></svg>`;
    setTimeout(() => sfx.record(), 350);
  }
  bump(el, 'on');
  sfx.horn(); sfx.power(); vibrate([20, 30, 20]); confetti();
  slowT = 0.55; flapBurst = 1; trauma = Math.min(1, trauma + 0.2); // kısa ağır çekim: an hissedilsin
  const gz = gull.position.z;
  [0xff5a5f, 0xffc23a, 0x2bd4c0, 0xffffff].forEach((c, k) => setTimeout(() => { // tabelanın üstünde havai fişek
    const p = tmp2.set(rand(-6, 6), GATE_FW_Y + rand(0, 3), gz - 8 - k * 4);
    sparkle(p, 46, c, 8, 1.1, 0.3); sfx.near();
  }, 120 + k * 260));
  sparkle(tmp2.set(gull.position.x, gull.position.y + 0.5, gull.position.z), 30, 0xffe7a8, 6, 0.8);
}
function gearUp() {
  sfx.power(); trauma = Math.min(1, trauma + 0.15); flapBurst = 1;
}
function splash(x, z, n) {
  chunks.emit(tmp2.set(x, waveAt(x, z, t) + 0.1, z), n, { speed: 3, up: 2.2, life: 0.7, size: 0.1, color: [0xffffff, 0xcfe9f2], gravity: 12, spin: 0.3 });
}
// balık yakalandı: cüzdana bir balık, küçük bonus, kombo süresi tazelenir; ikon HUD'daki balık sayacına uçar
function catchFish(f) {
  f.u = 2; f.mesh.visible = false;
  setFish(fish + 1); fishRun++; run.fish++;
  points += 25 * mult(); if (combo > 0) comboT = COMBO_T;
  sfx.gold(); vibrate([20, 30, 20]); hitStop = 0.06; trauma = Math.min(1, trauma + 0.2); flapBurst = 1;
  sparkle(tmp2.set(f.mesh.position.x, f.mesh.position.y, f.z), 30, 0x8fdcff, 5, 0.8, 0.3);
  popText(tr('Balık!'), tmp2.set(f.mesh.position.x, f.mesh.position.y + 1.2, f.z), 'shout cheer');
  updateHud(); coinFly(false, '#hudFish .ico', 'i-fish'); bump($('hudFish'));
}
// değdin ama elinden kaydı: balık çırpınarak suya döner
function slipFish(f) {
  f.spin = f.dir;
  sfx.splash(); vibrate(15);
  popText(tr('Kaçtı!'), tmp2.set(f.mesh.position.x, f.mesh.position.y + 1.2, f.z), 'shout');
}
// yunusun tepe noktasının üstünden geçmek: küçük bonus + kombo süresi tazelenir (zincir kopmaz)
function dolphinBonus(f) {
  const gain = 15 * mult();
  points += gain; run.dolphin++;
  if (combo > 0) comboT = COMBO_T;
  sfx.near(); vibrate(15);
  sparkle(tmp2.set(f.mesh.position.x, f.mesh.position.y + 0.5, f.z), 12, 0xcff0ff, 3.5, 0.5);
}
function nearMiss(x) {
  const gain = 5 * mult();
  points += gain; run.near++;
  sfx.near(); trauma = Math.min(1, trauma + 0.12);
  sparkle(tmp2.set((gull.position.x + x) / 2, gull.position.y, gull.position.z), 6, 0xffffff, 3, 0.35);
}

// başlık ekranında martı kendi kendine uçar
function autopilot() {
  const g = gull.position;
  let target = 0, bestD = 1e9;
  for (const s of simits) { const d = g.z - (s.th ? s.th.cz : s.z); if (!s.taken && d > 2 && d < 30 && d < bestD) { bestD = d; target = s.th ? s.th.cx : s.x; } }
  for (const o of obstacles) { const d = g.z - o.z; if (d > -1 && d < 14 && Math.abs(target - o.x) < o.hw + 1.4) target = o.x + (target > o.x ? 1 : -1) * (o.hw + 1.8); }
  tx = clamp(target + Math.sign(lean) * push, -LANE * 1.25, LANE * 1.25);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
setQuality(qLock >= 0 ? qLock : MOBILE ? 1 : 2);
// telefon belleği sıkışınca GPU bağlamı düşebilir (siyah ya da bozuk ekran): uçuşu durdur, geri gelince sayfayı tazele
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); if (state === 'play') pause(); });
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

showTitle();
// shader ön ısıtma: oyun sırasında ilk kez görünen malzemeler takılma yapmasın
{
  const warm = new THREE.Group();
  warm.add(makeKite(), makeSimit(true), ...['magnet', 'shield', 'double'].map(makePowerUp), makeGull(true), makeGull('red'), makeGull('blue'), new THREE.Mesh(salonGeo(0).glass, glassMat), new THREE.Mesh(BRIDGE, bridgeMat), new THREE.Mesh(FLINE, flineMat), new THREE.Mesh(DOLPHIN, vcMat), new THREE.Mesh(FISH, vcMat), makeSimitCart(), makeSimitStand(), makeMaiden(), makePirateShip().g, makeFalls(), ...[0, 1, 2].flatMap(i => [new THREE.Mesh(tankerGeo(i), vcMat), new THREE.Mesh(cargoGeo(i), vcMat)]), ...FERRY_TYPES.flatMap(t => [new THREE.Mesh(t.chim, vcMat), ...t.lengths.map(L => new THREE.Mesh(ferryGeo(L, t.id), vcMat))]));
  warm.position.set(0, FLY_Y, -20); scene.add(warm);
  puff(0, FLY_Y, -20, true); sparkle(warm.position, 1);
  chunks.emit(warm.position, 1, { speed: 1, life: 0.1, size: 0.01, color: 0xffffff });
  flats.emit(warm.position, 1, { speed: 1, life: 0.1, size: 0.01, color: 0xffffff });
  updateFx(0);
  try { renderer.compile(scene, camera); } catch (e) {}
  scene.remove(warm);
}
requestAnimationFrame(frame);

window.__game = {
  get state() { return state; }, get score() { return total(); }, get simits() { return simitCount; }, get z() { return gull.position.z; }, get x() { return gull.position.x; },
  get fps() { return Math.round(fpsSmooth); }, get quality() { return quality; }, get dist() { return dist; }, get combo() { return combo; }, get powers() { return { ...pw }; },
  get wallet() { return wallet; }, setWallet: n => { wallet = n; store.set(KEY_WALLET, n); }, get look() { return JSON.parse(JSON.stringify(look)); },
  openWardrobe, closeWardrobe, get missions() { return JSON.parse(JSON.stringify(missions)); },
  get canRevive() { return state === 'over' && !$('reviveBtn').classList.contains('hidden'); }, get revived() { return revives > 0; }, revive: () => askRevive(),
  get fish() { return fish; }, setFish, fishRevive, get fishCost() { return fishCost(); }, setFishOdds: (spawn, ok) => { fishSpawn = spawn; fishCatch = ok; },
  get movers() { return decor.filter(d => d.calm).map(d => ({ x: +d.mesh.position.x.toFixed(1), z: +d.z.toFixed(1), vz: d.vz })); }, get decorX() { return [...decor.filter(d => !d.calm), ...land].map(d => ({ x: +d.mesh.position.x.toFixed(1), z: +d.z.toFixed(1) })); },
  get fishes() { return fishes.map(f => ({ u: +f.u.toFixed(2), done: f.done, ahead: +(gull.position.z - f.z).toFixed(1), ax: +f.ax.toFixed(2) })); },
  addFish: (ahead = 40, x = 0) => { const dir = 1, mm = new THREE.Mesh(FISH, vcMat); mm.visible = false; scene.add(mm); fishes.push({ mesh: mm, dir, ax: x, z: gull.position.z - ahead, w: 3.2, T: 0.85, lag: 0, u: -1, done: false, spin: 0, splT: 0 }); },
  setTx: v => (tx = v), autopilot, startGame, showTitle, crash: (why = 'bacaya') => { const s = pw.shield, i = invuln, gd = god; pw.shield = 0; invuln = 0; god = false; crash(why); god = gd; if (state === 'play') { pw.shield = s; invuln = i; } },
  get rivals() { return rivals.map(r => r.kind); }, addRival: (kind, ahead = 30, x = 0, sw = 2) => addRival(gull.position.z - ahead, x, sw, kind), get weather() { return weather; }, get ferries() { return ferries.map(f => ({ zFront: f.zFront, zBack: f.zBack, x: f.x })); },
  get farStop() { return farStop; },
  get city() { return city.id; },
  get imbats() { return { w: +imbatW.toFixed(2), gx: +gull.position.x.toFixed(2), list: imbats.map(b => ({ z0: b.z0, z1: b.z1, dir: b.dir, xs: b.sims.map(s => +s.x.toFixed(1)), got: b.sims.filter(s => s.taken).length })) }; },
  setCity(id) { useCity(cityOf(id)); applyWeather(weather); resetWorld(false); if (state === 'title') renderRouteMap(); },
  get marks() { return marks.map(k => ({ kind: k.kind, m: -k.z / 2, passed: k.passed })); }, get vs() { return vs && { ...vs }; },
  get route() { return { next: STOPS[stopI] ? STOPS[stopI].name : null, at: stopM[stopI] ?? null, dist, z: gull.position.z, piers: piers.map(p => ({ i: p.i, ahead: +(gull.position.z - p.z).toFixed(1) })) }; },
  warp: m => { dist = m; gull.position.z = -2 * m; }, // deneme: uçuşu ileri sar
  get pirates() { return pirates.map(p => ({ z: p.z, ahead: +(gull.position.z - p.z).toFixed(1), gapX: +p.gapX.toFixed(2), xs: p.os.map(q => +q.o.x.toFixed(2)), thrown: { ...thrownStat } })); },
  get falls() { return { lift: +fallsLift.toFixed(2), w: +fallsW.toFixed(2), y: +gull.position.y.toFixed(2), list: falls.map(f => ({ z: f.z, zA: f.zA, zB: f.zB, dir: f.dir, ahead: +(gull.position.z - f.zA).toFixed(1) })) }; },
  get people() { return { all: people.length, sit: people.filter(p => p.sit).length, feed: people.filter(p => p.feeder).length, hold: people.filter(p => p.simit).length }; },
  get salons() { return ferries.filter(f => f.salon).map(f => ({ x: +f.salon.x.toFixed(2), ahead: +(gull.position.z - f.salon.z).toFixed(1) })); },
  get bins() { return bins.map(b => ({ x: +b.s.x.toFixed(1), ahead: +(gull.position.z - b.z).toFixed(1), u: +b.s.bin.u.toFixed(2), taken: !!b.s.taken })); },
  get cats() { return cats.map(c => ({ ahead: +(gull.position.z - c.z).toFixed(1), done: c.done })); },
  get bridges() { return bridges.map(b => ({ ahead: +(gull.position.z - b.z).toFixed(1), done: b.done, path: b.path, gx: +gull.position.x.toFixed(2) })); },
  get dolphins() { return dolphins.map(f => ({ ax: +f.ax.toFixed(1), x: +f.mesh.position.x.toFixed(1), y: +f.mesh.position.y.toFixed(1), u: +f.u.toFixed(2), got: f.got, ahead: +(gull.position.z - f.z).toFixed(1) })); },
  get crossers() { return crossers.map(c => ({ x: +c.o.x.toFixed(1), ahead: +(gull.position.z - c.z).toFixed(1) })); },
  get thrown() { return { ...thrownStat, live: simits.filter(s => s.th).length, boats: boats.length, scene: scene.children.length, flying: simits.filter(s => s.th && !s.taken && s.th.u > 0.45 && s.th.u < 0.8).length }; },
  get mem() { return { ...renderer.info.memory, programs: renderer.info.programs.length }; },
  pause, resume, get turns() { return turns.map(u => ({ ...u })); }, get bank() { return lean; }, get heading() { return heading; }, get speed() { return speed; }, addPoints: n => (points += n), power: (k) => { pw[k] = dur(k); renderPowers(); }, get ups() { return { ...ups }; }, setGod: (b) => (god = !!b), setQuality,
};
