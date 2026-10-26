import * as THREE from 'three';
import { rand, pick, clamp, damp, store, vcMat, canvasTex } from './util.js';
import { renderer, scene, camera, sky, far, updateWater, waveAt, placeSun, sunLight } from './scene.js';
import { makeGull, flapGull, makeSimit, makePerson, ferryGeo, CHIMNEY, MAST, FLAG, flagMat, makeKite, BUOY, makePowerUp, makeShieldOrb, POWER, ICON_SVG, DECK, GEO } from './models.js';
import { chunks, flats, sparkle, puff, updateSpeedLines, popText, updateFx, clearFx } from './fx.js';
import { audio, sfx } from './audio.js';

const $ = id => document.getElementById(id);
const FLY_Y = 5.15, LANE = 6.2, COMBO_T = 1.7;
const KEY_BEST = 'simit-martisi-best', KEY_TUT = 'simit-martisi-tut', KEY_SET = 'simit-martisi-settings';

// ---------------- ayarlar ----------------
const settings = Object.assign({ sfx: true, music: true, vibe: true }, store.get(KEY_SET, {}));
audio.set({ sfx: settings.sfx, music: settings.music });
const vibrate = ms => { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

// ---------------- oyuncu ----------------
const gull = makeGull();
gull.scale.setScalar(0.95);
scene.add(gull);
const shieldOrb = makeShieldOrb(); shieldOrb.visible = false; gull.add(shieldOrb);
const blob = new THREE.Mesh(GEO.blob, new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.3, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2; scene.add(blob);

// ---------------- dünya ----------------
let ferries = [], obstacles = [], simits = [], rivals = [], kites = [], powerups = [], people = [], decor = [], smokes = [];
let genZ = 0, segCount = 0;
const difficulty = () => clamp(-genZ / 650, 0, 5);

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

function addSimit(x, y, z, gold) {
  const m = makeSimit(gold); m.position.set(x, y, z); m.rotation.x = 0.25; scene.add(m);
  simits.push({ mesh: m, x, y, z, free: true, gold });
}

function spawnGap(first) {
  const d = difficulty();
  const len = first ? (tutorialPending ? 70 : 50) : rand(32, 56), z0 = genZ;
  const ph = Math.random() * 6, amp = rand(1.5, 4.2);
  for (let z = z0 - 7; z > z0 - len + 5; z -= 3.4) {
    const x = clamp(Math.sin((z0 - z) * 0.09 + ph) * amp, -LANE + 0.5, LANE - 0.5);
    addSimit(x, FLY_Y, z, !first && Math.random() < 0.035);
  }
  if (!first) {
    const n = d < 0.35 ? 0 : Math.min(4, 1 + Math.floor(d * 0.9));
    for (let i = 0; i < n; i++) {
      const r = makeGull(true); r.scale.setScalar(0.8); r.rotation.y = Math.PI;
      const z = z0 - rand(10, len - 6), bx = rand(-4, 4);
      r.position.set(bx, FLY_Y, z); scene.add(r);
      rivals.push({ mesh: r, bx, z, ph: Math.random() * 6, sw: rand(1.2, 3.2), hit: false, spin: 0 });
    }
    if (d > 0.7 && Math.random() < 0.35 + d * 0.08) {
      const nk = d > 2.5 && Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < nk; i++) {
        const k = makeKite(), bx = rand(-3.5, 3.5), z = z0 - rand(10, len - 8);
        k.position.set(bx, FLY_Y + 0.2, z); scene.add(k);
        kites.push({ g: k, bx, z, ph: Math.random() * 6, sw: rand(1.5, 3) });
      }
    }
    if (segCount > 2 && Math.random() < 0.42) {
      const kind = pick(d > 1.5 ? ['shield', 'shield', 'magnet', 'double'] : ['magnet', 'double', 'shield']);
      const z = z0 - len * 0.5, x = clamp(Math.sin((z0 - z) * 0.09 + ph + 1.6) * amp, -4.5, 4.5);
      const p = makePowerUp(kind); p.position.set(x, FLY_Y, z); scene.add(p);
      powerups.push({ g: p, kind, x, y: FLY_Y, z });
    }
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(BUOY, vcMat); b.position.set(pick([-1, 1]) * rand(7, 11), 0, z0 - rand(5, len));
      scene.add(b); decor.push({ mesh: b, z: b.position.z, ph: Math.random() * 6 });
    }
  }
  genZ -= len;
}

