// Passability check: can a perfect player (knows the whole route, steers at most VLAT units/s sideways) get through?
// Static obstacles (chimneys, masts, salon glass) plus crossing sailboats and pirate boats (their x follows the gull's z, so it is exact).
// Rivals and kites move with time and are left out. Needs the game served on 8765 (python serve.py).
// Usage: node tests/passable.cjs [runs] [km] [city,...]   (VLAT=17 by default; VLAT=0 must report failures: sanity check)
const path = require('path');
const NPM = path.join(process.env.APPDATA || '', 'npm/node_modules');
let playwright;
for (const p of [path.join(NPM, '@playwright/cli/node_modules/playwright'), path.join(NPM, 'playwright'), 'playwright']) { try { playwright = require(p); break; } catch (e) {} }
const { chromium } = playwright;
const RUNS = +process.argv[2] || 3, KM = +process.argv[3] || 25, CITIES = (process.argv[4] || 'istanbul,izmir,antalya').split(',');
const VLAT = process.env.VLAT !== undefined ? +process.env.VLAT : 17, EDGE = 3.85, FLY_Y = 5.15, OBSK = 0.08, DX = 0.05, DZ = 0.4;
const SPEED_MAX = 43, clamp = (v, a, b) => Math.max(a, Math.min(b, v)); // hız formülü main.js spdCap ile aynı kalmalı
const overAt = m => clamp((m - 6500) / 7000, 0, 2), spdCap = m => SPEED_MAX * (1 + 0.16 * Math.min(1.3, overAt(m)));
const SPD = (() => { const a = []; let t = 0, d = 0; while (d < 60000) { const v = Math.min(spdCap(d), 15 + 14 * (1 - Math.exp(-t / 75)) + t * 0.032); if (d >= a.length * 100) a.push(v); d += v / 2 / 30; t += 1 / 30; } return a; })();
const tierAt = m => [5000, 10000, 15000].reduce((s, t) => s + clamp((m - t) / 300, 0, 1), 0); // main.js TIER_M / TIER_SPD ile aynı kalmalı
const CITY_SPD = 0.08, CITY_I = { istanbul: 0, izmir: 1, antalya: 2 }; // main.js cityKAt ile aynı kalmalı
let cityI = 0; const cityK = m => 1 + CITY_SPD * cityI * clamp((m - 500) / 1000, 0, 1) * clamp((14000 - m) / 6000, 0, 1);
const spdAt = m => SPD[clamp(Math.round(m / 100), 0, SPD.length - 1)] * cityK(m) * (1 + 0.045 * tierAt(m));

