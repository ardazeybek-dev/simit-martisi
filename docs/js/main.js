import * as THREE from 'three';
import { rand, pick, clamp, damp, store, vcMat, canvasTex } from './util.js';
import { renderer, scene, camera, sky, far, updateWater, waveAt, placeSun, sunLight, BEND, BEND2, setHeading, applyWeather } from './scene.js';
import { pickWeather, setWeatherFx, updateWeatherFx } from './weather.js';
import { makeGull, flapGull, makeSimit, makePerson, ferryGeo, FERRY_LENGTHS, CHIMNEY, MAST, FLAG, flagMat, makeKite, BUOY, makeChevron, makeSimitBoat, makeSimitPiece, makeFishingBoat, makeSailboat, makeYacht, CRUISE, cruiseMat, MAIDEN, BENCH, DOLPHIN, BRIDGE, BRIDGE_Y, bridgeMat, ROD_TIP, FISHERS, FLINE, flineMat, BOBBER, SALON_LEN, SALON_GAP, SALON_TOP, salonGeo, glassMat, makePowerUp, makeShieldOrb, POWER, ICON_SVG, DECK, GEO, COSTUMES, COSTUME_SVG, dressGull, paintGull } from './models.js';
import { chunks, flats, sparkle, puff, updateSpeedLines, popText, updateFx, clearFx } from './fx.js';
import { audio, sfx } from './audio.js';

const $ = id => document.getElementById(id);
// çeviri: js/i18n.js (window.I18N); portal kopyasında reklam köprüsü window.PF ayrıca gelir
const tr = s => window.I18N.t(s);
const FLY_Y = 5.15, LANE = 6.2, COMBO_T = 1.7, SPEED_MAX = 44, GEAR_M = 300; // GEAR_M: her kaç metrede "Hızlanıyor!"
const CAMS = ['near', 'far', 'top', 'eye'];
const KEY_BEST = 'simit-martisi-best', KEY_TUT = 'simit-martisi-tut', KEY_SET = 'simit-martisi-settings';
const KEY_WALLET = 'simit-martisi-wallet', KEY_LOOK = 'simit-martisi-look', KEY_MIS = 'simit-martisi-missions', KEY_DAILY = 'simit-martisi-daily', KEY_UP = 'simit-martisi-upgrades';

// ---------------- ayarlar ----------------
const settings = Object.assign({ sfx: true, music: true, vibe: true, cam: 'near' }, store.get(KEY_SET, {}));
audio.set({ sfx: settings.sfx, music: settings.music });
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
let ferries = [], obstacles = [], simits = [], rivals = [], kites = [], powerups = [], people = [], decor = [], smokes = [], boats = [], crossers = [], dolphins = [], bridges = [];
let bridgeZ = 0;
let genZ = 0, segCount = 0, sceneryZ = 0, maidenZ = 0, cruiseZ = 0, land = [];
const difficulty = () => clamp(-genZ / 650, 0, 5);

