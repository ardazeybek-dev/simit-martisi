# Simit Martısı 🐦🥯

A 3D endless flyer that runs in the browser, on desktop and on phones.
You are an Istanbul seagull gliding over ferries at sunset, snatching *simit* from passengers' hands
while dodging funnels, flag masts and rival gulls.

**Play:** https://ardazeybek-dev.github.io/simit-martisi/

## Controls

| Device | Steer |
|---|---|
| Phone | Slide your finger left / right |
| Desktop | Move the mouse, or ← → / A D |

`M` mutes the sound. Catching simits in a row builds a combo (up to x5).
The score card can be shared straight to WhatsApp or other apps from the game-over screen.

## Tech

- Single file: [`docs/index.html`](docs/index.html), no build step
- [three.js](https://threejs.org/) 0.160 loaded from jsDelivr via an import map
- Low-poly scene built entirely in code: animated sea, ferries, passengers, Istanbul skyline with the bridge
- All sound effects (seagull cry, ferry horn, crunch) are synthesized with the Web Audio API, no audio files
- Best score is kept in `localStorage`

## Run locally

Open `docs/index.html` in a browser. An internet connection is needed the first time to load three.js.

No environment variables are needed.

## Project structure

```
docs/index.html   the whole game (served by GitHub Pages from /docs)
README.md
```

## Pitfalls

- `Object.assign(mesh, { position })` throws in three.js because `position` is read-only → use `mesh.position.set(...)`.
- Headless browsers render WebGL with SwiftShader at a low frame rate; since `dt` is capped, gameplay runs in slow motion there, not a bug.
