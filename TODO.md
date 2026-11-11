# Apex Overdrive — TODO

## Playable core
- [x] Original low-poly open-wheel car appears in third-person view and drives with responsive throttle, brake, steering, drift, and boost on keyboard, gamepad, and touch.
- [x] Three distinct lap-based tracks are selectable: Harbor Sprint, Canyon Run, and Vault Ring.
- [x] Every track includes ramps that launch the car when crossed above the intended speed; landings reward a short boost.
- [x] Vault Ring includes a dedicated sustained wall-ride section with banked car orientation, camera roll, and readable signage.
- [x] Start/finish line, countdown, lap crossings, live race timer, lap timer, restart, pause, results, and personal bests work.
- [x] Track surfaces, guardrails, curbs, grandstands, environmental scenery, and minimap are readable at racing speed.

## Presentation and flow
- [x] Boot screen is Apex Overdrive-specific with real progress, readable status, and retry on failure.
- [x] Title, track select, HUD, settings, leaderboard, and results screens are polished, keyboard/gamepad/touch navigable, and use the approved low-poly sun-bleached motorsport direction.
- [x] The generated hero car is integrated with correct scale, orientation, shadows, wheel animation, and a usable procedural fallback.
- [x] Generated SFX cover every game cue and one seamless original BGM loop plays through the existing audio mixer.
- [x] Game-specific favicon and OG cover exist under `assets/`; `game-sharing.json` describes the actual game.

## Online and delivery
- [x] Guest leaderboard runtime is installed, configured with immutable per-track boards, migrated additively, and mounted through hybrid `/api/*` routes.
- [x] A ranked race obtains a run ticket at start and submits the completed result once; failures remain visible without interrupting local play.
- [x] Build, typecheck, unit tests, and adapted smoke test pass.
- [x] Assets are registered/synced, sharing prepared, and the intended source, backend, migrations, and configuration are checkpointed.


## Verification

- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes: 14 tests across race rules, saves, track geometry, ramps, wall ride, and barrier contact.
- [x] `pnpm build` passes with sharing metadata, registered storage paths, and a game-specific favicon/OG cover.
- [x] `pnpm smoke` passes: hero car, three circuit selections, real throttle movement, pause/settings, results, and portrait mobile HUD.
- [x] Desktop and mobile visual review completed with no horizontal overflow or HUD collisions.
- [x] Guest leaderboard migration applied and `/api/leaderboards/v1/boards/harbor-race-v1` responds successfully through the development proxy.
