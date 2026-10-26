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
  setSpeed(k) { if (seaFilter) seaFilter.frequency.setTargetAtTime(420 + k * 500, AC.currentTime, 0.4); },
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
  click() { tone('triangle', 1200, 0.05, 0.07); },
  record() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone('square', 523 * Math.pow(2, s / 12), 0.16, 0.05, { when: i * 0.09, filter: 2600 })); },
  count() { tone('triangle', 740, 0.08, 0.08); },
  go() { tone('triangle', 1110, 0.18, 0.1); },
};

// ---------------- müzik: hafif, döngülü, D majör pentatonik ----------------
const BPM = 100, S16 = 60 / BPM / 4;
const CHORDS = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]]; // D  Bm  G  A
const MEL = [ // 0 = sus; her satır bir akor ölçüsü (16 adım)
  [74, 0, 76, 0, 78, 0, 81, 0, 78, 0, 76, 0, 74, 0, 0, 0],
  [71, 0, 74, 0, 76, 0, 74, 0, 71, 0, 69, 0, 71, 0, 0, 0],
  [67, 0, 71, 0, 74, 0, 76, 0, 78, 0, 76, 0, 74, 0, 71, 0],
  [69, 0, 73, 0, 76, 0, 0, 78, 76, 0, 73, 0, 69, 0, 0, 0],
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function scheduleMusic() {
  if (nextNote < AC.currentTime) nextNote = AC.currentTime + 0.05;
  while (nextNote < AC.currentTime + 0.25) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, t = nextNote - AC.currentTime;
    const ch = CHORDS[bar];
    if (s === 0) for (const m of ch.slice(1)) tone('triangle', mtof(m), S16 * 15, 0.035, { when: t, attack: 0.25, bus: musicBus, filter: 1400, detune: (Math.random() - 0.5) * 12 });
    if (s % 4 === 0) tone('sine', mtof(ch[0] - 12), S16 * 3, 0.16, { when: t, bus: musicBus });
    if (s % 4 === 2) tone('sine', mtof(ch[0]), S16 * 1.5, 0.06, { when: t, bus: musicBus });
    const phrase = Math.floor(step / 64) % 2;
    const m = MEL[bar][s];
    if (m && (phrase === 0 || s % 4 === 0)) tone('triangle', mtof(m + (phrase ? 12 : 0)), S16 * 2.2, 0.07, { when: t, bus: musicBus, filter: 3200 });
    if (s % 2 === 1) hiss(0.03, 0.025, 8000, 'highpass', t, 1, musicBus);
    nextNote += S16; step++;
  }
}
