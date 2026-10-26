// Bütün sesler koddan üretilir: dosya yok, indirme yok.
let AC = null, master, sfxBus, musicBus, ambBus, musicFilter, noiseBuf, seaGain, seaFilter;
const opts = { sfx: true, music: true };
let nextNote = 0, step = 0, musicOn = false;

export const audio = {
  get ctx() { return AC; },
  // ilk dokunuşun İÇİNDE çağrılmalı (iOS kilidi)
  unlock() {
    if (AC) { if (AC.state !== 'running') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = AC.createGain(); master.gain.value = 0.8;
      master.connect(comp); comp.connect(AC.destination);
      sfxBus = AC.createGain(); sfxBus.connect(master);
      musicFilter = AC.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 9000;
      musicBus = AC.createGain(); musicBus.gain.value = 0; musicBus.connect(musicFilter); musicFilter.connect(master);
      ambBus = AC.createGain(); ambBus.gain.value = 0.9; ambBus.connect(master);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 3; }
      // dalga ambiyansı: yavaşça kabarıp sönen alçak gürültü
      const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      seaFilter = AC.createBiquadFilter(); seaFilter.type = 'lowpass'; seaFilter.frequency.value = 500;
      seaGain = AC.createGain(); seaGain.gain.value = 0.05;
      const lfo = AC.createOscillator(), lfoG = AC.createGain(); lfo.frequency.value = 0.13; lfoG.gain.value = 0.035;
      lfo.connect(lfoG); lfoG.connect(seaGain.gain); lfo.start();
      src.connect(seaFilter); seaFilter.connect(seaGain); seaGain.connect(ambBus); src.start();
      // iOS: sessiz bir tampon çal, bağlam açılsın
      const s = AC.createBufferSource(); s.buffer = AC.createBuffer(1, 1, 22050); s.connect(AC.destination); s.start(0);
      apply();
    } catch (e) { AC = null; }
  },
  suspend() { if (AC && AC.state === 'running') AC.suspend(); },
  resume() { if (AC && AC.state !== 'running') AC.resume(); nextNote = 0; },
  set(o) { Object.assign(opts, o); apply(); },
  get opts() { return { ...opts }; },
  setSpeed(k) { intensity = Math.max(0, Math.min(1, k / 1.2)); if (seaFilter) seaFilter.frequency.setTargetAtTime(420 + k * 500, AC.currentTime, 0.4); },
  music(on) { musicOn = on; apply(); },
  duck(low) { if (musicFilter) musicFilter.frequency.setTargetAtTime(low ? 500 : 9000, AC.currentTime, low ? 0.08 : 0.6); },
  tick() { if (AC && musicOn && opts.music) scheduleMusic(); },
};
function apply() {
  if (!AC) return;
  const t = AC.currentTime;
  sfxBus.gain.setTargetAtTime(opts.sfx ? 1 : 0, t, 0.02);
  ambBus.gain.setTargetAtTime(opts.sfx ? 0.9 : 0, t, 0.2);
  musicBus.gain.setTargetAtTime(opts.music && musicOn ? 0.32 : 0, t, 0.4);
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function tone(type, f0, dur, vol, { when = 0, f1 = 0, bus = sfxBus, attack = 0.008, filter = 0, detune = 0 } = {}) {
  if (!AC) return;
  const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.detune.value = detune;
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, attack, vol, dur);
  let n = o;
  if (filter) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); n = f; }
  n.connect(g); g.connect(bus); o.start(t); o.stop(t + attack + dur + 0.05);
}
function hiss(dur, vol, freq, type = 'bandpass', when = 0, q = 1, bus = sfxBus) {
  if (!AC) return;
  const t = AC.currentTime + when, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, 0.005, vol, dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
// süzgeci kayan rüzgâr: viraja girişte ve sapan fırlatmada
function sweep(dur, vol, f0, f1, when = 0, q = 1.2) {
  if (!AC) return;
  const t = AC.currentTime + when, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
}

export const sfx = {
  cry(vol = 0.13, when = 0) { // martı: kırık, üç heceli çığlık
    if (!AC || !opts.sfx) return;
    for (let k = 0; k < 3; k++) {
      const t = AC.currentTime + when + k * 0.19, o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
      o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 3;
      const base = 1300 - k * 60;
      o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.05); o.frequency.linearRampToValueAtTime(base * 0.75, t + 0.18);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      o.connect(f); f.connect(g); g.connect(ambBus); o.start(t); o.stop(t + 0.24);
    }
  },
  horn() { // vapur düdüğü
    if (!AC) return;
    const t = AC.currentTime, g = AC.createGain(), f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.1); g.gain.setValueAtTime(0.11, t + 1.0); g.gain.linearRampToValueAtTime(0, t + 1.5);
    for (const fr of [110, 165, 220.5]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + 1.6); }
    f.connect(g); g.connect(sfxBus);
  },
  catch(n) { // ritmik yükselen "çıt": kombo arttıkça perde çıkar
    const step = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21][Math.min(n - 1, 9)];
    const f = 660 * Math.pow(2, step / 12);
    hiss(0.05, 0.18, 2600, 'highpass');
    tone('triangle', f, 0.16, 0.16);
    tone('sine', f * 2, 0.1, 0.06, { when: 0.02 });
  },
  gold() {
    [0, 4, 7, 12, 16].forEach((s, i) => tone('triangle', 880 * Math.pow(2, s / 12), 0.22, 0.12, { when: i * 0.045 }));
    hiss(0.3, 0.06, 6000, 'highpass', 0.05);
  },
  power() {
    tone('sawtooth', 300, 0.35, 0.08, { f1: 1200, filter: 2400 });
    [0, 7, 12].forEach((s, i) => tone('triangle', 520 * Math.pow(2, s / 12), 0.2, 0.1, { when: 0.12 + i * 0.07 }));
  },
  shieldBreak() { hiss(0.4, 0.3, 3800, 'bandpass', 0, 2); tone('square', 900, 0.25, 0.05, { f1: 200, filter: 3000 }); },
  near() { hiss(0.22, 0.12, 1400, 'bandpass', 0, 0.8); tone('sine', 900, 0.12, 0.05, { f1: 1500, when: 0.02 }); },
  cough() { for (let i = 0; i < 2; i++) hiss(0.12, 0.25, 500, 'bandpass', i * 0.16, 1.5); },
  crash() { hiss(0.6, 0.55, 700, 'lowpass'); tone('sine', 170, 0.5, 0.4, { f1: 40 }); hiss(0.25, 0.25, 2500, 'bandpass', 0.02); },
  splash() { hiss(0.7, 0.35, 1200, 'lowpass', 0, 0.7); hiss(0.4, 0.12, 4000, 'highpass', 0.05); },
  whoosh() { sweep(1.2, 0.2, 240, 1500, 0, 1.4); },
  sling() { sweep(0.8, 0.28, 500, 3400, 0, 1); tone('triangle', 520, 0.35, 0.07, { f1: 1240 }); tone('triangle', 780, 0.3, 0.05, { f1: 1860, when: 0.07 }); },
  thunder() { hiss(2.2, 0.5, 160, 'lowpass', 0.3, 0.7); hiss(0.5, 0.25, 700, 'lowpass', 0.25); },
  gust() { sweep(1.6, 0.16, 250, 900, 0, 1.4); },
  shiver() { for (let i = 0; i < 3; i++) tone('triangle', 520 - i * 40, 0.06, 0.04, { when: i * 0.07 }); },
  click() { tone('triangle', 1200, 0.05, 0.07); },
  record() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone('square', 523 * Math.pow(2, s / 12), 0.16, 0.05, { when: i * 0.09, filter: 2600 })); },
  count() { tone('triangle', 740, 0.08, 0.08); },
  go() { tone('triangle', 1110, 0.18, 0.1); },
};