function spawnFerry() {
  const d = difficulty();
  const L = rand(44, 58), x0 = rand(-1.2, 1.2), zc = genZ - L / 2 - 2;
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

  const nCh = 1 + (d > 1 ? 1 : 0) + (d > 2.5 ? 1 : 0);
  const chims = [];
  for (let i = 0; i < nCh; i++) {
    const cx = rand(-2.6, 2.6), cz = -L / 2 + 12 + (i + 0.5) * (L - 16) / nCh + rand(-3, 3);
    const c = new THREE.Mesh(CHIMNEY, vcMat); c.position.set(cx, DECK, cz); c.castShadow = c.receiveShadow = true; g.add(c);
    obstacle(cx, cz, 0.95, 0.95, DECK + 4.7, 'bacaya');
    const dark = d > 1.2 && Math.random() < clamp((d - 1) * 0.22, 0, 0.55);
    chims.push({ x: x0 + cx, z: zc + cz, dark, t: Math.random() });
    if (dark) smokes.push({ x: x0 + cx, z0: zc + cz + 1.3, z1: zc + cz + 7.5, hw: 1.6, hit: false });
  }
  for (let lz = -L / 2 + 10; lz < L / 2 - 3; lz += rand(2.2, 3)) {
    for (const lx of [-2.9, -1.2, 0.5, 2.2]) {
      if (Math.random() < 0.45) continue;
      const px = lx + rand(-0.4, 0.4);
      if (blocked.some(b => Math.hypot(b.x - px, b.z - lz) < b.r)) continue;
      const hold = Math.random() < 0.42 + d * 0.03;
      const p = makePerson(hold); p.mesh.position.set(px, DECK + 0.05, lz); g.add(p.mesh);
      p.wz = zc + lz; people.push(p);
      if (p.simit) {
        const gold = Math.random() < 0.02;
        if (gold) p.simit.material = makeSimit(true).material;
        simits.push({ mesh: p.simit, x: x0 + px + 0.34 * Math.cos(p.mesh.rotation.y), y: DECK + 0.05 + 2.56, z: zc + lz - 0.34 * Math.sin(p.mesh.rotation.y), person: p, gold });
      }
    }
  }
  ferries.push({ group: g, x: x0, zFront, zBack, ph: Math.random() * 6, chims, flag });
  genZ = zFront - 2;
}

function clearWorld() {
  for (const f of ferries) scene.remove(f.group);
  for (const s of simits) if (s.free) scene.remove(s.mesh);
  for (const a of [...rivals.map(r => r.mesh), ...kites.map(k => k.g), ...powerups.map(p => p.g), ...decor.map(d => d.mesh)]) scene.remove(a);
  ferries = []; obstacles = []; simits = []; rivals = []; kites = []; powerups = []; people = []; decor = []; smokes = [];
  clearFx();
}
function generate(limit) {
  while (genZ > limit) { segCount % 2 === 0 ? spawnGap(segCount === 0) : spawnFerry(); segCount++; }
}
function cleanup(z) {
  const behind = z + 30;
  ferries = ferries.filter(f => (f.zFront > behind ? (scene.remove(f.group), false) : true));
  obstacles = obstacles.filter(o => o.z < behind);
  smokes = smokes.filter(s => s.z0 < behind);
  simits = simits.filter(s => (s.z > behind ? (s.free && scene.remove(s.mesh), false) : true));
  rivals = rivals.filter(r => (r.mesh.position.z > behind ? (scene.remove(r.mesh), false) : true));
  kites = kites.filter(k => (k.z > behind ? (scene.remove(k.g), false) : true));
  powerups = powerups.filter(p => (p.z > behind ? (scene.remove(p.g), false) : true));
  decor = decor.filter(d => (d.z > behind ? (scene.remove(d.mesh), false) : true));
  people = people.filter(p => p.wz < behind);
}
function deckUnder(x, z) {
  for (const f of ferries) if (z < f.zBack - 1 && z > f.zFront + 2 && Math.abs(x - f.x) < 4) return true;
  return false;
}