// ---------------- virajlar ----------------
// Mantık düz koridorda kalır, viraj yalnızca çizimde yay olur (scene.js). Virajda martı dışa savrulur;
// simitler içe kıvrılan yarış çizgisine dizilir, çizginin çoğunu kapan sapan gibi fırlar.
// Ayar: TURN_ANG (dönüş açısı, rad), TURN_LEN (viraj boyu), TURN_GAP (iki viraj arası), PUSH (savrulma).
const TURNS_ON = new URLSearchParams(location.search).get('turn') !== '0'; // ?turn=0 → düz Boğaz (karşılaştırma için)
const TURN_ANG = [0.38, 0.6], TURN_LEN = [80, 110], TURN_GAP = [340, 520], S_CHANCE = 0.3, PUSH = 1;
let turns = [], turnZ = 0, planYaw = 0, heading = 0, lean = 0, push = 0, sling = 0, slingV = 0, bendOn = 0;
function planTurns(limit) {
  if (!TURNS_ON) return;
  while (turnZ > limit) {
    // ilk viraj kalkıştan ~5 sn sonra; S-viraj: hemen ters yöne
    const last = turns[turns.length - 1], ess = !!last && !last.ess && Math.random() < S_CHANCE;
    const z0 = turnZ - (ess ? rand(14, 22) : last ? rand(...TURN_GAP) : rand(150, 190)), len = rand(...TURN_LEN), ang = rand(...TURN_ANG);
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
  simits.push({ mesh: m, x, y, z, free: true, gold });
}

// ---------------- fırlatılan simitler ----------------
// Açık suda simitler havada asılı durmaz: kenardaki simitçi, simidini bölüp parçalarını martıya atar. Atış martının uzaklığına göre
// zamanlanır; simit kavis çizip yakalama noktasına martıyla aynı anda iner, kaçarsa denize düşer. Suda halka iniş yerini gösterir.
// Ayar: THROW_T (uçuş süresi, sn), THROW_H (kavis yüksekliği). ?throw=0 → eski, havada duran simitler.
const THROW_ON = new URLSearchParams(location.search).get('throw') !== '0';
const BRIDGE_SOON = new URLSearchParams(location.search).has('bridge'); // ?bridge → ilk köprü hemen gelir (deneme için)
const THROW_T = [1.05, 1.35], THROW_H = [2.4, 3.6];
const RING = new THREE.RingGeometry(0.5, 0.72, 20);
const thrownStat = { caught: 0, missed: 0 };
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
function throwVolleys(z0, len, first) {
  const end = z0 - len + 5;
  let z = z0 - (first ? 24 : 7), x = rand(-2.5, 2.5), side = pick([-1, 1]);
  while (z > end) {
    const n = 3 + ((Math.random() * 3) | 0), bz = z - (n - 1) * 1.7 + rand(-2, 2);
    const b = makeSimitBoat(side); b.g.position.set(side * rand(9.5, 11), 0, bz); b.g.rotation.y = rand(-0.3, 0.3); scene.add(b.g);
    const bt = { ...b, z: bz, hand: 0, thrown: 0 };
    boats.push(bt); decor.push({ mesh: b.g, z: bz, ph: Math.random() * 6 });
    for (let i = 0; i < n && z > end; i++) {
      addThrown(bt, x, z, !first && Math.random() < 0.035);
      z -= rand(2.8, 4.2);
      x = clamp(x + rand(-2.4, 2.4), -LANE + 0.8, LANE - 0.8);
    }
    z -= rand(4, 9); side = -side;
  }
}
function addThrown(bt, cx, cz, gold) {
  const m = makeSimitPiece(gold); m.visible = false; m.position.set(cx, FLY_Y, cz); scene.add(m);
  const ring = new THREE.Mesh(RING, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.2, cz); scene.add(ring);
  simits.push({ mesh: m, x: cx, y: FLY_Y, z: cz, free: true, gold, th: { bt, cx, cz, T: rand(...THROW_T), H: rand(...THROW_H), u: -1, p0: new THREE.Vector3(), ring } });
}
function dropThrown(s) { if (s.th) scene.remove(s.th.ring); }
function flySimits(dt) {
  const g = gull.position;
  for (const s of simits) {
    const th = s.th;
    if (!th) continue;
    if (s.taken || s.pulled) { if (th.ring.parent) scene.remove(th.ring); continue; }
    if (th.u < 0) {
      th.ring.position.y = waveAt(th.cx, th.cz, t) + 0.12;
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
      const w = waveAt(s.x, s.z, t);
      if (s.y < w) {
        s.taken = true; scene.remove(s.mesh); scene.remove(th.ring); thrownStat.missed++;
        chunks.emit(tmp.set(s.x, w + 0.1, s.z), 6, { speed: 2.5, up: 1, life: 0.6, size: 0.09, color: [0xffffff, 0xcfe9f2], gravity: 12, spin: 0.3 });
        continue;
      }
    }
    th.ring.position.y = waveAt(th.cx, th.cz, t) + 0.12; th.ring.scale.setScalar(1 - Math.min(u, 1) * 0.35);
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.rotation.x += dt * 7; s.mesh.rotation.z += dt * 4;
  }
  for (const b of boats) {
    if (b.hand <= 0) continue;
    b.hand -= dt;
    b.person.mesh.rotation.z = (b.g.position.x > 0 ? 1 : -1) * Math.sin(Math.max(0, b.hand) / 0.45 * Math.PI) * 0.3; // atış hamlesi
    b.person.simit.visible = b.hand < 0.1 && b.tray.some(m => m.visible);
  }
}

function spawnGap(first, fixLen) {
  const d = difficulty();
  const len = fixLen || (first ? (tutorialPending ? 70 : 50) : rand(32, 56)), z0 = genZ;
  const ph = Math.random() * 6, amp = rand(1.5, 4.2);
  if (THROW_ON && !(first && tutorialPending)) throwVolleys(z0, len, first);
  else for (let z = z0 - 7; z > z0 - len + 5; z -= 3.4) {
    const x = clamp(Math.sin((z0 - z) * 0.09 + ph) * amp, -LANE + 0.5, LANE - 0.5);
    addSimit(x, FLY_Y, z, !first && Math.random() < 0.035);
  }
  if (!first) {
    const n = d < 0.35 ? 0 : Math.min(4, 1 + Math.floor(d * 0.9));
    for (let i = 0; i < n; i++) addRival(z0 - rand(10, len - 6), rand(-4, 4), rand(1.2, 3.2));
    if (d > 0.7 && Math.random() < 0.35 + d * 0.08) {
      const nk = d > 2.5 && Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < nk; i++) {
        const k = makeKite(), bx = rand(-3.5, 3.5), z = z0 - rand(10, len - 8);
        k.position.set(bx, FLY_Y + 0.2, z); scene.add(k);
        kites.push({ g: k, bx, z, ph: Math.random() * 6, sw: rand(1.5, 3) });
      }
    }
    // yelkenli koridoru yandan keser: martıya yaklaştıkça karşıya geçer, direği ve yelkeni engel
    if (d > 0.35 && len > 34 && Math.random() < 0.28 + d * 0.07) {
      const side = pick([-1, 1]), z = z0 - rand(14, len - 12), xa = rand(-3.6, 3.6), k = rand(0.2, 0.32);
      const b = makeSailboat(); b.rotation.y = -side * Math.PI / 2; scene.add(b);
      const o = { x: xa + side * 60 * k, z, hw: 1.9, hd: 0.45, top: FLY_Y + 4, kind: 'yelkene', passed: false };
      obstacles.push(o); crossers.push({ mesh: b, o, xa, side, k, z, ph: Math.random() * 6 });
    }
    // yunus sürüsü: önce suda yalnız yüzgeçleri görünür; martı yaklaşınca sırayla koridoru yandan atlayarak keser.
    // Tepe noktası martının geçeceği ana denk gelir: tam üstünden geçen "Yunus!" bonusu alır, kombo süresi tazelenir. Çarpmak yok.
    if (d > 0.15 && len > 30 && Math.random() < 0.38) {
      const dir = pick([-1, 1]), z = z0 - rand(12, len - 10), ax = rand(-3, 3), n = 2 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0, dz = 0; i < n; i++, dz += rand(1.6, 2.8)) {
        const m = new THREE.Mesh(DOLPHIN, vcMat); m.castShadow = true; m.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(m);
        dolphins.push({ mesh: m, dir, ax: ax + rand(-0.9, 0.9), z: z - dz, w: rand(4.2, 5.6), T: rand(0.95, 1.25), lag: rand(-0.08, 0.14), u: -1, got: false, ph: Math.random() * 6 });
      }
    }
    if (segCount > 2 && Math.random() < 0.42) {
      const kind = pick(d > 1.5 ? ['shield', 'shield', 'magnet', 'double'] : ['magnet', 'double', 'shield']);
      const z = z0 - len * 0.5, x = clamp(Math.sin((z0 - z) * 0.09 + ph + 1.6) * amp, -4.5, 4.5);
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
function addRival(z, bx, sw, kind) {
  const d = difficulty();
  kind = kind || (d > 1 && Math.random() < 0.28 ? 'red' : d > 0.6 && Math.random() < 0.35 ? 'blue' : 'grey');
  if (kind === 'red') z -= 18; // hızlı gelir: daha uzaktan başlar
  const r = makeGull(kind); r.scale.setScalar(0.8); r.rotation.y = Math.PI;
  r.position.set(bx, FLY_Y, z); scene.add(r);
  rivals.push({ mesh: r, kind, bx, z, ph: Math.random() * 6, sw, hit: false, spin: 0, tx: bx, zt: 0 });
}
// viraj: açık deniz; simitler dıştan girip içe kıvrılan yarış çizgisinde, tepede altın simit; dış kenarda ok tabelaları
function spawnTurn(tn) {
  const z0 = genZ, end = tn.z1 - 6, len = tn.z0 - tn.z1;
  const lineX = z => tn.dir * (-1.6 + 5 * Math.sin(Math.PI * clamp((tn.z0 - z) / len, 0, 1)));
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
    addRival(z, lineX(z) - tn.dir * 2.5, rand(1, 2), 'grey');
  }
  tn.built = true; genZ = end;
}

// Galata Köprüsü: tabliyenin iki yanındaki balıkçıların misinaları suya sarkar (ön sıra, arka sıra), aralıklar düzensiz.
// Martı iplerin arasından geçer, ipe değerse oltaya takılır. Simitler iki sıradaki boşlukları birleştiren yolu gösterir.
// Arka sırayı da geçince "Köprü altı!" bonusu. Arada bir (bridgeZ), açık su yerine gelir.
function spawnBridge() {
  const z0 = genZ, bz = z0 - 22, tipY = BRIDGE_Y + 1 + ROD_TIP.y, rz = 2.55 + ROD_TIP.z;
  const g = new THREE.Group(); g.position.z = bz; scene.add(g);
  const deck = new THREE.Mesh(BRIDGE, bridgeMat); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  // köprünün içine düşen kıyı dekorunu kaldır (tekneler, yolcu gemisi, Kız Kulesi)
  decor = decor.filter(d => (Math.abs(d.z - bz) < 12 && Math.abs(d.mesh.position.x) > 7 ? (scene.remove(d.mesh), false) : true));
  land = land.filter(l => (Math.abs(l.z - bz) < 60 ? (scene.remove(l.mesh), false) : true));
  const br = { g, z: bz, lines: [], done: false }, gaps = [];
  for (const s of [1, -1]) { // 1: martıya bakan ön sıra, -1: arka sıra
    const xs = [];
    for (let x = -LANE - 0.2 + rand(0, 1.4); x < LANE + 0.6; x += rand(1.9, 3.2)) xs.push(x);
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
  const wide = row => { const w = row.filter(r => r.w > 1.15 && Math.abs(r.c) < 4.8); return w.length ? w : row; };
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
  const L = pick(FERRY_LENGTHS), x0 = rand(-1.2, 1.2), zc = genZ - L / 2 - 2;
  const g = new THREE.Group(); g.position.set(x0, 0, zc); scene.add(g);
  const hull = new THREE.Mesh(ferryGeo(L), vcMat); hull.castShadow = hull.receiveShadow = true; g.add(hull);
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
  if (d > 0.4 && Math.random() < 0.38) {
    const tx = pick([-1, 0, 1]), sz = rand(-2, 4), geo = salonGeo(tx);
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
    if (salon && Math.abs(cz - salon.sz) < SALON_LEN / 2 + 2.5) continue; // bacalar salonun dışında
    const c = new THREE.Mesh(CHIMNEY, vcMat); c.position.set(cx, DECK, cz); c.castShadow = c.receiveShadow = true; g.add(c);
    obstacle(cx, cz, 0.95, 0.95, DECK + 4.7, 'bacaya');
    const dark = d > 1.2 && Math.random() < clamp((d - 1) * 0.22, 0, 0.55);
    chims.push({ x: x0 + cx, z: zc + cz, dark, t: Math.random() });
    if (dark) smokes.push({ x: x0 + cx, z0: zc + cz + 1.3, z1: zc + cz + 7.5, hw: 1.6, hit: false });
  }
  // banklar küpeşte boyunca: oturanlar denize bakar, çoğunun elinde çay, simit yok (yem değil, manzara)
  const mine = [];
  const seat = (px, lz, mode, hold) => {
    const p = makePerson(hold, undefined, mode); p.mesh.position.set(px, DECK + 0.05, lz);
    if (mode) p.mesh.rotation.y = (px > 0 ? 1 : -1) * Math.PI / 2 + rand(-0.15, 0.15);
    g.add(p.mesh); p.wz = zc + lz; people.push(p); mine.push(p);
    return p;
  };
  for (let i = 0, nb = 1 + ((Math.random() * 3) | 0); i < nb; i++) {
    const s = pick([-1, 1]), lz = rand(-L / 2 + 12, L / 2 - 6);
    if (blocked.some(b => Math.hypot(b.x - s * 3.2, b.z - lz) < b.r + 1)) continue;
    const bench = new THREE.Mesh(BENCH, vcMat); bench.position.set(s * 3.2, DECK, lz); bench.rotation.y = s > 0 ? 0 : Math.PI; bench.castShadow = true; g.add(bench);
    blocked.push({ x: s * 3.2, z: lz, r: 1.5 });
    for (const dz of [-0.55, 0.55]) if (Math.random() < 0.75) { const p = seat(s * 3.2, lz + dz, 'sit', false); p.mesh.position.y = DECK + 0.05; p.mesh.scale.setScalar(1); }
  }
  // simit ikram eden yolcu: küpeşteden simidi martıya uzatır; ondan almak serbest, kızmaz, sevinir (bonus)
  if (d > 0.2 && Math.random() < 0.55) {
    const s = pick([-1, 1]), lz = rand(-L / 2 + 12, L / 2 - 6);
    if (!blocked.some(b => Math.hypot(b.x - s * 3.35, b.z - lz) < b.r)) { seat(s * 3.35, lz, 'feed', true); blocked.push({ x: s * 3.35, z: lz, r: 1.2 }); }
  }
  for (let lz = -L / 2 + 10; lz < L / 2 - 3; lz += rand(2.2, 3)) {
    for (const lx of [-2.9, -1.2, 0.5, 2.2]) {
      if (Math.random() < 0.45) continue;
      const px = lx + rand(-0.4, 0.4);
      if (blocked.some(b => Math.hypot(b.x - px, b.z - lz) < b.r)) continue;
      // bir kısmı simitsiz: eli boş, telefonda, el sallıyor
      seat(px, lz, '', Math.random() < 0.38 + d * 0.03);
    }
  }
  g.updateMatrixWorld(true);
  for (const p of mine) {
    if (!p.simit) continue;
    const gold = Math.random() < 0.02;
    if (gold) p.simit.material = makeSimit(true).material;
    p.simit.getWorldPosition(tmp);
    simits.push({ mesh: p.simit, x: tmp.x, y: tmp.y, z: tmp.z, person: p, gold });
  }
  ferries.push({ group: g, x: x0, zFront, zBack, ph: Math.random() * 6, chims, flag });
  genZ = zFront - 2;
}

// ---------------- kıyı dekoru: koridorun dışında balıkçı tekneleri, arada bir yakından geçen Kız Kulesi ----------------
function spawnScenery(limit) {
  while (sceneryZ > limit) {
    sceneryZ -= rand(22, 52);
    if (Math.random() < 0.85) {
      const side = pick([-1, 1]), r = Math.random();
      const b = r < 0.5 ? makeFishingBoat(side) : r < 0.78 ? makeSailboat() : makeYacht();
      b.position.set(side * rand(15, r < 0.5 ? 30 : 40), 0, sceneryZ); b.rotation.y = rand(-0.5, 0.5) + (r >= 0.5 && Math.random() < 0.5 ? Math.PI : 0);
      scene.add(b); decor.push({ mesh: b, z: sceneryZ, ph: Math.random() * 6 });
    }
    if (sceneryZ < cruiseZ) {
      cruiseZ = sceneryZ - rand(380, 700);
      const c = new THREE.Mesh(CRUISE, cruiseMat);
      c.position.set(rand(62, 88), 0, sceneryZ - 40); c.scale.setScalar(rand(1.4, 1.7)); c.rotation.y = rand(-0.25, 0.25) + (Math.random() < 0.5 ? Math.PI : 0);
      scene.add(c); land.push({ mesh: c, z: sceneryZ - 40 });
    }
    if (sceneryZ < maidenZ) {
      maidenZ = sceneryZ - rand(1100, 1700);
      const m = new THREE.Mesh(MAIDEN, vcMat), side = pick([-1, 1]);
      m.position.set(side * rand(34, 40), 0, sceneryZ - 20); m.rotation.y = side > 0 ? 0 : Math.PI; m.castShadow = true;
      scene.add(m); land.push({ mesh: m, z: sceneryZ - 20 });
    }
  }
}

function clearWorld() {
  for (const l of land) scene.remove(l.mesh);
  land = [];
  for (const f of ferries) scene.remove(f.group);
  for (const s of simits) { if (s.free) scene.remove(s.mesh); dropThrown(s); }
  for (const a of [...rivals.map(r => r.mesh), ...kites.map(k => k.g), ...powerups.map(p => p.g), ...decor.map(d => d.mesh)]) scene.remove(a);
  for (const c of crossers) scene.remove(c.mesh);
  for (const f of dolphins) scene.remove(f.mesh);
  for (const b of bridges) scene.remove(b.g);
  ferries = []; obstacles = []; simits = []; rivals = []; kites = []; powerups = []; people = []; decor = []; smokes = []; boats = []; crossers = []; dolphins = []; bridges = [];
  clearFx();
}
function generate(limit) {
  planTurns(limit - 200); spawnScenery(limit);
  while (genZ > limit) {
    const tn = turns.find(u => !u.built && u.z0 > genZ - 75); // yaklaşan virajın öncesini düz suyla doldur
    if (!tn) { segCount % 2 === 0 ? (genZ < bridgeZ ? spawnBridge() : spawnGap(segCount === 0)) : spawnFerry(); segCount++; }
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
  bridges = bridges.filter(b => (b.z > behind + 10 ? (scene.remove(b.g), false) : true));
  rivals = rivals.filter(r => (r.mesh.position.z > behind ? (scene.remove(r.mesh), false) : true));
  kites = kites.filter(k => (k.z > behind ? (scene.remove(k.g), false) : true));
  powerups = powerups.filter(p => (p.z > behind ? (scene.remove(p.g), false) : true));
  decor = decor.filter(d => (d.z > behind ? (scene.remove(d.mesh), false) : true));
  land = land.filter(l => (l.z > behind + 30 ? (scene.remove(l.mesh), false) : true));
  people = people.filter(p => p.wz < behind);
  turns = turns.filter(u => u.z1 < behind);
}
function deckUnder(x, z) {
  for (const f of ferries) if (z < f.zBack - 1 && z > f.zFront + 2 && Math.abs(x - f.x) < 4) return true;
  return false;
}

// ---------------- oyun durumu ----------------
let state = 'loading';
let speed = 15, playT = 0, points = 0, simitCount = 0, goldCount = 0, combo = 0, bestCombo = 0, comboT = 0, dist = 0;
let crashT = 0, vy = 0, cause = '', trauma = 0, hitStop = 0, timeScale = 1, flapPh = 0, flapPow = 0.5, flapBurst = 0;
let tx = 0, vx = 0, cryT = 4, invuln = 0, smokeT = 0, overLock = 0, countdown = 0, god = false, splashed = false, revived = false;
const pw = { magnet: 0, shield: 0, double: 0 };
// güçlendirme yükseltmeleri: simitle alınır, her seviye süreyi tabanın %25'i kadar uzatır (Subway Surfers usulü)
const UP_COST = [80, 160, 300, 500, 800];
const ups = { magnet: 0, shield: 0, double: 0 };
{ const u = store.get(KEY_UP, {}) || {}; for (const k in ups) ups[k] = clamp(u[k] | 0, 0, UP_COST.length); }
const dur = k => POWER[k].dur * (1 + ups[k] * 0.25);
let best = +store.get(KEY_BEST, 0) || 0;
// simit cüzdanı: normal simit 1, altın simit 5 değerinde; banked = bu uçuştan cüzdana geçen
let wallet = Math.max(0, +store.get(KEY_WALLET, 0) || 0), banked = 0;
const look = { owned: [], on: [] };
{ const l = store.get(KEY_LOOK, {}), ok = id => COSTUMES.some(c => c.id === id);
  look.owned = (Array.isArray(l.owned) ? l.owned : []).filter(ok); look.on = (Array.isArray(l.on) ? l.on : []).filter(id => look.owned.includes(id)); }
let tutorialPending = !store.get(KEY_TUT, false);
const keys = {};
let gear = 0, gearAt = GEAR_M;
// hava (weather.js): yağmurda rüzgâr esintisi martıyı yana iter, karda simit yemezsen üşürsün, siste ufuk kısalır
let weather = 'clear', wind = 0, gustT = 0, gustDir = 1, gustNext = 8, boltNext = 10, hornNext = 12, warmth = 1, shownWarm = -1;
const GUST = 8, COLD_S = 28; // GUST: esinti gücü, COLD_S: hiç simit yemeden kaç saniyede donarsın
const run = { near: 0, power: 0, steal: 0, turn: 0, dolphin: 0 }; // görevler için uçuş sayaçları

function resetWorld(newWeather = true) {
  clearWorld(); genZ = -8; segCount = 0; sceneryZ = 10; maidenZ = rand(-500, -300); cruiseZ = rand(-120, -40);
  bridgeZ = BRIDGE_SOON ? -90 : -rand(650, 900);
  turns = []; turnZ = 0; planYaw = 0; heading = 0; lean = 0; push = 0; sling = 0; slingV = 0;
  gull.position.set(0, FLY_Y, 0); gull.rotation.set(0, 0, 0); tx = 0; vx = 0;
  speed = 15; playT = 0; points = 0; simitCount = 0; goldCount = 0; banked = 0; combo = 0; bestCombo = 0; comboT = 0; dist = 0;
  crashT = 0; vy = 0; trauma = 0; hitStop = 0; timeScale = 1; invuln = 0; smokeT = 0; splashed = false; revived = false;
  pw.magnet = pw.shield = pw.double = 0;
  run.near = run.power = run.steal = run.turn = run.dolphin = 0; gear = 0; gearAt = GEAR_M;
  if (newWeather) { weather = pickWeather(); applyWeather(weather); setWeatherFx(weather); } // başlıkta görülen hava uçuşta da sürer
  wind = 0; gustT = 0; gustNext = rand(6, 9); boltNext = rand(4, 9); hornNext = rand(5, 10); warmth = 1; shownWarm = -1;
  show('warm', false); $('warm').classList.remove('cold');
  generate(-280);
  camera.position.set(0, FLY_Y + 5.4, 13.5);
}

// ---------------- arayüz ----------------
const ui = {
  score: $('score'), simits: $('simits'), dist: $('dist'), combo: $('combo'), mult: $('mult'), comboRing: $('comboRing'),
  hud: $('hud'), powers: $('powers'), vignette: $('vignette'), flash: $('flash'),
};
let shownScore = -1, shownSimit = -1, shownDist = -1, shownMult = 0;
function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
function bump(el, cls = 'bump') { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const total = () => points + Math.floor(dist / 10);
const fmt = n => n.toLocaleString(window.I18N.lang === 'tr' ? 'tr-TR' : 'en-US');

function showTitle() {
  state = 'title'; bank(); resetWorld(); refillMissions();
  document.querySelector('.legend').classList.toggle('hidden', !tutorialPending);
  document.querySelector('.menu-side').classList.toggle('hidden', tutorialPending);
  renderMissions($('titleMis')); renderMenuBadges();
  show('missionsPanel', false); show('dailyPanel', false); show('upPanel', false);
  ui.powers.textContent = '';
  dressing = false; show('wardrobe', false);
  $('titleWallet').textContent = fmt(wallet);
  show('title'); show('over', false); show('pause', false); show('hud', false); show('settings', false); show('countdown', false);
  $('titleBest').textContent = best ? `${tr('Rekor')} ${fmt(best)}` : tr('İlk uçuşun!');
  audio.music(true);
  if (!tutorialPending && dailyState().ready) setTimeout(() => state === 'title' && !dressing && !menuModal() && openDaily(), 700); // günün ilk açılışında ödül kendiliğinden gelir
}
function startGame() {
  audio.unlock();
  sfx.click();
  refillMissions();
  resetWorld(state !== 'title'); state = 'play';
  qWarm = 4;
  show('title', false); show('over', false); show('hud'); show('pause', false);
  shownScore = shownSimit = shownDist = -1; shownMult = 0;
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
    sfx.shieldBreak(); vibrate(40); popText(tr('Kalkan!'), gull.position, 'blue'); renderPowers();
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
  state = 'over'; overLock = 0.8;
  const final = total();
  const isBest = final > best, prevBest = best;
  if (isBest) { best = final; store.set(KEY_BEST, best); }
  const msg = { 'rakip martıya': 'Martı kavgası!', 'uçurtmaya': 'Uçurtmaya dolandın!', 'bacaya': 'Bacaya çarptın!', 'direğe': 'Direğe çarptın!', 'yelkene': 'Yelkene takıldın!', 'oltaya': 'Oltaya takıldın!', 'cama': 'Cama çarptın!' };
  $('overTitle').textContent = tr(msg[cause] || 'Pat!');
  $('stSimit').textContent = fmt(simitCount) + (goldCount ? ` (+${goldCount} ${tr('altın')})` : '');
  $('stDist').textContent = `${fmt(Math.round(dist))} m`;
  $('stCombo').textContent = `${bestCombo}`;
  ui.powers.textContent = '';
  $('overBest').textContent = isBest ? tr('Önceki rekoru geçtin') : `${tr('Rekor')} ${fmt(best)}`;
  $('newRecord').classList.toggle('hidden', !isBest);
  if (!revived) countMission('runs');
  checkMissions(); store.set(KEY_MIS, missions); bank();
  renderMissions($('overMis'));
  $('overEarn').innerHTML = `<span>+${fmt(banked)} <svg class="ico"><use href="#i-simit"/></svg></span><span>${tr('Cüzdan')} ${fmt(wallet)}</span>`;
  show('over'); show('hud', false); hideTutorial();
  // ikinci şans: iyi bir uçuşta, uçuş başına bir kez (portalda ödüllü reklamla)
  const canRevive = !revived && final >= 250 && final >= prevBest * 0.4 && rewardReady();
  $('reviveLbl').textContent = tr(window.PF ? 'Reklam izle, devam et' : 'İkinci şans');
  $('reviveBtn').disabled = false;
  show('reviveBtn', canRevive); show('reviveNote', false);
  if (canRevive && window.PF && window.PF.offerReward) window.PF.offerReward();
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
// ---------------- cüzdan ve kostümler ----------------
function bank() {
  const earned = simitCount + goldCount * 4, gain = earned - banked;
  if (gain > 0) { banked = earned; wallet += gain; store.set(KEY_WALLET, wallet); }
}
function applyLook() {
  for (const c of COSTUMES) if (outfit[c.id]) outfit[c.id].visible = look.on.includes(c.id);
  paintGull(gull, COSTUMES.find(c => c.slot === 'body' && look.on.includes(c.id))?.id || 'player');
}
applyLook();
let dressing = false, showcase = 0;
function openWardrobe() {
  if (state !== 'title') return;
  dressing = true; $('wardNote').textContent = tr('Simitler cüzdanına girer; onlarla martına kostüm al.');
  renderWardrobe(); show('title', false); show('wardrobe');
}
function closeWardrobe() {
  dressing = false; show('wardrobe', false);
  if (state === 'title') { $('titleWallet').textContent = fmt(wallet); show('title'); }
}
function renderWardrobe() {
  $('walletN').textContent = fmt(wallet);
  const box = $('costumes'); box.textContent = '';
  for (const c of COSTUMES) {
    const own = look.owned.includes(c.id), on = look.on.includes(c.id);
    const b = document.createElement('button');
    b.className = 'cos' + (on ? ' on' : '') + (own ? ' own' : wallet < c.price ? ' poor' : '');
    b.dataset.id = c.id;
    b.innerHTML = `<span class="cos-i">${COSTUME_SVG[c.id]}</span><b></b><small></small>`;
    b.querySelector('b').textContent = tr(c.name);
    const tag = b.querySelector('small');
    if (own) tag.textContent = tr(on ? 'Giyili' : 'Giy');
    else tag.innerHTML = `<svg class="ico"><use href="#i-simit"/></svg>${fmt(c.price)}`;
    b.addEventListener('click', e => { e.stopPropagation(); wear(c, b); });
    box.appendChild(b);
  }
}
// alınmamışsa satın al ve giy; giyiliyse çıkar; aynı yuvada (baş, göz, boyun) tek kostüm
function wear(c, el) {
  if (!look.owned.includes(c.id)) {
    if (wallet < c.price) { sfx.click(); bump(el, 'shake'); $('wardNote').textContent = `${tr('Yeterli simit yok')}: ${fmt(c.price - wallet)}`; return; }
    wallet -= c.price; look.owned.push(c.id); store.set(KEY_WALLET, wallet); sfx.record(); vibrate([20, 30, 20]);
  } else if (look.on.includes(c.id)) {
    look.on = look.on.filter(id => id !== c.id); sfx.click();
    store.set(KEY_LOOK, look); applyLook(); renderWardrobe(); return;
  } else sfx.power();
  look.on = look.on.filter(id => COSTUMES.find(x => x.id === id).slot !== c.slot).concat(c.id);
  store.set(KEY_LOOK, look); applyLook(); renderWardrobe(); flapBurst = 1;
  sparkle(gull.position, 24, 0xffe7a8, 4, 0.6, 0.3);
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
  { k: 'simit', text: 'Bir uçuşta {n} simit kap', n: [20, 30, 45, 60], r: [15, 25, 40, 60] },
  { k: 'near', text: 'Bir uçuşta {n} kez kıl payı geç', n: [3, 5, 8], r: [20, 30, 45] },
  { k: 'gold', text: 'Bir uçuşta {n} altın simit kap', n: [2, 3], r: [30, 50] },
  { k: 'dist', text: 'Bir uçuşta {n} m uç', n: [300, 500, 800], r: [15, 30, 50] },
  { k: 'combo', text: '{n} simitlik seri yap', n: [8, 12, 16], r: [20, 30, 45] },
  { k: 'power', text: 'Bir uçuşta {n} güçlendirme topla', n: [2, 3], r: [20, 35] },
  { k: 'steal', text: 'Bir uçuşta yolcuların elinden {n} simit kap', n: [8, 15], r: [20, 35] },
  { k: 'score', text: 'Bir uçuşta {n} puan yap', n: [800, 1500, 3000], r: [20, 35, 60] },
  { k: 'turn', text: 'Bir uçuşta {n} kusursuz viraj al', n: [2, 3, 5], r: [20, 30, 45] },
  { k: 'dolphin', text: 'Bir uçuşta {n} yunusun üstünden geç', n: [3, 6], r: [20, 35] },
  { k: 'runs', text: '{n} kez uç', n: [3, 5], r: [15, 25], total: true },
  { k: 'simitTotal', text: 'Toplam {n} simit topla', n: [100, 200], r: [30, 50], total: true },
];
const misDef = k => MISSIONS.find(d => d.k === k);
let missions = (store.get(KEY_MIS, []) || []).filter(m => m && misDef(m.k) && m.n > 0 && m.r > 0).slice(0, 3);
function runVal(k) {
  return { simit: simitCount, gold: goldCount, dist: Math.floor(dist), combo: bestCombo, score: total(), near: run.near, power: run.power, steal: run.steal, turn: run.turn, dolphin: run.dolphin }[k] || 0;
}
const misProgress = m => (misDef(m.k).total ? m.p || 0 : runVal(m.k));
const misText = m => tr(misDef(m.k).text).replace('{n}', fmt(m.n));
function refillMissions() {
  missions = missions.filter(m => !m.done);
  while (missions.length < 3) {
    const d = pick(MISSIONS.filter(x => (TURNS_ON || x.k !== 'turn') && !missions.some(m => m.k === x.k))), i = (Math.random() * d.n.length) | 0;
    missions.push({ k: d.k, n: d.n[i], r: d.r[i], p: 0, done: false });
  }
  store.set(KEY_MIS, missions);
}
function countMission(k, n = 1) { for (const m of missions) if (!m.done && m.k === k) m.p = (m.p || 0) + n; }
function checkMissions() {
  for (const m of missions) {
    if (m.done || misProgress(m) < m.n) continue;
    m.done = true; wallet += m.r; store.set(KEY_WALLET, wallet); store.set(KEY_MIS, missions);
    if (state === 'play') {
      sfx.gold(); vibrate([20, 30, 20]);
      popText(`${tr('Görev tamam!')} +${m.r}`, tmp2.set(gull.position.x, gull.position.y + 2.4, gull.position.z), 'gold big');
    }
  }
}
function renderMissions(box) {
  box.textContent = '';
  for (const m of missions) {
    const v = Math.min(m.n, misProgress(m));
    const d = document.createElement('div');
    d.className = 'mis' + (m.done ? ' done' : '');
    d.innerHTML = `<span class="mis-t"></span><span class="mis-r">+${m.r}<svg class="ico"><use href="#i-simit"/></svg></span><i class="mis-bar"><b style="width:${(v / m.n) * 100}%"></b></i>`;
    d.querySelector('.mis-t').textContent = m.done || !v ? misText(m) : `${misText(m)} · ${fmt(v)}/${fmt(m.n)}`;
    box.appendChild(d);
  }
}
// menüdeki rozetler: biten görev sayısı, alınmamış günlük ödül
function renderMenuBadges() {
  const done = missions.filter(m => !m.done && misProgress(m) >= m.n).length, left = missions.filter(m => !m.done).length;
  $('misBadge').textContent = left; show('misBadge', left > 0 && !done);
  show('dailyDot', dailyState().ready);
}
// ---------------- günlük ödül ----------------
// Her gün bir kez; üst üste gelinen günler ödülü büyütür, bir gün kaçarsa seri baştan başlar.
const DAILY = [20, 30, 40, 60, 80, 100, 150];
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
    el.innerHTML = `<span></span><b>${fmt(r)}<svg class="ico"><use href="#i-simit"/></svg></b>`;
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
    $('titleWallet').textContent = fmt(wallet); bump($('titleWallet').parentNode);
    sfx.gold(); vibrate([20, 30, 20]); renderMenuBadges();
  }
  show('dailyPanel', false);
}
function rewardReady() { return !window.PF || !window.PF.canReward || window.PF.canReward(); }
function askRevive() {
  if (state !== 'over' || revived || overLock > 0) return;
  $('reviveBtn').disabled = true;
  const done = ok => {
    if (state !== 'over') return;
    if (ok) { revive(); return; }
    show('reviveBtn', false); $('reviveNote').textContent = tr('Reklam şu an yok, sonra tekrar dene'); show('reviveNote');
  };
  if (window.PF && window.PF.rewarded) window.PF.rewarded(done); else done(true);
}
// çarptığı yerden kalkanla devam: dünya aynı kalır, 3-2-1 sayımıyla başlar
function revive() {
  revived = true;
  gull.position.y = FLY_Y; gull.rotation.set(0, 0, 0); gull.visible = true;
  tx = gull.position.x; vx = 0; crashT = 0; vy = 0; splashed = false; hitStop = 0; timeScale = 1; trauma = 0;
  combo = 0; comboT = 0;
  pw.shield = dur('shield'); invuln = 2.2; // çarptığı bacanın içinden çıkarken kalkan harcanmasın
  show('over', false); show('hud'); hideTutorial();
  shownScore = shownSimit = shownDist = -1; shownMult = 0;
  ui.combo.classList.remove('on'); renderPowers(); updateHud();
  sfx.power(); audio.music(true); audio.duck(false);
  popText(tr('İkinci şans!'), tmp.set(gull.position.x, gull.position.y + 1.6, gull.position.z), 'blue');
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
  if (simitCount !== shownSimit) { ui.simits.textContent = fmt(simitCount); shownSimit = simitCount; }
  const dm = Math.floor(dist);
  if (dm !== shownDist) { ui.dist.textContent = fmt(dm); shownDist = dm; }
}
const mult = () => Math.min(5, 1 + Math.floor(combo / 4));
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
  tx = clamp((clientX / innerWidth - 0.5) / 0.4, -1.25, 1.25) * LANE;
  if (tutT > 0) {
    const side = Math.sign(tx) * (Math.abs(tx) > 2 ? 1 : 0);
    if (side && side !== tutLastSide) { tutMoves++; tutLastSide = side; }
  }
}
const menuModal = () => !$('upPanel').classList.contains('hidden') || !$('missionsPanel').classList.contains('hidden') || !$('dailyPanel').classList.contains('hidden') || !$('settings').classList.contains('hidden');
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
onBtn('wardrobeBtn', () => openWardrobe());
onBtn('playBtn', () => { if (state === 'title') startGame(); });
onBtn('missionsBtn', () => { renderMissions($('titleMis')); show('missionsPanel'); });
onBtn('closeMissions', () => show('missionsPanel', false));
onBtn('upsBtn', () => { $('upNote').textContent = tr('Simitle güçlendirmeleri yükselt: her seviye süreyi uzatır.'); renderUps(); show('upPanel'); });
onBtn('closeUps', () => { show('upPanel', false); $('titleWallet').textContent = fmt(wallet); });
onBtn('dailyBtn', () => openDaily());
onBtn('claimBtn', () => claimDaily());
onBtn('closeWardrobe', () => closeWardrobe());
onBtn('pauseBtn', () => pause());
onBtn('resumeBtn', () => resume());
onBtn('quitBtn', () => { audio.resume(); showTitle(); });
onBtn('settingsBtn', () => { show('settings'); syncToggles(); });
onBtn('closeSettings', () => show('settings', false));
onBtn('soundBtn', () => { settings.sfx = settings.music = !(settings.sfx || settings.music); saveSettings(); });
onBtn('shareBtn', async () => {
  const text = tr('Simit Martısı\'nda {s} puan yaptım, {n} simit kaptım! Sen kaç yaparsın?').replace('{s}', fmt(total())).replace('{n}', fmt(simitCount));
  const url = location.href.split('#')[0].split('?')[0];
  try {
    if (navigator.share) await navigator.share({ title: document.title, text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); $('shareBtn').textContent = tr('Kopyalandı'); setTimeout(() => ($('shareBtn').textContent = tr('Paylaş')), 1800); }
  } catch (e) {}
});
for (const el of document.querySelectorAll('[data-toggle]')) {
  el.addEventListener('click', e => { e.stopPropagation(); const k = el.dataset.toggle; settings[k] = !settings[k]; saveSettings(); sfx.click(); if (k === 'vibe') vibrate(30); });
}
for (const el of document.querySelectorAll('[data-cam]')) {
  el.addEventListener('click', e => { e.stopPropagation(); settings.cam = el.dataset.cam; saveSettings(); sfx.click(); });
}
for (const el of document.querySelectorAll('[data-lang]')) {
  el.addEventListener('click', e => { e.stopPropagation(); if (el.dataset.lang === window.I18N.lang) return; settings.lang = el.dataset.lang; store.set(KEY_SET, settings); sfx.click(); location.reload(); });
}
function saveSettings() { store.set(KEY_SET, settings); audio.set({ sfx: settings.sfx, music: settings.music }); syncToggles(); }
function syncToggles() {
  for (const el of document.querySelectorAll('[data-toggle]')) el.setAttribute('aria-pressed', settings[el.dataset.toggle] ? 'true' : 'false');
  $('soundUse').setAttribute('href', settings.sfx || settings.music ? '#i-sound' : '#i-mute');
  for (const el of document.querySelectorAll('[data-cam]')) el.setAttribute('aria-pressed', el.dataset.cam === settings.cam ? 'true' : 'false');
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
let quality = 2, qFrames = 0, qTime = 0, fpsSmooth = 60, qWarm = 4, qGood = 0, qMax = 2;
// ?q=0|1|2 kaliteyi sabitler (otomatik ayar kapanır) — ölçüm ve test için
const qLock = /^[012]$/.test(new URLSearchParams(location.search).get('q') || '') ? +new URLSearchParams(location.search).get('q') : -1;
function setQuality(q) {
  quality = q;
  renderer.setPixelRatio(q === 2 ? DPR : q === 1 ? Math.min(DPR, 1.5) : Math.min(DPR, 1.15));
  const sh = q > 0, size = q === 2 ? 1024 : 512; // orta kalitede de gölge var, sadece daha kaba
  if (sunLight.shadow.mapSize.x !== size) { sunLight.shadow.mapSize.set(size, size); sunLight.shadow.map?.dispose(); sunLight.shadow.map = null; }
  if (renderer.shadowMap.enabled !== sh) {
    renderer.shadowMap.enabled = sh; sunLight.castShadow = sh;
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => (m.needsUpdate = true)); });
  }
  resize();
}