function solve(w) {
  const NX = Math.round(2 * EDGE / DX) + 1, X = i => -EDGE + i * DX;
  const stat = w.obs.filter(o => o.top > FLY_Y && (o.kind !== 'yelkene' || o.fix) && o.kind !== 'korsana' && o.kind !== 'paraşüt ipine'); // yarış yelkenlisi (fix) yerinde durur; paraşüt ipi kayar ve incedir, kapatamaz
  // z'ye göre sıralı statik engeller: tarama penceresi
  stat.sort((a, b) => b.z - a.z);
  const tail = w.tempo.filter(t => t.kind === 'tail'), calm = w.tempo.filter(t => t.kind === 'calm');
  let reach = new Uint8Array(NX).fill(0); reach[Math.round(EDGE / DX)] = 1;
  const fails = []; let carry = 0, si = 0, active = [], minFree = Infinity, minAt = 0;
  const zEnd = -2 * KM * 1000;
  for (let z = -60; z > zEnd; z -= DZ) {
    const m = -z / 2;
    let v = spdAt(m);
    if (tail.some(t => m > t.m0 && m < t.m1)) v *= 1 + 0.14 * (1 - 0.6 * Math.min(1, overAt(m)));
    else if (calm.some(t => m > t.m0 && m < t.m1)) v *= 0.87;
    carry += VLAT * DZ / v / DX; const step = Math.floor(carry); carry -= step;
    // genişlet (yanal hareket)
    const nr = new Uint8Array(NX);
    for (let i = 0; i < NX; i++) if (reach[i]) { const a = Math.max(0, i - step), b = Math.min(NX - 1, i + step); for (let j = a; j <= b; j++) nr[j] = 1; }
    // bu z'de engeller
    while (si < stat.length && stat[si].z - stat[si].hd - OBSK - 1 < z + 40) active.push(stat[si++]);
    active = active.filter(o => o.z - o.hd - OBSK < z + 1);
    const boxes = [];
    for (const o of active) if (Math.abs(z - o.z) < o.hd + OBSK) boxes.push([o.x - o.hw - OBSK, o.x + o.hw + OBSK, o.kind]);
    for (const c of w.mov.sails) if (Math.abs(z - c.z) < 0.45 + OBSK) { const cx = c.xa + c.side * clamp((z - c.z) * c.k, -6, 9) + c.side * 1.0; boxes.push([cx - 1.21 - OBSK, cx + 1.21 + OBSK, 'yelkene']); }
    for (const p of w.mov.pirates) { const x = p.xa + p.side * Math.max(-40, z - p.z) * p.k; for (const q of p.os) if (q.top > FLY_Y && Math.abs(z - q.z) < q.hd + OBSK) boxes.push([x + q.off - q.hw - OBSK, x + q.off + q.hw + OBSK, 'korsana']); }
    for (const [a, b] of boxes) for (let i = Math.max(0, Math.ceil((a + EDGE) / DX)); i < NX && X(i) < b; i++) nr[i] = 0;
    let any = 0; for (let i = 0; i < NX; i++) any += nr[i];
    if (boxes.length && any * DX < minFree) { minFree = any * DX; minAt = m; }
    if (!any) { fails.push({ m: Math.round(m), kinds: [...new Set(boxes.map(b => b[2]))].join('+'), boxes: boxes.map(b => `${b[2]}[${b[0].toFixed(1)},${b[1].toFixed(1)}]`).join(' ') }); reach = new Uint8Array(NX).fill(1); for (const [a, b] of boxes) for (let i = Math.max(0, Math.ceil((a + EDGE) / DX)); i < NX && X(i) < b; i++) reach[i] = 0; continue; }
    reach = nr;
  }
  return { fails, minFree: +minFree.toFixed(2), minAt: Math.round(minAt) };
}

(async () => {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.route('**/rest/v1/**', r => r.abort());
  await p.addInitScript(() => { for (const [k, v] of Object.entries({ 'simit-martisi-reset-2026-10-31': '1', 'simit-martisi-eco-reset-2026-11-09': '1', 'simit-martisi-tut': 'true', 'simit-martisi-route': '99', 'simit-martisi-route-izmir': '99' })) localStorage.setItem(k, v); });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8765/?q=0' + (process.env.QS || ''));
  await p.waitForFunction(() => window.__game && __game.state === 'title', null, { timeout: 30000 });
  let total = 0;
  for (const city of CITIES) for (let r = 0; r < RUNS; r++) {
    const w = await p.evaluate(([city, km]) => {
      __game.setCity(city); __game.startGame(); __game.setGod(true);
      for (let z = -400; z > -2 * km * 1000 - 400; z -= 400) __game.genTo(z);
      return { obs: __game.obsAll, mov: __game.movAll, tempo: __game.tempo.list.map(s => { const m = s.match(/^([a-z]+)(\d+)-(\d+)$/); return { kind: m[1], m0: +m[2], m1: +m[3] }; }) };
    }, [city, KM]);
    cityI = CITY_I[city] || 0; const res = solve(w); total += res.fails.length;
    console.log(`${city}#${r}: obstacles ${w.obs.length} sails ${w.mov.sails.length} pirates ${w.mov.pirates.length} | IMPOSSIBLE ${res.fails.length}`);
    for (const f of res.fails.slice(0, 6)) console.log('   ✗', f.m, 'm', f.boxes);
  }
  console.log('TOTAL IMPOSSIBLE', total);
  process.exitCode = total ? 1 : 0;
  await b.close();
})();