// ---------------- oyun durumu ----------------
let state = 'loading';
let speed = 15, playT = 0, points = 0, simitCount = 0, goldCount = 0, combo = 0, bestCombo = 0, comboT = 0, dist = 0;
let crashT = 0, vy = 0, cause = '', trauma = 0, hitStop = 0, timeScale = 1, flapPh = 0, flapPow = 0.5, flapBurst = 0;
let tx = 0, vx = 0, cryT = 4, invuln = 0, smokeT = 0, overLock = 0, countdown = 0, god = false, splashed = false;
const pw = { magnet: 0, shield: 0, double: 0 };
let best = +store.get(KEY_BEST, 0) || 0;
let tutorialPending = !store.get(KEY_TUT, false);
const keys = {};

function resetWorld() {
  clearWorld(); genZ = -8; segCount = 0;
  gull.position.set(0, FLY_Y, 0); gull.rotation.set(0, 0, 0); tx = 0; vx = 0;
  speed = 15; playT = 0; points = 0; simitCount = 0; goldCount = 0; combo = 0; bestCombo = 0; comboT = 0; dist = 0;
  crashT = 0; vy = 0; trauma = 0; hitStop = 0; timeScale = 1; invuln = 0; smokeT = 0; splashed = false;
  pw.magnet = pw.shield = pw.double = 0;
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
const fmt = n => n.toLocaleString('tr-TR');

function showTitle() {
  state = 'title'; resetWorld();
  ui.powers.textContent = '';
  show('title'); show('over', false); show('pause', false); show('hud', false); show('settings', false); show('countdown', false);
  $('titleBest').textContent = best ? `Rekor ${fmt(best)}` : 'İlk uçuşun!';
  audio.music(true);
}
function startGame() {
  audio.unlock();
  sfx.click();
  resetWorld(); state = 'play';
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
    sfx.shieldBreak(); vibrate(40); popText('Kalkan!', gull.position, 'blue'); renderPowers();
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
  state = 'over'; overLock = 0.8;
  const final = total();
  const isBest = final > best;
  if (isBest) { best = final; store.set(KEY_BEST, best); }
  const msg = { 'rakip martıya': 'Martı kavgası!', 'uçurtmaya': 'Uçurtmaya dolandın!', 'bacaya': 'Bacaya çarptın!', 'direğe': 'Direğe çarptın!' };
  $('overTitle').textContent = msg[cause] || 'Pat!';
  $('stSimit').textContent = fmt(simitCount) + (goldCount ? ` (+${goldCount} altın)` : '');
  $('stDist').textContent = `${fmt(Math.round(dist))} m`;
  $('stCombo').textContent = `${bestCombo}`;
  ui.powers.textContent = '';
  $('overBest').textContent = isBest ? 'Önceki rekoru geçtin' : `Rekor ${fmt(best)}`;
  $('newRecord').classList.toggle('hidden', !isBest);
  show('over'); show('hud', false); hideTutorial();
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
    const k = el.dataset.k, f = pw[k] / POWER[k].dur;
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
let cdShown = 0;

// ---------------- girdi: tek parmak, ekranın X konumu = martının hedefi ----------------
function steerFromX(clientX) {
  // ekranın ortadaki %80'i tüm şeridi kapsar → başparmağın kenara uzanması gerekmez
  tx = clamp((clientX / innerWidth - 0.5) / 0.4, -1, 1) * LANE;
  if (tutT > 0) {
    const side = Math.sign(tx) * (Math.abs(tx) > 2 ? 1 : 0);
    if (side && side !== tutLastSide) { tutMoves++; tutLastSide = side; }
  }
}
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
  if (e.code === 'KeyM') { settings.sfx = settings.music = !(settings.sfx || settings.music); saveSettings(); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { if (state === 'play' || state === 'countdown') pause(); else if (state === 'paused') resume(); }
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
    if (state === 'title' || (state === 'over' && overLock <= 0)) { e.preventDefault(); startGame(); }
    else if (state === 'paused') { e.preventDefault(); resume(); }
  }
});
addEventListener('keyup', e => (keys[e.code] = false));
const onBtn = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); sfx.click(); fn(e); });
onBtn('againBtn', () => { if (overLock <= 0) startGame(); });
onBtn('homeBtn', () => showTitle());
onBtn('pauseBtn', () => pause());
onBtn('resumeBtn', () => resume());
onBtn('quitBtn', () => { audio.resume(); showTitle(); });
onBtn('settingsBtn', () => { show('settings'); syncToggles(); });
onBtn('closeSettings', () => show('settings', false));
onBtn('soundBtn', () => { settings.sfx = settings.music = !(settings.sfx || settings.music); saveSettings(); });
onBtn('shareBtn', async () => {
  const text = `Simit Martısı'nda ${fmt(total())} puan yaptım, ${simitCount} simit kaptım! Sen kaç yaparsın?`;
  const url = location.href.split('#')[0].split('?')[0];
  try {
    if (navigator.share) await navigator.share({ title: 'Simit Martısı', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); $('shareBtn').textContent = 'Kopyalandı'; setTimeout(() => ($('shareBtn').textContent = 'Paylaş'), 1800); }
  } catch (e) {}
});
for (const el of document.querySelectorAll('[data-toggle]')) {
  el.addEventListener('click', e => { e.stopPropagation(); const k = el.dataset.toggle; settings[k] = !settings[k]; saveSettings(); sfx.click(); if (k === 'vibe') vibrate(30); });
}
function saveSettings() { store.set(KEY_SET, settings); audio.set({ sfx: settings.sfx, music: settings.music }); syncToggles(); }
function syncToggles() {
  for (const el of document.querySelectorAll('[data-toggle]')) el.setAttribute('aria-pressed', settings[el.dataset.toggle] ? 'true' : 'false');
  $('soundUse').setAttribute('href', settings.sfx || settings.music ? '#i-sound' : '#i-mute');
}
syncToggles();
// sekme arka plana geçince otomatik duraklat
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); audio.suspend(); } else if (state !== 'paused') audio.resume(); });
addEventListener('pagehide', () => pause());

