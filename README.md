# Simit Martısı

A one-finger 3D endless flyer for phones and desktop browsers.
You are an Istanbul seagull gliding over ferries at sunset, snatching *simit* from passengers' hands
while dodging funnels, flag masts, kites and rival gulls.

**Play:** https://ardazeybek-dev.github.io/simit-martisi/ (installable, works offline after the first visit)

![Title, gameplay and game-over screens](docs/preview.png)

## Controls

| Device | Steer | Other |
|---|---|---|
| Phone | Slide your finger left / right (the middle 80% of the screen covers the whole lane) | Pause button top right |
| Desktop | Move the mouse, or ← → / A D | `P` / `Esc` pause, `M` sound on/off, `Space` start |

The game pauses itself when the tab or app goes to the background and resumes with a 3-2-1 countdown.

## Gameplay

- **Goal: fly the Bosphorus line.** Every flight leaves Kadıköy and heads up the strait: Karaköy (400 m), Beşiktaş, Ortaköy, Bebek, Rumeli Hisarı, Emirgan, Sarıyer and the Black Sea (6,800 m). The HUD shows the next pier and the metres left; a pier is a gate with its name board, the terminal on the bank and a simit line ending in a golden simit right under the sign. Flying under the sign triggers a short slow-motion moment with fireworks, then the crowd on the pier throws a shower of simit pieces into the lane; arriving pays bonus points and the flight goes on to the next pier. The first time you reach a pier it pays simits (25 up to 750) and lights up on the title-screen route map; the game-over screen tells you how far the next pier was.
- **Cities:** fly the Bosphorus to the Black Sea and İzmir opens; pick the city with the arrows above the route map on the title screen. Each city keeps its own pier progress and first-arrival gifts; the wallet, outfits, missions and leaderboard are shared. Antalya is listed as coming soon.
  - *İzmir:* Üçkuyular to Bostanlı (7,200 m) past Göztepe, Konak, Pasaport, Alsancak, Bayraklı and Karşıyaka, under an Aegean afternoon sky with the Konak clock tower, Kadifekale and the Bayraklı towers on the horizon. You catch gevrek instead of simit (same value). There is no bridge; instead the *imbat* blows: white wind streaks sliding across the water mark a gust lane that pushes the gull downwind while gevreks tumble across it, so leaning with the wind catches them.
