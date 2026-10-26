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

- **Score** = simit points + 1 point per 10 m flown.
- **Combo:** catch simits in a row to raise the multiplier (x2 at 4, up to x5). The ring in the HUD shows how long the chain stays alive.
- **Golden simit:** rare, worth 5x a normal one.
- **Near miss:** brushing past a funnel or mast gives a small bonus.
- **Power-ups** (floating bubbles): Magnet pulls simits (even out of passengers' hands), Shield absorbs one hit, 2x doubles all points.
- **Hazards:** funnels, flag masts, rival gulls, kites. Dark funnel smoke does not kill you but breaks your combo.
- Speed and hazard density ramp up smoothly over the first couple of minutes.
- First launch shows a 3-second swipe tutorial; best score and settings (sound, music, vibration) are kept in `localStorage`.

## Tech

- Plain ES modules under `docs/`, no build step; [three.js](https://threejs.org/) 0.160 from jsDelivr via an import map
- All models are generated in code and merged into vertex-coloured meshes (one draw call per ferry / passenger)
- Custom GPU wave shader with fresnel and sun glitter, gradient sky dome, Istanbul skyline (Galata Tower, mosques, Bosphorus Bridge, Maiden's Tower)
- Pooled instanced particles, smoke sprites, speed lines, camera shake, hit-stop
- Music loop and all sound effects are synthesized with the Web Audio API, no audio files
- Adaptive quality: pixel ratio and real-time shadows step down automatically on slow devices
- PWA: web app manifest + service worker (network-first for game files, cache-first for the pinned three.js build)

## Run locally

Serve the `docs/` folder over HTTP (ES modules do not load from `file://`):

```
cd docs
python -m http.server 8000
```

Then open http://localhost:8000. An internet connection is needed the first time to load three.js and the font.
The service worker only registers on https, so local runs are never cached.

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
- opens in English unless the browser language is Turkish,
- calls the CrazyGames SDK v3: loading and gameplay events, `happytime` on a new best, a midgame ad between runs after 60 s of play, audio muted during ads and when the portal asks for it.

Without the SDK (ad blocker, local run) every portal call is a no-op and the game plays normally.
`?pf_minplay=0` shows the ad break on the first restart, for testing.

The build patches `docs/` source by exact string match and stops with `patch '<name>': expected 1 match` when the game code changed. Update the matching line in `build.py` then.

## Project structure

```
docs/
  index.html            markup, meta tags, import map
  style.css             UI (HUD, screens, animations)
  js/main.js            game state, input, spawning, collisions, main loop
  js/scene.js           renderer, camera, lights, sky, skyline, water shader
  js/models.js          seagull, simit, passengers, ferry, kite, power-ups
  js/fx.js              particles, sparkles, smoke, speed lines, floating texts
  js/audio.js           synthesized music and sound effects
  js/util.js            helpers, mesh merging, safe localStorage
  sw.js                 service worker (bump VERSION on every release)
  manifest.webmanifest  PWA manifest
  icons/                app icons (SVG source + rendered PNGs)
  og.png, preview.png   social preview and README image
platform/
  build.py              portal copy of docs/ (see above)
  covers.py             cover images rendered from the title scene
  src/platform.js       portal adapter: SDK calls, ad breaks, English texts
  vendor/               three.module.min.js r160, Baloo 2 woff2 + OFL licence
```

## Pitfalls

- `renderer.info.memory.geometries` keeps climbing during long runs when spawns build new geometry/materials (removing from the scene does not free GPU buffers) → cache them per variant (ferry length, gull type, passenger look) and reuse.
- Script order breaks loading: a `<link rel="modulepreload">` before the import map makes Firefox ignore the map ("bare specifier" error), and the CrazyGames SDK initialised from `<head>` throws `Cannot read properties of null (reading 'appendChild')` → import map first, SDK and adapter at the end of `<body>`.
- Colouring merged geometry per triangle by height gives zebra stripes on tall faces → build each colour band as its own extrusion.
- Headless browsers render WebGL with SwiftShader at a low frame rate, so quality drops to the lowest level and gameplay runs in slow motion; Playwright WebKit on Windows also stops showing the canvas after any canvas resize → test WebKit with `?q=1`.
- Paths must stay relative (`./`, `sw.js`, `icons/...`): the site is served from `/simit-martisi/`, a leading `/` works on localhost but breaks on Pages.