// ---------------- kalite: zayıf cihazda kendini kısar ----------------
const DPR = Math.min(2, devicePixelRatio || 1);
let quality = 2, qFrames = 0, qTime = 0, fpsSmooth = 60;
function setQuality(q) {
  quality = q;
  renderer.setPixelRatio(q === 2 ? DPR : q === 1 ? Math.min(DPR, 1.4) : 1);
  const sh = q === 2;
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
  if (state !== 'paused') {
    qFrames++; qTime += realDt;
    if (qTime > 2.5) {
      const f = qFrames / qTime;
      if (f < 42 && quality > 0) setQuality(quality - 1);
      qFrames = 0; qTime = 0;
    }
  }
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
      speed = 15 + 19 * (1 - Math.exp(-playT / 75));
    } else { speed = 15; autopilot(); }
    if (keys.ArrowLeft || keys.KeyA) tx = clamp(tx - 14 * dt, -LANE, LANE);
    if (keys.ArrowRight || keys.KeyD) tx = clamp(tx + 14 * dt, -LANE, LANE);
    const dz = speed * dt; g.z -= dz; if (state === 'play') dist += dz / 2;
    // kritik sönümlü yay: hızlı ama yumuşak takip
    const k = 140, c = 2 * Math.sqrt(k) * 0.95;
    vx += ((tx - g.x) * k - vx * c) * dt;
    g.x += vx * dt;
    gull.rotation.z = damp(gull.rotation.z, clamp(-vx * 0.07, -0.85, 0.85), 10, dt);
    gull.rotation.y = damp(gull.rotation.y, clamp(-vx * 0.025, -0.35, 0.35), 10, dt);
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
    crashT += dt;
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

  // ---- toplama, güçlendirme, çarpışma ----
  if (state === 'play' || state === 'title') {
    const magnet = pw.magnet > 0 && state === 'play';
    for (const s of simits) {
      if (s.taken) continue;
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
        pw[p.kind] = POWER[p.kind].dur; renderPowers();
        hitStop = 0.05; trauma = Math.min(1, trauma + 0.2);
        sparkle(tmp.set(p.x, p.y, p.z), 40, new THREE.Color(POWER[p.kind].color).getHex(), 7, 0.8, 0.5);
        sfx.power(); vibrate(25);
        popText(POWER[p.kind].name, tmp.set(p.x, p.y + 1, p.z), 'power');
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
          sfx.cough(); popText('Öhö öhö!', tmp.set(g.x, g.y + 1.4, g.z), 'smoke'); vibrate(30);
        }
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
    p.z += 5 * dt; p.x = r.bx + Math.sin(t * 1.4 + r.ph) * r.sw;
    p.y = FLY_Y + Math.sin(t * 3 + r.ph) * 0.15;
    r.mesh.rotation.z = Math.cos(t * 1.4 + r.ph) * 0.35;
    flapGull(r.mesh, t * 11 + r.ph, 0.9);
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
    } else if (p.simit && p.simit.visible) p.simit.position.y = 2.56 + Math.sin(t * 3 + p.ph) * 0.06;
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
  for (const s of simits) if (s.free && !s.taken && !s.pulled) { s.mesh.rotation.y = t * 2.4 + s.z; if (s.gold && Math.random() < dt * 8) sparkle(s.mesh.position, 1, 0xffe08a, 1, 0.6, 0.4); }
  updateFx(dt);

  // ---- kalkan / sis ----
  shieldOrb.visible = pw.shield > 0 || (invuln > 0 && Math.sin(t * 40) > 0);
  if (shieldOrb.visible) { shieldOrb.rotation.y = t * 1.5; shieldOrb.scale.setScalar(1 + Math.sin(t * 8) * 0.04); }
  gull.visible = !(invuln > 0 && pw.shield <= 0 && Math.sin(t * 50) < -0.3);
  ui.vignette.style.opacity = smokeT > 0 ? Math.min(1, smokeT) : 0;

  // ---- gölge (blob), ışık ----
  const onDeck = deckUnder(g.x, g.z);
  const gy = onDeck ? DECK + 0.08 : waveAt(g.x, g.z, t) + 0.2;
  blob.position.set(g.x, gy, g.z);
  blob.scale.setScalar(clamp(1.2 - (g.y - gy) * 0.07, 0.4, 1.1));
  blob.visible = state !== 'over' && !(onDeck && renderer.shadowMap.enabled);
  placeSun(g.x, g.z);

  // ---- kamera: yumuşak takip + sarsıntı ----
  const land = camera.aspect > 1;
  const followZ = state === 'dead' || state === 'over' ? camera.position.z - (land ? 11 : 13.5) : g.z;
  const cx = g.x * 0.85, cy = FLY_Y + (land ? 4.2 : 5.4), cz = followZ + (land ? 11 : 13.5);
  camera.position.x = damp(camera.position.x, cx, 5, realDt);
  camera.position.y = damp(camera.position.y, cy, 5, realDt);
  camera.position.z = damp(camera.position.z, cz, 12, realDt);
  camera.lookAt(g.x * 0.92, FLY_Y - (land ? 0.2 : 0.6), followZ - 12);
  camera.rotation.z += gull.rotation.z * 0.06;
  trauma = Math.max(0, trauma - realDt * 1.6);
  if (trauma > 0) {
    const s = trauma * trauma, tt = performance.now() * 0.001;
    camera.position.x += Math.sin(tt * 47.3) * 0.5 * s; camera.position.y += Math.sin(tt * 53.1 + 1) * 0.4 * s;
    camera.rotation.z += Math.sin(tt * 39.7 + 2) * 0.05 * s;
  }
  const fovBase = land ? 56 : 68;
  const boost = pw.magnet > 0 || pw.double > 0 ? 2 : 0;
  camera.fov = damp(camera.fov, fovBase + (speed - 15) * 0.42 + boost, 3, realDt);
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  far.position.set(camera.position.x * 0.9, 0, camera.position.z);
  updateWater(t, camera.position.x, camera.position.z);
  updateSpeedLines(dt, g.x, g.y, g.z, speed, state === 'play' ? (speed - 20) / 12 + (pw.double > 0 ? 0.4 : 0) : 0);

  // ---- ses, arayüz ----
  audio.tick();
  audio.setSpeed((speed - 15) / 19);
  if (state === 'play') {
    updateHud();
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
  p.angry = 1.6; p.mesh.geometry = p.angryGeo();
}
const shouts = ['Simidim!', 'Hoop!', 'Yaa!', 'Martıya bak!', 'Bırak onu!', 'Ah simidim…', 'Oha!', 'Kaçtı!', 'Hayırdır?'];
function takeSimit(s) {
  combo = comboT > 0 ? combo + 1 : 1; comboT = COMBO_T; bestCombo = Math.max(bestCombo, combo);
  const m = mult() * (pw.double > 0 ? 2 : 1);
  const base = s.gold ? 50 : 10, gain = base * m;
  points += gain; simitCount++;
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
  if (s.person) { angry(s.person); if (Math.random() < 0.5) popText(pick(shouts), tmp.set(s.x, s.y + 1.4, s.z), 'shout'); }
}
function nearMiss(x) {
  const gain = 5 * mult();
  points += gain;
  sfx.near(); trauma = Math.min(1, trauma + 0.12);
  popText(`Kıl payı! +${gain}`, tmp2.set(gull.position.x, gull.position.y + 1.6, gull.position.z), 'near');
  sparkle(tmp2.set((gull.position.x + x) / 2, gull.position.y, gull.position.z), 6, 0xffffff, 3, 0.35);
}

