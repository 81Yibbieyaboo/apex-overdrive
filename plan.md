# Apex Overdrive — Implementation Plan

## Product goal

A polished, single-player 3D arcade racing game inspired by the toy-like clarity of PolyTrack. The player drives an original low-poly open-wheel car from a third-person chase camera through three lap-based circuits. Every circuit has jump ramps; one circuit features a dedicated banked wall-ride. A live race clock, lap timer, personal bests, and a shared per-track leaderboard drive replay.

## Gameplay and systems

- **Three tracks:** Harbor Sprint (flowing starter), Canyon Run (big air and technical bends), and Vault Ring (high-speed wall-ride circuit).
- **Arcade driving:** throttle, brake/reverse, steering, handbrake drift, boost. Speed, curvature, lateral grip, and track banking are tuned independently per track.
- **Track model:** closed Catmull-Rom centerlines with width, elevation, and bank profiles. The surface, curbs, guardrails, supports, signage, checkered start line, scenery, and minimap derive from the same sampled track data.
- **Ramps and jumps:** ramps are explicit track zones with a launch marker. Crossing the crest above a minimum speed launches a ballistic jump. Clean landings award a short speed boost; the HUD announces jumps.
- **Wall ride:** Vault Ring smoothly banks to roughly 76 degrees for a sustained section. Car orientation, camera roll, guardrails, supports, and UI all follow the surface basis. A minimum speed assist keeps the section playable.
- **Race flow:** title → track select → 3-2-1 countdown → 2 timed laps → results. Timer starts at GO; lap times are recorded on start-line crossings. Restart is immediate. Personal bests and best lap per track persist in local storage.
- **Leaderboard:** guest identity, per-track immutable boards ranked by race time. The API remains optional; local play never blocks on the network. Guest display name is captured before a ranked run.
- **Controls:** keyboard/gamepad/touch through the existing unified input layer. Keyboard: W/S throttle/brake, A/D steer, Space drift, Shift boost, Esc pause. Touch: steering/throttle pad and DRIFT/BOOST buttons. Gamepad equivalents are mapped.

## Design direction

### Style sampling

- Neo-brutalist pit lane — 0.08
- Sun-bleached toy motorsport — 0.06
- Synthwave wind tunnel — 0.04

**Chosen: Sun-bleached toy motorsport.** The reference calls for PolyTrack's low-poly clarity rather than simulation realism. The palette is warm asphalt and cream architecture, tangerine safety accents, deep teal shadows, and chalk-white markings. The car carries a coral/cream/charcoal livery.

- **Design movement:** playful toy-scale motorsport rendered as clean geometric architecture.
- **Core principles:** silhouette first; readable track edges at speed; generous negative space; a single strong safety accent.
- **Color philosophy:** warm sand and cream make the world feel sunlit and optimistic; deep ink teal anchors the HUD; tangerine is reserved for danger, boost, and the player car.
- **Layout paradigm:** asymmetric title screen with the car staged low-right and a left-aligned race-briefing panel; in-game HUD hugs the frame edges so the vanishing point stays clear.
- **Signature elements:** chunky rounded display type; slanted hazard stripes; oversized track-name numerals and a thin racing line motif.
- **Interaction philosophy:** instant, legible response. Buttons punch in; the camera leans with steering; every reward has a clear audiovisual callout.
- **Animation:** short 160–280 ms UI transitions, exaggerated squash on impact, smooth camera spring, drifting tire smoke, and a subtle speed-line vignette at high velocity.
- **Typography:** bundled ManusCC0 for a sturdy geometric display voice; condensed uppercase labels and tabular-feeling numerals in the HUD.
- **Brand essence:** a bright, low-poly arcade racer about clean lines and brave jumps; energetic, precise, friendly.
- **Brand voice:** short pit-wall commands, never filler. Examples: “Hold the line. Find the air.” and “One more lap. Make it count.”
- **Wordmark and logo:** “APEX / OVERDRIVE” stacked in italic geometric caps, with a chevron cutting through the A; the mark doubles as the favicon.
- **Signature color:** safety tangerine `#ff6b35`.

## Technical architecture

- Keep the starter's fixed-step loop, unified input, renderer, audio mixer, save parsing, i18n mechanism, Tuning bridge, and smoke script.
- Replace the platformer game layer with:
  - `src/game/tracks.ts`: pure track definitions, sampled centerlines, surface/bank/elevation functions, features, minimap points, and tests.
  - `src/game/world.ts`: procedural environment, road mesh, barriers, curbs, ramps, wall ride, start gantry, grandstands, scenery, lighting, sky.
  - `src/game/car.ts`: arcade car simulation on the sampled track, jumps, drift, boost, wall-ride orientation, collision against barriers, and respawn.
  - `src/game/car-model.ts`: generated GLB hero car loader with a procedural fallback, shadow, brake lights, and wheel spin.
  - `src/game/camera.ts`: third-person chase/orbit camera with speed FOV, collision-free spring, title showcase mode.
  - `src/game/rules.ts`: pure countdown, lap, timer, best-time, and result logic.
  - `src/game/game.ts`: scene orchestration and audio/UI event routing.
  - `src/game/config.ts`: tuning defaults, kept compatible with the Tuning bridge.
  - `src/ui/ui.ts` + `src/styles/main.css`: title, track select, loading, HUD, pause, settings, leaderboard, results, touch controls.
- Backend: install the packaged guest leaderboard runtime, add immutable per-track boards, apply the additive migrations, configure hybrid `/api/*` routes, and use the installed client at race settlement. Store only guest identity, run tickets, board ID, score, and duration.
- Assets: generate one high-quality hero car reference and one PBR GLB, plus all sound effects and one looping original music cue. Register through the Three.js asset lifecycle and use stable Storage paths. Track/environment geometry remains procedural.
- Sharing: game-specific favicon, OG artwork, title/description in `game-sharing.json`, then `game/sharing/prepare` and build verification.

## Project structure

```
src/
  engine/       fixed loop, input, renderer, audio, save, i18n (adapted)
  game/         tracks, world, car, car-model, camera, rules, config, game
  ui/           DOM screens, HUD, touch controls
  i18n/         English player-facing copy
  styles/       game presentation
server/         guest leaderboard runtime, Dockerfile, migrations
assets/         generated car GLB, audio, favicon, OG image
tests/          pure track/race rules and adapted smoke coverage
```

## Delivery requirements

- Build passes TypeScript and bundle checks.
- Game-specific loading screen and favicon are present.
- Menu, track select, three playable circuits, timer, ramps, and wall ride work.
- Local results, restart, best times, and leaderboard integration are implemented.
- Asset manifest, Dockerfile, migrations, routes, and deployment configuration are committed.
- Checkpoint is recorded before delivery; publication only when separately authorized.


## Implementation outcome

All planned systems are implemented in the Three.js project. The final production build uses registered Manus Storage paths for the generated car, music/cues, favicon, and OG cover. The optional guest leaderboard is backed by the additive `004_apex_boards.sql` migration and hybrid `/api/*` routing. Character rigging is not applicable because the game has no animated characters; the hero car uses procedural wheel spin, suspension pitch, steering, brake lights, and boost flames.

Verification is recorded in `TODO.md`: TypeScript, 14 unit tests, the sharing build, and a desktop/mobile Playwright smoke pass all succeed.