// ---------------- döngü ----------------
const clock = new THREE.Clock();
let t = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
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
      speed = Math.min(SPEED_MAX, 15 + 17 * (1 - Math.exp(-playT / 60)) + playT * 0.04) + slingV;
      if (dist >= gearAt) { gearAt += GEAR_M; gear++; gearUp(); }
    } else { speed = 15; autopilot(); }
    // viraj: içindeyken martı dışa savrulur (push), gövde ve kamera içe yatar (lean)
    const cur = turns.find(u => g.z < u.z0 && g.z > u.z1);
    lean = damp(lean, cur ? cur.dir : 0, 3, dt);
    push = Math.abs(lean) * (0.9 + speed * 0.045) * PUSH;
    if (state === 'play') weatherTick(dt);
    const txl = LANE * 1.25;
    if (keys.ArrowLeft || keys.KeyA) tx = clamp(tx - 14 * dt, -txl, txl);
    if (keys.ArrowRight || keys.KeyD) tx = clamp(tx + 14 * dt, -txl, txl);
    const dz = speed * dt; g.z -= dz; if (state === 'play') dist += dz / 2;
    if (cur) heading += cur.k * dz * bendOn; else heading *= Math.exp(-dt / 30); // ufuk, düzlükte yavaşça toparlanır
    // kritik sönümlü yay: hızlı ama yumuşak takip
    const k = 140, c = 2 * Math.sqrt(k) * 0.95;
    vx += ((clamp(tx - Math.sign(lean) * push + (state === 'play' ? wind * 0.32 : 0), -LANE, LANE) - g.x) * k - vx * c) * dt;
    g.x += vx * dt;
    gull.rotation.z = damp(gull.rotation.z, clamp(-vx * 0.07 - lean * 0.5, -0.85, 0.85), 10, dt) + (weather === 'snow' && warmth < 0.25 && state === 'play' ? Math.sin(t * 55) * 0.05 : 0); // titreme
    gull.rotation.y = damp(gull.rotation.y, clamp(-vx * 0.025 - lean * 0.28, -0.45, 0.45), 10, dt);
    gull.rotation.x = damp(gull.rotation.x, -0.05 + Math.sin(t * 1.1) * 0.03, 4, dt);
    g.y = FLY_Y + Math.sin(t * 2.2) * 0.12;
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
  flySimits(dt);

  // ---- toplama, güçlendirme, çarpışma ----
  if (state === 'play' || state === 'title') {
    const magnet = pw.magnet > 0 && state === 'play';
    for (const s of simits) {
      if (s.taken || (s.th && s.th.u < 0)) continue; // henüz atılmamış simit tepside
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
      if (Math.abs(s.z - g.z) > 1.35 || Math.abs(s.x - g.x) > 1.3 || Math.abs(s.y - g.y) > 1.7) continue;
      s.taken = true;
      if (s.free) scene.remove(s.mesh); else s.mesh.visible = false;
      if (state === 'play') takeSimit(s);
    }
    if (state === 'play') {
      for (const p of powerups) {
        if (p.taken || Math.abs(p.z - g.z) > 1.6 || Math.abs(p.x - g.x) > 1.6) continue;
        p.taken = true; scene.remove(p.g);
        pw[p.kind] = dur(p.kind); renderPowers(); run.power++;
        hitStop = 0.05; trauma = Math.min(1, trauma + 0.2);
        sparkle(tmp.set(p.x, p.y, p.z), 40, new THREE.Color(POWER[p.kind].color).getHex(), 7, 0.8, 0.5);
        sfx.power(); vibrate(25);
        popText(tr(POWER[p.kind].name), tmp.set(p.x, p.y + 1, p.z), 'power');
      }
      for (const o of obstacles) {
        const dx = Math.abs(g.x - o.x), dzo = Math.abs(g.z - o.z);
        if (g.y < o.top && dx < o.hw + 0.55 && dzo < o.hd + 0.5) crash(o.kind);
        else if (!o.passed && g.z < o.z - o.hd) {
          o.passed = true;
          if (dx < o.hw + 1.35 && state === 'play') nearMiss(o.x);
        }
      }
      for (const r of rivals) {
        if (r.hit) continue;
        const rp = r.mesh.position;
        if (Math.abs(rp.x - g.x) < 1.15 && Math.abs(rp.z - g.z) < 1.1) {
          if (pw.shield > 0 || invuln > 0 || god) { // kalkanla rakibi savur
            if (pw.shield > 0) crash('rakip martıya');
            r.hit = true; r.spin = rp.x > g.x ? 1 : -1;
            flats.emit(rp, 12, { speed: 5, life: 1.2, size: 0.4, color: [0x6f7682, 0x474d58], gravity: 2, flutter: 4 });
          } else crash('rakip martıya');
        }
      }
      for (const k of kites) if (Math.abs(k.g.position.x - g.x) < 0.9 && Math.abs(k.z - g.z) < 0.6) crash('uçurtmaya');
      for (const s of smokes) {
        if (!s.hit && g.z < s.z1 && g.z > s.z0 && Math.abs(g.x - s.x) < s.hw) {
          s.hit = true; smokeT = 1.4;
          if (combo > 0) { combo = 0; comboT = 0; }
          sfx.cough(); popText(tr('Öhö öhö!'), tmp.set(g.x, g.y + 1.4, g.z), 'smoke'); vibrate(30);
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
    if (r.kind === 'red') { // dalış: hızlı ve düz, hafif kayar
      p.z += 15 * dt;
      p.x = r.bx + Math.sin(t * 0.9 + r.ph) * 0.5; r.mesh.rotation.z = Math.cos(t * 0.9 + r.ph) * 0.15; r.mesh.rotation.x = 0.18;
      flapGull(r.mesh, t * 16 + r.ph, 1);
    } else if (r.kind === 'blue') { // zikzak: rastgele aralıklarla yeni hedef, sabit hızla keskin dönüş
      p.z += 5 * dt;
      if ((r.zt -= dt) <= 0) { r.zt = rand(0.3, 0.95); r.tx = clamp(r.bx + rand(-3.6, 3.6), -LANE, LANE); }
      const dx = r.tx - p.x, step = Math.min(Math.abs(dx), 7.5 * dt) * Math.sign(dx);
      p.x += step; r.mesh.rotation.z = damp(r.mesh.rotation.z, -Math.sign(dx) * (Math.abs(dx) > 0.1 ? 0.55 : 0), 10, dt);
      flapGull(r.mesh, t * 13 + r.ph, 1);
    } else {
      p.z += 5 * dt; p.x = r.bx + Math.sin(t * 1.4 + r.ph) * r.sw;
      r.mesh.rotation.z = Math.cos(t * 1.4 + r.ph) * 0.35;
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
  for (const d of decor) { d.mesh.position.y = waveAt(d.mesh.position.x, d.z, t) - 0.1; d.mesh.rotation.z = Math.sin(t * 1.7 + d.ph) * 0.12; }
  for (const c of crossers) { // martı geldiğinde xa'da olacak şekilde yandan kayar
    c.o.x = c.xa + c.side * Math.max(-40, g.z - c.z) * c.k;
    c.mesh.position.set(c.o.x, waveAt(c.o.x, c.z, t) - 0.1, c.z); c.mesh.rotation.x = Math.sin(t * 1.3 + c.ph) * 0.06;
  }
  for (const b of bridges) {
    for (const l of b.lines) {
      const r = Math.sin(t * 1.1 + l.ph) * 0.009 + Math.sin(t * 2.3 + l.ph * 2) * 0.004; // misina rüzgârda hafif salınır
      l.line.rotation.z = r; l.o.x = l.x - r * (l.line.position.y - FLY_Y);
      l.bob.position.set(l.x - r * l.line.position.y, waveAt(l.x, b.z + l.line.position.z, t) - 0.08, l.line.position.z);
    }
    if (!b.done && state === 'play' && g.z < b.z - 6) {
      b.done = true;
      const gain = 30 * mult(); points += gain;
      sfx.power(); vibrate(20);
      popText(`${tr('Köprü altı!')} +${gain}`, tmp2.set(g.x, g.y + 2, g.z), 'power');
    }
  }
  { // kamera tabliyenin üstündeyse (uzak, kuş bakışı) köprü altında martı görünsün diye tabliye saydamlaşır
    const high = settings.cam === 'far' || settings.cam === 'top', near = bridges.some(b => Math.abs(g.z - b.z) < 16);
    bridgeMat.opacity = damp(bridgeMat.opacity, high && near ? 0.28 : 1, 6, dt);
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
  for (const s of simits) if (s.free && !s.taken && !s.pulled && s.mesh.visible) { if (!s.th) s.mesh.rotation.y = t * 2.4 + s.z; if (s.gold && Math.random() < dt * 8) sparkle(s.mesh.position, 1, 0xffe08a, 1, 0.6, 0.4); }
  updateFx(dt);

  // ---- kalkan / sis ----
  shieldOrb.visible = (pw.shield > 0 || (invuln > 0 && Math.sin(t * 40) > 0)) && !(settings.cam === 'eye' && showcase < 0.02 && !dressing); // gözden bakarken kalkan içten görünmesin
  // martının gözünden uçarken gövde, şapka ve gözlük kameranın önüne girmesin; kanatlar görünür kalır
  const eyeCam = settings.cam === 'eye' && !dressing && (state === 'play' || state === 'countdown');
  gull.userData.body.visible = !eyeCam;
  for (const c of COSTUMES) if (outfit[c.id]) outfit[c.id].visible = !eyeCam && look.on.includes(c.id);
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
  // kamera seçimi (Ayarlar): near = varsayılan; [arkada, yukarıda] uzaklıkları
  const cam = CAMS.includes(settings.cam) ? settings.cam : 'near';
  const [back, up] = cam === 'far' ? [land ? 16 : 19, land ? 7.5 : 9.5] : cam === 'top' ? [land ? 5 : 6, land ? 15 : 18] : cam === 'eye' ? [-1, 0.42] : [land ? 11 : 13.5, land ? 4.2 : 5.4];
  const followZ = state === 'dead' || state === 'over' ? camera.position.z - back : g.z;
  let cx = cam === 'eye' ? g.x : g.x * 0.85 - lean * 1.3, cy = (cam === 'eye' && state !== 'dead' && state !== 'over' ? g.y : FLY_Y) + up, cz = followZ + back;
  showcase = damp(showcase, state === 'title' && !dressing ? 1 : 0, state === 'title' || settings.cam === 'eye' ? 4 : 1.6, realDt);
  if (dressing) { cx = g.x + (land ? 1.2 : 1.6); cy = FLY_Y + 1.5; cz = g.z - 5.2; } // kostüm paneli: önden yakın çekim
  else if (showcase > 0.001) {
    // oyun kamerasının martıya göre açısından vitrin açısına yay çizerek geç: kamera martının içinden geçmez
    const a0 = Math.atan2(cx - g.x, cz - g.z), r0 = Math.hypot(cx - g.x, cz - g.z);
    const a1 = Math.PI - 0.5 + Math.sin(t * 0.23) * 0.35 + Math.sin(t * 0.61 + 1) * 0.12, r1 = land ? 7.5 : 9.5;
    const k = showcase * showcase * (3 - 2 * showcase), a = a0 + (a1 - a0) * k, r = r0 + (r1 - r0) * k;
    cx = g.x + Math.sin(a) * r; cz = g.z + Math.cos(a) * r; cy = cy + (FLY_Y + (land ? 1.8 : 2.6) - cy) * k;
  }
  camera.position.x = damp(camera.position.x, cx, 5, realDt);
  camera.position.y = damp(camera.position.y, cy, 5, realDt);
  camera.position.z = damp(camera.position.z, cz, showcase > 0.001 ? 8 : 12, realDt);
  const eye = cam === 'eye' && !dressing && showcase < 0.02;
  if (eye) camera.position.set(cx, cy, cz); // martının gözü: gecikme olursa kamera gövdenin içine düşer
  if (dressing) camera.lookAt(g.x - (land ? 2.2 : 0), g.y - (land ? 0.2 : 1.6), g.z); // yatayda martı solda, panel sağda
  else if (showcase > 0.001) {
    const k = showcase * showcase * (3 - 2 * showcase);
    camera.lookAt(g.x * 0.92 + lean * 2.6 + (g.x - g.x * 0.92 - lean * 2.6) * k, FLY_Y - (land ? 0.2 : 0.6) + (g.y + (land ? 0.3 : 0.2) - FLY_Y + (land ? 0.2 : 0.6)) * k, followZ - 12 + (g.z + 12 - followZ) * k);
  }
  else if (cam === 'top') camera.lookAt(g.x * 0.9 + lean * 2, FLY_Y - 1.5, followZ - 9);
  else if (eye) camera.lookAt(g.x + lean * 3 + vx * 0.08, cy - 0.9, followZ - 20);
  else if (cam === 'far') camera.lookAt(g.x * 0.92 + lean * 2.6, FLY_Y - 0.6, followZ - 16);
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
  if (firstFrame) { firstFrame = false; const l = $('loader'); l.classList.add('done'); setTimeout(() => l.remove(), 700); }
}

function angry(p) {
  if (!p) return;
  p.angry = 1.6;
  if (!p.feeder) p.mesh.geometry = p.angryGeo(); // ikramcı kızmaz, sevinçten zıplar
}
const cheers = ['Afiyet olsun!', 'Al bakalım!', 'Hadi gel!'];
// simidi kapılan yolcu tipine göre bağırır (amca, dede, teyze...); bazen yanındaki biri de laf atar (çocuklar sevinir)
const SHOUTS = {
  amca: ['Oha ulen!', 'Ulennn!', 'Hoop hemşerim!', 'Bırak onu ulen!', 'Simidim gitti ya!', 'Martıya bak martıya!', 'Yuh artık!', 'Allah Allah!', 'Çayın yanına neyle yicem?', 'Ulen martı!', 'Bu martı sabıkalı!'],
  dede: ['Ahhh simidim…', 'Evlat, o benim!', 'Hey gidi günler…', 'Bizim zamanımızda martılar böyle değildi!', 'Gözlüğüm nerde?', 'Vay terbiyesiz!', 'Bastonla kovarım ha!', 'Hayırsız martı!'],
  teyze: ['Ay simidim!', 'Aaa! Martıya bak!', 'Ay kalbim!', 'Vay hınzır!', 'Ayol!', 'Torunumun simidiydi o!', 'Kış kış!', 'Ay yüreğim ağzıma geldi!'],
  abla: ['Yaaa!', 'Videoya çekecektim!', 'Bu ne hız?', 'Aşk olsun!', 'İnanamıyorum!', 'Hikâyeye atıyorum bunu!'],
  genc: ['Kanka simidim!', 'Oha!', 'Efsane martı!', 'Hoop!', 'Bro?!', 'Çakal martı!'],
};
const BYSTAND = {
  amca: ['Ahahah gördün mü?', 'Hah, oh olsun!', 'Bizimkini de alma ha!'],
  dede: ['Tövbe tövbe…', 'Martılar azdı!'],
  teyze: ['Aman simidini sakla!', 'Ay gördün mü?'],
  abla: ['Çektin mi onu?', 'Ahaha!'],
  genc: ['Ahahaha!', 'Efsane!'],
  cocuk: ['Annee martı!', 'Bir daha yap!', 'Martı abi bana da!', 'Yaşasın martı!'],
};
let shoutT = 0;
function shout(p, x, y, z) {
  const now = performance.now();
  if (now - shoutT < 380) return; // balonlar üst üste binmesin
  shoutT = now;
  popText(tr(pick(SHOUTS[p.kind] || SHOUTS.amca)), tmp2.set(x, y + 1.3, z), 'shout');
  if (Math.random() < 0.35) { // yakındaki biri de laf atar
    const by = people.find(o => o !== p && !o.feeder && Math.abs(o.wz - p.wz) < 3.5 && BYSTAND[o.kind] && o.mesh.parent);
    if (by) { const at = by.mesh.getWorldPosition(new THREE.Vector3()); at.y += 2.6; setTimeout(() => state === 'play' && popText(tr(pick(BYSTAND[by.kind])), at, 'shout by'), 420); }
  }
}
function takeSimit(s) {
  combo = comboT > 0 ? combo + 1 : 1; comboT = COMBO_T; bestCombo = Math.max(bestCombo, combo);
  const m = mult() * (pw.double > 0 ? 2 : 1);
  const base = s.gold ? 50 : 10, gain = base * m;
  points += gain; simitCount++; countMission('simitTotal');
  if (s.turn) s.turn.got++;
  if (s.th) thrownStat.caught++;
  if (weather === 'snow') warmth = Math.min(1, warmth + (s.gold ? 0.35 : 0.08)); // sıcak simit ısıtır
  if (s.person) run.steal++;
  if (s.gold) {
    goldCount++; sfx.gold(); hitStop = 0.06; trauma = Math.min(1, trauma + 0.25); vibrate(20);
    sparkle(tmp.set(s.x, s.y, s.z), 34, 0xffd35a, 6, 0.8, 0.3);
    chunks.emit(tmp, 10, { speed: 4, life: 0.8, size: 0.09, color: [0xffd35a, 0xfff0b0], gravity: 8 });
  } else {
    sfx.catch(combo);
    sparkle(tmp.set(s.x, s.y, s.z), 8, 0xffe7a8, 3, 0.45, 0.2);
    chunks.emit(tmp, 7, { speed: 3, life: 0.7, size: 0.075, color: [0xc97835, 0xf6e2b3, 0xb8642a], gravity: 9 });
    vibrate(8);
  }
  popText(`+${gain}`, tmp.set(s.x, s.y + 0.8, s.z), s.gold ? 'gold big' : m > 1 ? 'gold' : '');
  bump(ui.score);
  flapBurst = Math.max(flapBurst, 0.4);
  if (s.person && s.person.feeder) { angry(s.person); points += 15 * m; popText(`${tr(pick(cheers))} +${15 * m}`, tmp.set(s.x, s.y + 1.4, s.z), 'gold'); }
  else if (s.person) { angry(s.person); if (Math.random() < 0.8) shout(s.person, s.x, s.y, s.z); }
}
// viraj çıkışı: çizgideki simitlerin çoğu alındıysa bonus ve sapan gibi fırlama
function judgeTurn(u) {
  if (state !== 'play' || u.total < 3) return;
  const r = u.got / u.total;
  if (r >= 0.8) {
    const gain = 40 * mult() * (pw.double > 0 ? 2 : 1);
    points += gain; run.turn++; sling = 1.5;
    sfx.sling(); vibrate([15, 30, 25]); trauma = Math.min(1, trauma + 0.3); flapBurst = 1;
    popText(`${tr('Kusursuz viraj!')} +${gain}`, tmp2.set(gull.position.x, gull.position.y + 2, gull.position.z), 'gold big');
    sparkle(gull.position, 30, 0xffe7a8, 6, 0.7, 0.3);
  } else if (r >= 0.5) {
    points += 10; popText(`${tr('Güzel viraj')} +10`, tmp2.set(gull.position.x, gull.position.y + 1.8, gull.position.z), 'near');
  }
}
function weatherTick(dt) {
  if (weather === 'rain') {
    gustNext -= dt;
    if (gustNext <= 0) {
      gustT = rand(1.4, 2.2); gustDir = pick([-1, 1]); gustNext = rand(7, 12); sfx.gust();
      popText(`${gustDir > 0 ? '→' : '←'} ${tr('Rüzgâr!')}`, tmp2.set(gull.position.x, gull.position.y + 2, gull.position.z), 'near');
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
    if (was >= 0.25 && warmth < 0.25) { sfx.shiver(); popText(tr('Üşüyorsun!'), tmp2.set(gull.position.x, gull.position.y + 1.8, gull.position.z), 'blue'); }
    if (warmth <= 0) { // dondun: kombo sıfırlanır, biraz ısınıp devam
      warmth = 0.45; combo = 0; comboT = 0; trauma = Math.min(1, trauma + 0.35); sfx.shiver(); vibrate([30, 30, 30]);
      popText(tr('Dondun!'), tmp2.set(gull.position.x, gull.position.y + 2, gull.position.z), 'blue');
      sparkle(gull.position, 30, 0xdff6ff, 4, 0.8, 0.6);
    }
    const w = Math.round(warmth * 50);
    if (w !== shownWarm) {
      if (shownWarm < 0) show('warm');
      shownWarm = w; $('warm').querySelector('i').style.transform = `scaleX(${warmth})`; $('warm').classList.toggle('cold', warmth < 0.25);
    }
  }
}
function gearUp() {
  sfx.power(); trauma = Math.min(1, trauma + 0.15); flapBurst = 1;
  popText(`${tr('Hızlanıyor!')} ${gear + 1}`, tmp2.set(gull.position.x, gull.position.y + 2.2, gull.position.z), 'power');
}
function splash(x, z, n) {
  chunks.emit(tmp2.set(x, waveAt(x, z, t) + 0.1, z), n, { speed: 3, up: 2.2, life: 0.7, size: 0.1, color: [0xffffff, 0xcfe9f2], gravity: 12, spin: 0.3 });
}
// yunusun tepe noktasının üstünden geçmek: küçük bonus + kombo süresi tazelenir (zincir kopmaz)
function dolphinBonus(f) {
  const gain = 15 * mult();
  points += gain; run.dolphin++;
  if (combo > 0) comboT = COMBO_T;
  sfx.near(); vibrate(15);
  popText(`${tr('Yunus!')} +${gain}`, tmp2.set(gull.position.x, gull.position.y + 1.6, gull.position.z), 'near');
  sparkle(tmp2.set(f.mesh.position.x, f.mesh.position.y + 0.5, f.z), 12, 0xcff0ff, 3.5, 0.5);
}
function nearMiss(x) {
  const gain = 5 * mult();
  points += gain; run.near++;
  sfx.near(); trauma = Math.min(1, trauma + 0.12);
  popText(`${tr('Kıl payı!')} +${gain}`, tmp2.set(gull.position.x, gull.position.y + 1.6, gull.position.z), 'near');
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
setQuality(qLock >= 0 ? qLock : 2);

showTitle();
// shader ön ısıtma: oyun sırasında ilk kez görünen malzemeler takılma yapmasın
{
  const warm = new THREE.Group();
  warm.add(makeKite(), makeSimit(true), ...['magnet', 'shield', 'double'].map(makePowerUp), makeGull(true), makeGull('red'), makeGull('blue'), new THREE.Mesh(salonGeo(0).glass, glassMat), new THREE.Mesh(BRIDGE, bridgeMat), new THREE.Mesh(FLINE, flineMat), new THREE.Mesh(DOLPHIN, vcMat));
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
  get canRevive() { return state === 'over' && !$('reviveBtn').classList.contains('hidden'); }, get revived() { return revived; }, revive: () => askRevive(),
  setTx: v => (tx = v), autopilot, startGame, showTitle, crash: (why = 'bacaya') => { const s = pw.shield, i = invuln, gd = god; pw.shield = 0; invuln = 0; god = false; crash(why); god = gd; if (state === 'play') { pw.shield = s; invuln = i; } },
  get rivals() { return rivals.map(r => r.kind); }, addRival: (kind, ahead = 30, x = 0) => addRival(gull.position.z - ahead, x, 2, kind), get weather() { return weather; }, get ferries() { return ferries.map(f => ({ zFront: f.zFront, zBack: f.zBack, x: f.x })); },
  get people() { return { all: people.length, sit: people.filter(p => p.sit).length, feed: people.filter(p => p.feeder).length, hold: people.filter(p => p.simit).length }; },
  get bridges() { return bridges.map(b => ({ ahead: +(gull.position.z - b.z).toFixed(1), done: b.done, op: +bridgeMat.opacity.toFixed(2), path: b.path, gx: +gull.position.x.toFixed(2) })); },
  get dolphins() { return dolphins.map(f => ({ ax: +f.ax.toFixed(1), x: +f.mesh.position.x.toFixed(1), y: +f.mesh.position.y.toFixed(1), u: +f.u.toFixed(2), got: f.got, ahead: +(gull.position.z - f.z).toFixed(1) })); },
  get crossers() { return crossers.map(c => ({ x: +c.o.x.toFixed(1), ahead: +(gull.position.z - c.z).toFixed(1) })); },
  get thrown() { return { ...thrownStat, live: simits.filter(s => s.th).length, boats: boats.length, scene: scene.children.length, flying: simits.filter(s => s.th && !s.taken && s.th.u > 0.45 && s.th.u < 0.8).length }; },
  get mem() { return { ...renderer.info.memory, programs: renderer.info.programs.length }; },
  pause, resume, get turns() { return turns.map(u => ({ ...u })); }, get bank() { return lean; }, get heading() { return heading; }, get speed() { return speed; }, addPoints: n => (points += n), power: (k) => { pw[k] = dur(k); renderPowers(); }, get ups() { return { ...ups }; }, setGod: (b) => (god = !!b), setQuality,
};