// başlık ekranında martı kendi kendine uçar
function autopilot() {
  const g = gull.position;
  let target = 0, bestD = 1e9;
  for (const s of simits) { const d = g.z - s.z; if (!s.taken && d > 2 && d < 30 && d < bestD) { bestD = d; target = s.x; } }
  for (const o of obstacles) { const d = g.z - o.z; if (d > -1 && d < 14 && Math.abs(target - o.x) < o.hw + 1.4) target = o.x + (target > o.x ? 1 : -1) * (o.hw + 1.8); }
  tx = clamp(target, -6, 6);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
setQuality(DPR > 1.5 && Math.min(screen.width, screen.height) < 500 ? 1 : 2);

showTitle();
requestAnimationFrame(frame);

window.__game = {
  get state() { return state; }, get score() { return total(); }, get simits() { return simitCount; }, get z() { return gull.position.z; }, get x() { return gull.position.x; },
  get fps() { return Math.round(fpsSmooth); }, get quality() { return quality; }, get dist() { return dist; }, get combo() { return combo; }, get powers() { return { ...pw }; },
  setTx: v => (tx = v), autopilot, startGame, showTitle, crash: (why = 'bacaya') => { const s = pw.shield, i = invuln, gd = god; pw.shield = 0; invuln = 0; god = false; crash(why); god = gd; if (state === 'play') { pw.shield = s; invuln = i; } },
  pause, resume, power: (k) => { pw[k] = POWER[k].dur; renderPowers(); }, setGod: (b) => (god = !!b), setQuality,
};