// ---------------- müzik: Hicaz makamında İstanbul havası ----------------
// Saz (Karplus-Strong tel), uzun notalarda kanun tremolosu, B bölümünde ney, darbukada maksum usulü (düm-tek).
// Bölümler: A, A' (oktav), B (ney), A, darbuka arası. Hızlandıkça (setSpeed) zil ve ara vuruşlar katılır.
const BPM = 104, S16 = 60 / BPM / 4;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let intensity = 0;
// [adım, nota, uzunluk(16'lık)]; Re Hicaz: Re Mi♭ Fa# Sol La Si♭ Do Re
const A = [
  [[0, 74, 2], [2, 72, 1], [3, 70, 1], [4, 69, 3], [7, 70, 1], [8, 69, 1], [9, 67, 1], [10, 66, 1], [11, 67, 1], [12, 69, 4]],
  [[0, 67, 1], [1, 69, 1], [2, 70, 1], [3, 72, 1], [4, 70, 1], [5, 69, 1], [6, 67, 1], [7, 66, 1], [8, 67, 2], [10, 66, 1], [11, 63, 1], [12, 62, 4]],
  [[0, 62, 1], [1, 66, 1], [2, 69, 1], [3, 74, 1], [4, 72, 2], [6, 70, 1], [7, 69, 1], [8, 70, 1], [9, 72, 1], [10, 74, 1], [11, 75, 1], [12, 74, 4]],
  [[0, 72, 1], [1, 70, 1], [2, 69, 1], [3, 67, 1], [4, 66, 1], [5, 67, 1], [6, 69, 2], [8, 67, 1], [9, 66, 1], [10, 63, 1], [11, 66, 1], [12, 62, 4]],
];
const B = [
  [[0, 69, 3], [3, 74, 3], [6, 75, 2], [8, 74, 2], [10, 72, 2], [12, 70, 4]],
  [[0, 69, 1], [1, 70, 1], [2, 72, 2], [4, 70, 1], [5, 69, 1], [6, 67, 2], [8, 69, 8]],
  [[0, 67, 2], [2, 70, 2], [4, 74, 2], [6, 79, 2], [8, 78, 2], [10, 75, 2], [12, 74, 4]],
  [[0, 72, 1], [1, 70, 1], [2, 69, 1], [3, 67, 1], [4, 69, 2], [6, 70, 1], [7, 69, 1], [8, 67, 1], [9, 66, 1], [10, 63, 1], [11, 66, 1], [12, 62, 4]],
];
const ROOT_A = [38, 43, 38, 45], ROOT_B = [45, 43, 43, 38]; // Re, Sol, Re, La / La, Sol, Sol, Re
const FORM = [['A', 0], ['A', 12], ['B', 0], ['A', 0], ['brk', 0]]; // [bölüm, oktav kaydırma]
const BARS = FORM.map(([k]) => (k === 'brk' ? 1 : 4)), TOTAL = BARS.reduce((a, b) => a + b, 0);
function where(bar) {
  let b = bar % TOTAL;
  for (let i = 0; i < FORM.length; i++) { if (b < BARS[i]) return { sec: FORM[i][0], oct: FORM[i][1], i: b }; b -= BARS[i]; }
}
// Karplus-Strong: gürültüyle dolu bir halka, her turda ortalanıp söner → telli çalgı. Nota başına bir kez üretilir.
const ksCache = new Map();
function ksBuf(m) {
  if (ksCache.has(m)) return ksCache.get(m);
  const sr = AC.sampleRate, n = Math.round(sr * 1.3), N = Math.max(2, Math.round(sr / mtof(m) - 0.5));
  const buf = AC.createBuffer(1, n, sr), d = buf.getChannelData(0), ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  const decay = m > 70 ? 0.994 : 0.997;
  let idx = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[idx], b = ring[(idx + 1) % N];
    d[i] = a; peak = Math.max(peak, Math.abs(a));
    ring[idx] = (a * 0.55 + b * 0.45) * decay; // hafif eğik ortalama: saz gibi parlak kalsın
    idx = (idx + 1) % N;
  }
  for (let i = 0; i < n; i++) d[i] /= peak;
  ksCache.set(m, buf);
  return buf;
}
function pluck(m, when, vol, dur = 1, pan = 0) {
  const t = AC.currentTime + when, s = AC.createBufferSource(), g = AC.createGain();
  s.buffer = ksBuf(m);
  g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0.0001, t + dur * 0.5, dur * 0.3);
  let out = g;
  if (pan && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  s.connect(g); out.connect(musicBus); s.start(t); s.stop(t + dur + 0.4);
}
// ney: nefesli, yavaş açılan, sonradan titreyen üfleme
function ney(m, when, dur, vol) {
  const t = AC.currentTime + when, f = mtof(m), g = AC.createGain(), o = AC.createOscillator(), o2 = AC.createOscillator();
  const vib = AC.createOscillator(), vg = AC.createGain(), lp = AC.createBiquadFilter(), g2 = AC.createGain();
  o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2;
  vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(dur, 0.5));
  vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  lp.type = 'lowpass'; lp.frequency.value = 2400; g2.gain.value = 0.18;
  o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
  g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
  g.connect(musicBus);
  for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + 0.2); }
  hiss(Math.min(dur, 0.4), vol * 0.35, f * 2, 'bandpass', when, 2, musicBus); // nefes
}
function dum(when, v = 1) { tone('sine', 98, 0.2, 0.32 * v, { when, f1: 52, bus: musicBus, attack: 0.003 }); hiss(0.06, 0.08 * v, 260, 'lowpass', when, 1, musicBus); }
function tek(when, v = 1) { hiss(0.05, 0.16 * v, 3400, 'bandpass', when, 1.4, musicBus); tone('triangle', 1650, 0.03, 0.035 * v, { when, bus: musicBus, attack: 0.002 }); }
function zil(when, v = 1) { hiss(0.14, 0.05 * v, 9000, 'highpass', when, 1, musicBus); }

