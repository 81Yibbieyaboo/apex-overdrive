# Apex Overdrive

An original low-poly F1-style arcade racer built with Three.js. Race a generated open-wheel hero car from a third-person chase camera across three two-lap circuits, launch off ramps, drift through corners, and hold speed through a magnetic wall ride.

## Features

- **Three distinct circuits:** Harbor Sprint, Canyon Run, and Vault Ring.
- **Arcade driving:** throttle, brake/reverse, steering, handbrake drift, and a rechargeable boost.
- **Ramps and air time:** crossing a ramp crest above the launch threshold puts the car into ballistic flight; a clean landing awards a short speed boost.
- **Vault Ring wall ride:** a sustained 76-degree bank with matching car orientation, camera roll, signage, and a low-speed assist.
- **Timing:** countdown, live race clock, lap timer, two-lap classification, local personal bests, and best-lap records per circuit.
- **Guest global boards:** one immutable race-time board per circuit, with local play never blocked by network failure.
- **Presentation:** procedural track furniture, grandstands, themed harbor/canyon/arena scenery, generated car model, generated music and race cues, responsive HUD, and touch controls.

## Controls

| Action | Keyboard / Gamepad |
| --- | --- |
| Throttle | W / Up / RT |
| Brake / reverse | S / Down / LT |
| Steer | A D / Left Right / Left stick |
| Drift | Space / A button |
| Boost | Shift / B button |
| Pause | Esc / Start |

On touch devices, use the on-screen steering, GO/BRK, DRIFT, and BOOST controls. The settings screen also supports gamepad navigation and remapping through the starter input layer.

## Run locally

```bash
pnpm install
PORT=3000 HOST=0.0.0.0 pnpm dev
```

The development server serves the generated car, audio, and sharing artwork from `assets/`. Production builds use the verified `/manus-storage/game/sha256/...` addresses registered in `assets.lock.json`.

## Verify

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

`pnpm test` covers race timing, save records, track geometry/features, ramp launches, landing boosts, wall-ride state, and barrier contact. `pnpm smoke` boots the game in Chromium and checks the hero car, all three circuits, real throttle movement, pause/settings, results, and the portrait mobile HUD.

## Backend

The optional guest leaderboard lives in `server/` and is configured through `leaderboard.config.json` plus the additive migration in `server/leaderboard/migrations/004_apex_boards.sql`. It is mounted at `/api/*` through the project deployment configuration. A local backend can be started with:

```bash
PORT=8787 node server/index.mjs
```

The Vite development server proxies `/api` to `http://127.0.0.1:8787` by default; set `VITE_API_PROXY` to point at a different local backend.

## Assets and sharing

- Hero car: `assets/models/apex-car.glb`
- Music and cues: `assets/audio/`
- Sharing artwork: `assets/share/`
- Sharing metadata: `game-sharing.json`
- Registered manifest: `assets.lock.json`

The car, audio, and artwork are registered game assets. The track, scenery, effects, HUD, and fallback car geometry are procedural and remain in source.
