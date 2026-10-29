# Country Conquest Simulator

A self-playing web app that renders a world-conquest simulation as vertical video
(1080x1920) for YouTube Shorts, Instagram Reels and TikTok. Each episode is
rendered to MP4 frame by frame (`npm run render`); the browser version is for
previewing and development.

## Concept
- World map; every country is filled with its own flag.
- Each battle: draw a random attacker (equal odds), then a random defender from
  the attacker's neighbors.
- The two fight with a swappable battle module. The winner absorbs the loser's
  territory, which is repainted with the winner's flag.
- An episode = N battles (default 3), then a summary card:
  countries remaining, most battles won, most land controlled (% of world area),
  "to be continued".

## Hard requirements
- Fixed 1080x1920 canvas, scaled to fit the window; looks identical every run.
- Auto-plays from intro to summary with zero clicks (a Start key/button only).
- Deterministic: all randomness comes from one seeded RNG. Same seed + same saved
  state = identical episode, so any episode can be re-recorded.
- Persistent world: after each episode, export the world state (owner of every
  country, wins, history) as JSON; the next episode loads it.
- Battle log: export a JSON/text log of every battle (used to write voiceover scripts).

## Architecture
- Vite + TypeScript, no backend.
- Map: `world-atlas` TopoJSON (Natural Earth based), 50m resolution so small
  countries exist; render with `d3-geo`.
- Neighbors: `topojson-client` `neighbors()`. Countries with no land neighbor
  (islands) get links to their nearest countries by distance.
- Flags: `flag-icons` (MIT) SVGs, mapped by ISO code, used as fill patterns.
- `src/engine/` world state, RNG, episode loop, save/load
- `src/battles/` one file per battle module, sharing one interface:
  `run(attacker, defender, rng, ui) => Promise<winner>`
  First module: rock-paper-scissors (first to 3 wins). Later: dice, coin flip,
  wheel, stat cards, penalties.
- `src/ui/` map view, camera zoom to the battle region, duel panel, HUD, cards
- `src/config.ts` episode length, battles per episode, speed, seed, theme,
  battle module, optional "hero country" (always the attacker)
- `scripts/render.mjs` MP4 renderer: builds the app, runs it in headless Chrome
  (installed Chrome via `playwright-core`) on the virtual clock, pipes frames
  to ffmpeg, then writes logs and the next save into the project.

## Rendering
- All timing goes through `src/ui/clock.ts` (`wait`, `tween`, `duration`).
  Never use `setTimeout`, `requestAnimationFrame`, `performance.now()` or
  `animation.finished` for anything visible: in render mode (`?render`) only
  the clock moves time. `element.animate()` is fine (the clock steers it).
- Visual-only randomness (e.g. the draw spin) uses its own seeded RNG stream,
  never the episode RNG, so visuals can change without changing outcomes.
- `npm run render` plays the next episode from `public/saves/latest.json` and
  writes `renders/epNNN.mp4` (git-ignored), `logs/log-epNNN.{json,txt}`,
  `public/saves/world-after-epNNN.json` and the new `latest.json`.
  Flags: `--fresh`, `--seconds N` (partial, saves nothing), `--dry`, `--seed N`.
- Determinism check: render the same input twice and compare
  `renders/*.frames.txt` (one SHA-256 per frame); they must be identical.

## Style
- Original branding (not a copy of any existing channel): own name, palette,
  fonts, layout. Theme values live in one theme file.
- Large, readable text for phones; key info must read with sound off.

## Accuracy
- One consistent border source (world-atlas / Natural Earth). Never hand-edit borders.
- Verify flag-to-country mapping with a test that lists every country + flag code.

## Git
- Remote: https://github.com/SamirTrabelsii/conquest-sim (branch `main`).
- After rendering an episode, commit its saves (`public/saves/`) and logs
  (`logs/`) together with the code, so the episode can be re-rendered exactly
  later. MP4s stay out of git.

## Working rules
- Plan first, then build in small steps; run the dev server and check the
  result after each step.
- Keep everything configurable; no magic numbers in components.