function scheduleMusic() {
  if (nextNote < AC.currentTime) nextNote = AC.currentTime + 0.05;
  while (nextNote < AC.currentTime + 0.25) {
    const bar = Math.floor(step / 16), s = step % 16, t = nextNote - AC.currentTime;
    const w = where(bar), sec = w.sec, hot = intensity;
    // darbuka: maksum (düm . tek . . . tek . düm . . . tek . . .), arada süslemeler
    if (s === 0 || s === 8) dum(t, s === 0 ? 1 : 0.8);
    else if (s === 2 || s === 6 || s === 12) tek(t);
    else if (sec === 'brk' ? s % 2 === 1 : (s === 14 || s === 15) && (hot > 0.3 || bar % 2)) tek(t, 0.45);
    else if (hot > 0.55 && s % 2 === 1 && Math.random() < hot * 0.5) tek(t, 0.25);
    if (hot > 0.35 && (s === 4 || s === 12)) zil(t, 0.6 + hot * 0.4);
    if (sec === 'brk') { if (s === 0) pluck(50, t, 0.18, 1.6); nextNote += S16; step++; continue; }
    // bas (ud gibi): kök, beşli, kök, oktav; altında sabit dem
    const root = (sec === 'B' ? ROOT_B : ROOT_A)[w.i];
    if (s === 0) pluck(root, t, 0.34, 1.1, -0.15);
    else if (s === 6) pluck(root + 7, t, 0.2, 0.6, -0.15);
    else if (s === 8) pluck(root, t, 0.26, 0.8, -0.15);
    else if (s === 12 && hot > 0.2) pluck(root + 12, t, 0.18, 0.5, -0.15);
    if (s === 0) tone('sine', mtof(root + 12), S16 * 15, 0.035, { when: t, attack: 0.4, bus: musicBus });
    // ezgi
    for (const [st, m0, len] of (sec === 'B' ? B : A)[w.i]) {
      if (st !== s) continue;
      const m = m0 + w.oct;
      if (sec === 'B') {
        ney(m, t, len * S16 * 0.95, 0.075);
        if (len >= 2) pluck(m - 12, t, 0.12, 0.5, 0.35); // saz alttan eşlik
      } else {
        pluck(m, t, 0.26, Math.max(0.35, len * S16 * 1.6), 0.2);
        if (len >= 3) for (let k = 1; k < len; k++) pluck(m, t + k * S16, 0.1, 0.25, -0.25); // kanun tremolosu
        if (w.oct) pluck(m - 12, t + 0.012, 0.12, 0.5, -0.2); // oktavda ikinci saz
      }
    }
    nextNote += S16; step++;
  }
}