- **Score** = simit points + 1 point per 10 m flown.
- **Lane and hit boxes:** the lane is as wide as a ferry (the gull can reach just past the rails) and steering is quick, so a late dodge still works. Hazards hit only when you really touch them; rival gulls are clearly smaller than yours. Simits and power-up bubbles are picked up from a generous distance around the gull.
- **Combo:** catch simits in a row to raise the multiplier; it climbs slowly (x2 at 3, x3 at 12, x4 at 27, x5 at 48) and the chain dies if you go about 1.5 s without a catch. The ring in the HUD shows how long it stays alive.
- **Simit boats:** on open water, simit sellers in rowboats on both banks break their simits and toss the pieces to you. Each piece is a quarter simit (a quarter of the points and of the wallet value); it arcs over and comes down where a ripple ring marks the water, right as you get there; miss it and it splashes into the sea.
- **Golden simit:** rare, worth 5x a normal one.
- **Dolphins:** on open water a pod shows its fins, then leaps across the lane one after another as you arrive. Fly right over the top of a leap for a *Dolphin!* bonus that also refreshes your combo timer. They never hurt you.
- **Near miss:** brushing past a funnel or mast gives a small bonus.
- **Turns:** the Bosphorus bends every 15-25 seconds, sometimes in an S. Red chevron boards and a *VİRAJ* sign warn you first. Inside a turn the wind pushes the gull outward, so lean toward the inside: the simits trace the racing line with a golden one at the apex. Catch most of the line for a *Perfect turn* bonus and a slingshot burst of speed.
- **Power-ups** (floating bubbles): Magnet pulls simits (even out of passengers' hands), Shield absorbs one hit, 2x doubles all points.
  Upgrade them with simits in the *Güçlendir* panel: five levels each (300 up to 4,000 simits a level), every level adds a quarter of the base time.
- **Hazards:** funnels, flag masts, kites, rival gulls. Dark funnel smoke does not kill you but breaks your combo.
  - Hazards stay sparse early on: rival gulls come one at a time from about 200 m, red ones after Karaköy, blue ones after Beşiktaş; the first Galata Bridge comes after Karaköy.
  - Rival colour tells you how it flies: *grey* glides side to side, *red* dives straight at you from further out, *blue* zigzags at random.
- **Passengers:** big-headed, round-eyed and rosy-cheeked; uncles, grandpas, aunties, young women and lads, each with their own outfit; snatch a simit and they get angry. The decks are kept sparse: most of the few who stand hold a simit (snatch it, they get angry); a handful sit on benches looking out to sea with a glass of tea and no simit. A *feeder* at the rail holds a simit out for you: take it and they cheer and pay a bonus. On some ferries a passenger at the rail breaks their simit and throws the pieces into the air over the deck, like the simit boats do; a ring on the deck marks where each piece comes down.
- **Galata Bridge:** every 1-1.5 km the lane passes under the bridge. Anglers on both rails dangle their lines down to the water at uneven gaps (a red float marks each one); thread between them, front row then back row, following the simits. Touch a line and you are hooked. Clear both rows for an *Under the bridge!* bonus.
- **Deck props:** when you come near a green rubbish bin its lid pops and a simit piece jumps up to your height; crates with a cat that hisses as you pass; rope coils.
- **Glass salon ferries:** further on, some ferries carry a closed two-storey glass salon. Fly through the open passage in the middle and collect the simits inside; the glass on either side is solid.
- **Weather follows the real calendar** (picked again every flight): snow in winter, mostly rain in autumn, now and then fog, mostly clear in spring and summer.
  - *Rain:* lightning, and gusts of wind shove the gull sideways; steer against them.
  - *Snow:* a warmth meter drains while you fly. Simits warm you up (a golden one a lot); let it run out and you freeze, losing your combo.
  - *Fog:* the view shortens, hazards appear late, ferry horns sound through the mist.
- **Speeding up:** the further you fly, the faster it gets. A *Speed up!* call every 300 m; the climb is steep in the first minute and keeps creeping up until a top speed. After about 1.6 km the lane does not get more crowded but smarter: more red and blue rivals, red ones dive a little faster, open water gets shorter; rivals start moving earlier at high speed so there is still time to react.
- **Second chance:** spend fish to keep flying from where you crashed, with a shield and a 3-2-1 countdown. Each revive in the same flight costs twice the last one (1, 2, 4... fish); the button shows up once you own a fish. On the portal build a rewarded ad also gives one revive per flight after a good run (250+ points and at least 40% of your best).
- **Simit wallet:** four simits you catch put one simit in the wallet (a golden one counts as 5 caught); the game-over screen shows the conversion and counts the earnings into the wallet. Spend them on outfits in the *Kostümler* panel: fez, beanie, captain hat, golden crown, simit seller's tray, sunglasses, heart glasses, scarf, bow tie, evil-eye bead, moustache, and pink, mint, night, sunset, ice or golden feathers. Tapping an item previews it on the gull; a separate button buys, wears or takes it off. Head, eyes, neck, face and feathers each take one item. Every day one outfit you do not own is 40% off (*deal of the day*).
- **Fish:** the second currency. Fish splash on open water fairly often (one is guaranteed in the first open water after about 300 m) and leap up to the gull's height as you arrive. Touch one and you usually catch it (about 65%: a fish for the wallet, a small bonus, a fresh combo timer and a *Balık!* bubble) or it slips away (*Kaçtı!*). Fish pay for revives; the 7th day of the daily reward streak also gives one.
- **Weekly leaderboard:** about 1.2 million players (offline: bots seeded by the week, so everyone sees the same table) with names and flags from 20 countries. Bot scores grow through the week, so holding your rank means flying again. Your weekly best sets your rank; the game-over screen shows it and how far you climbed. When the week ends you get simits by your final rank (top 100: 1,000, top 1,000: 500, top 10,000: 250, top 100,000: 100, top 50%: 40, otherwise 15). The panel tells you how many points the next tier needs.
- **Missions:** come in sets of three ("catch 30 simits in one flight", "5 close calls", "fly under the bridge twice"...). A finished mission pays simits right away; when all three are done the next set arrives at the start of the next flight, about 15% harder and paying about 10% more each set (capped at what one flight allows). At most three sets a day; a new day also replaces a set you got stuck on. On the game-over screen the bars fill up from where the flight started and finished missions light up. The menu badge counts new missions and clears once you open the panel.
- **Achievements:** twelve long-term goals (total simits, golden simits, longest flight, best score, streak, snatched simits, close calls, perfect turns, dolphins, bridges, flights, outfits), each with bronze, silver and gold tiers paying 25 / 75 / 200 simits, claimed in the *Başarımlar* panel. Your earlier best score and furthest pier count from the start.
- **Badges:** a collection tab in the *Başarımlar* panel with 21 badges and no rewards: total distance (1 km up to 10,000 km), days in a row (3 up to 365), flights, fish, simits, finished cities, and a 500 m flight in rain, snow and fog. Newly earned badges glow and are counted on the menu button until you look; tap a badge to see how to earn it.
- **Quiet screen:** no floating score texts during a flight; bonuses, missions and power-ups land silently in the score and the wallet. Only the *VİRAJ* sign, the pier arrival card, the passengers' short speech bubbles (when you snatch their simit, at most one every couple of seconds) and *Balık!* / *Kaçtı!* when you touch a fish appear. Passengers say something different every time: about 130 lines by passenger type (uncle, grandpa, auntie, young woman, lad, child) plus shared ones, and no line repeats within a flight.
- **Settings:** music and sound effects volume sliders (also in the pause menu), vibration, and language (Turkish, English, German or Spanish, the browser language by default).
- First launch shows a 3-second swipe tutorial; best score, settings, wallet, outfits and missions are kept in `localStorage`.

## Tech

- Plain ES modules under `docs/`, no build step; [three.js](https://threejs.org/) 0.160 from jsDelivr via an import map
- All models are generated in code and merged into vertex-coloured meshes (one draw call per ferry / passenger)
- Soft pastel sunset sky over clear turquoise water, custom GPU wave shader with fresnel and sun glitter (waves calm down with distance into a hazy far sea), gradient sky dome, Istanbul skyline (Galata Tower, mosques, Bosphorus Bridge, Maiden's Tower)
- Off-lane scenery: ferries and container ships cruising past in the outer lanes, ship silhouettes drifting along the horizon, flocks of gulls in V formation high in the sky (one instanced mesh, never in your way), anchored fishing boats, sailboats and small yachts whose crews jump and wave as you pass, orange lifebuoys on the hulls, a big cruise ship with a jumping crowd on its top deck and terraces (instanced, a few draw calls), and every 1-2 km a close pass by the Maiden's Tower on its islet
- Pooled instanced particles, smoke sprites, speed lines, camera shake, hit-stop
- Music and all sound effects are synthesized with the Web Audio API, no audio files: a Hicaz tune with plucked saz strings (Karplus-Strong), kanun tremolo, a ney in the middle section and darbuka in maqsum rhythm; cymbals and fills join in as the flight speeds up
- Adaptive quality: pixel ratio steps down automatically on slow devices; turning shadows off recompiles every shader, so that switch waits for the menu or the game-over screen instead of freezing a flight. Phones start at medium quality without MSAA and without shadow maps (the gull keeps its blob shadow), and the audio uses a larger buffer, a longer scheduling window and pre-built saz strings
- PWA: web app manifest + service worker (network-first for game files, cache-first for the pinned three.js build)

## Run locally

Serve the `docs/` folder over HTTP (ES modules do not load from `file://`):

```
cd docs
python -m http.server 8000
```

Then open http://localhost:8000. An internet connection is needed the first time to load three.js and the font.
The service worker only registers on https, so local runs are never cached.

Append `?turn=0` to fly a straight Bosphorus without turns, `?throw=0` for the old floating simits instead of thrown ones, or `?pal=old` for the earlier deep sunset colours, `?weather=rain|snow|fog|clear` to force the weather, `?bridge` to meet the Galata Bridge right away, `?salon` to give every ferry a glass salon, `?stop` to put the piers very close together (handy for comparing).

Append `?q=0`, `?q=1` or `?q=2` to the URL to lock the quality level (low / medium / high) and turn off automatic adjustment.

No environment variables are needed.

## Portal build (CrazyGames)

`platform/build.py` writes a portal copy to `platform/crazygames/` without touching `docs/`:

```
python platform/build.py                 # platform/crazygames/
python platform/build.py --zip <out_dir> # also simit-seagull-crazygames.zip, index.html at the zip root
python platform/covers.py <out_dir>      # 1920x1080, 800x1200 and 800x800 covers (needs Playwright)
```

The portal copy:
- loads three.js and the Baloo 2 font from `platform/vendor/` (portals reject absolute URLs),
- drops the service worker, manifest, social meta tags and the share button,
- calls the CrazyGames SDK v3: loading and gameplay events, `happytime` on a new best, a rewarded ad for the second chance (granted only on `adFinished`; on error the player sees "No ad available"), a midgame ad on "play again" after 60 s of play (never on the title screen: no ads behind menu buttons; skipped when a second chance was just offered), audio muted during ads and when the portal asks for it.

Without the SDK (ad blocker, local run) every portal call is a no-op and the game plays normally.
`?pf_minplay=0` shows the ad break on the first restart, for testing.

The build patches `docs/` source by exact string match and stops with `patch '<name>': expected 1 match` when the game code changed. Update the matching line in `build.py` then.
New game features need no new patch: call portal functions as `window.PF && PF.x ? ... : fallback`, never declare `PF` or `T` in `main.js` (the build injects them), and wrap new texts in `tr()` and add them to the `EN` table in `docs/js/i18n.js` (shared by both builds; static HTML texts are translated once at load).

## Project structure

```
docs/
  index.html            markup, meta tags, import map
  style.css             UI (HUD, screens, animations)
  js/i18n.js            language table and translation (classic script, loads before main.js)
  js/main.js            game state, input, spawning, collisions, main loop
  js/scene.js           renderer, camera, lights, sky, per-city skyline and colours, water shader
  js/models.js          seagull, outfits, simit, passengers, ferry, kite, power-ups
  js/fx.js              particles, sparkles, smoke, speed lines, floating texts
  js/audio.js           synthesized music and sound effects
  js/cities.js          cities: pier lines, save keys, pickup type and city-only features (bridges, imbat)
  js/board.js           weekly leaderboard: seeded bot players, flags, rank from score, end-of-week rewards
  js/util.js            helpers, mesh merging, safe localStorage
  sw.js                 service worker (bump VERSION on every release)
  manifest.webmanifest  PWA manifest
  icons/                app icons (SVG source + rendered PNGs)
  og.png, preview.png   social preview and README image
platform/
  build.py              portal copy of docs/ (see above)
  covers.py             cover images rendered from the title scene
  src/platform.js       portal adapter: SDK calls, ad breaks
  vendor/               three.module.min.js r160, Baloo 2 woff2 + OFL licence
```

## Pitfalls

- `renderer.info.memory.geometries` keeps climbing during long runs when spawns build new geometry/materials (removing from the scene does not free GPU buffers) → cache them per variant (ferry length, gull type, passenger look) and reuse.
- Script order breaks loading: a `<link rel="modulepreload">` before the import map makes Firefox ignore the map ("bare specifier" error), and the CrazyGames SDK initialised from `<head>` throws `Cannot read properties of null (reading 'appendChild')` → import map first, SDK and adapter at the end of `<body>`; paths must stay relative (`./`, `sw.js`, `icons/...`) since Pages serves from `/simit-martisi/`.
- Colour traps: merged geometry coloured per triangle by height gives zebra stripes on tall faces → build each colour band as its own extrusion; a colour mixed in by hand after `fog_fragment` in a ShaderMaterial comes out dark and salmon (it is linear, the output is sRGB) → wrap it in `linearToOutputTexel`.
- Headless browsers render WebGL with SwiftShader at a low frame rate, so quality drops to the lowest level and gameplay runs in slow motion; Playwright WebKit on Windows also stops showing the canvas after any canvas resize → test WebKit with `?q=1`.
- Shader traps: bending the world in eye space with a downward-pitched camera lifts far water above the skyline in turns → bend in a level frame (`uLevel`, camera pitch and roll removed); toggling shadows recompiles every material (seconds of freeze on phones) → never toggle mid-flight; `sin()` of world coordinates in the thousands turns the water grainy on phone GPUs far along the route → feed local coordinates (`uOrigin`) and phases wrapped to 2π on the CPU.
