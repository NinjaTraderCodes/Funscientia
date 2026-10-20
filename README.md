# Funscientia — Kingdoms of Discovery

A story-driven science adventure for children (8–12) set in the *Douniaverse*. Players explore the human body as a
magical kingdom, solve hands-on challenges and learn science through play. Built for the **Thirduni** team project
(Cohort 1, 2026).

**▶ Play the latest version: https://ninjatradercodes.github.io/Funscientia/** (best in landscape; phone, tablet or PC)

> **Status: early prototype.** Playable today: intro video → overlook → choose a hero → the Road to the Mouth Gate
> (dialogue, a discovery, a prediction question). The first mini-game (the Mouth) is next.

## Play it locally

Requirements: **Node.js 20+** (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, to test on a phone)
```

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

```bash
npm run deploy     # build and publish to GitHub Pages (gh-pages branch)
npm run ink        # recompile content/dialogue/*.ink after editing dialogue
npm run demo       # record a gameplay video (needs `npm run build && npm run preview -- --port 4173`)
```

Controls: tap/click the ground or use the arrow keys / WASD. **G** toggles debug overlays (walkable area, hotspots).

## Tech stack

| Area | Choice | Why |
|---|---|---|
| Game engine | [Phaser 4](https://phaser.io) (WebGL, Canvas fallback) | Mature 2D engine: scenes, sprites, tweens, input, cameras |
| Language / build | TypeScript (strict) + [Vite](https://vite.dev) | Fast dev server, static output that runs on any web host |
| Dialogue | [ink](https://github.com/inkle/ink) via `inkjs` | Writers edit plain-text scripts (EN / AR / FR) without touching code |
| Level layout | [Tiled](https://www.mapeditor.org) map files (`.tmj`) | Walkable areas, hotspots and spawn points are drawn visually |
| UI overlays | Plain HTML/CSS on top of the canvas | Sharp text, accessibility, right-to-left Arabic for free |
| Save data | `localStorage` (no backend yet) | Chosen hero, discoveries, predictions |
| Asset pipeline | Python 3.13 + OpenCV/Pillow, rembg, Real-ESRGAN, LaMa, Depth Anything | Turns AI-generated art and video into game-ready sprites |
| AI art | ChatGPT images (via Codex CLI) for stills; Wan 2.2 (Hugging Face) for walk animations | See *Asset pipeline* |

There is **no server**: the game is a static site (HTML + JS + images). A backend becomes useful later for
teacher dashboards, class progress or accounts — see *Ideas for a backend*.

## Hosting

The game is a static site hosted free on **GitHub Pages** from the `gh-pages` branch. `npm run deploy` builds and
publishes it. A GitHub Actions workflow (`.github/workflows/deploy.yml`) does the same automatically on every push
to `main` once Actions is enabled for the account.

## Project structure

```
src/                     game code (TypeScript)
  main.ts                entry: Phaser config, HUD hints, scene list
  intro/IntroPlayer.ts   intro video, skip, hand-over to the game at the video's last frame
  scenes/
    BootScene.ts         loads manifests + textures
    OverlookScene.ts     first place: matches the video's last frame, camera pull-back, hero choice
    WorldScene.ts        generic walkable place driven by a Tiled map + an ink dialogue
    ChapterScene.ts      storybook title cards between places
  world/
    Character.ts         a character on the ground plane: perspective scaling, 8 directions, walk cycles
                         locked to ground speed (no foot sliding)
    Party.ts             leader + followers formation
    Walkable.ts          walkable polygon, clamping
    Waypoint.ts          glowing markers/hotspots (pre-baked textures for phone performance)
  dialogue/DialogueRunner.ts   plays ink knots, collects #speaker/#mood/#action/#discovery tags
  ui/                    DialogueBox, HeroSelect, Toast (HTML overlays)
  state/GameState.ts     persistent progress (localStorage)
  data/types.ts          shapes of the JSON manifests

content/                 things designers/teachers edit
  dialogue/*.ink         conversations (compiled to public/assets/dialogue/*.json)
  maps/*.tmj             Tiled maps (built to public/assets/world/*.place.json)
  prompts/*.txt          prompts used to generate walk-animation clips

public/assets/           game-ready assets, served as-is
  characters/            sprite atlases (webp + json) + characters.json animation manifest
  world/                 place backgrounds and layouts
  dialogue/ portraits/ intro/

tools/
  build_ink.mjs          compile .ink → .json
  pipeline/              Python asset pipeline (see below)

docs/                    project brief, Dounia's character art, mini-game prototype, roadmap
```

## Asset pipeline (how art gets into the game)

The game never loads raw art. Scripts in `tools/pipeline/` turn source art into `public/assets/`:

| Script | Does |
|---|---|
| `make_clip.py` | Generates a short walking clip (Wan 2.2 on Hugging Face) from a start image + prompt |
| `extract_walk.py` | Cuts characters out of a clip, splits the trio, finds a seamless walk loop |
| `make_plate.py`, `split_layers.py` | Clean background plate from the intro's last frame (inpainting), near/far depth layers |
| `pack_assets.py` | Upscales, colour-matches and packs sprite atlases + the animation manifest |
| `build_maps.py` | Tiled map → shipped background + place JSON |

Heavy tools (AI models, Blender, upscaler) live in a local, git-ignored `.tools/` folder, and the high-resolution
masters in `art/` are also kept out of git (they are large and regenerable). The repo contains everything needed
to **run and modify the game**; regenerating art requires the local toolchain.

## How a place is built (example: the Road)

1. Background image → `art/world/road/road_master.png`
2. In Tiled, draw the walkable polygon, spawn point and hotspots → `content/maps/road.tmj`
3. Write the conversations → `content/dialogue/road.ink` (hotspots name the ink knot they trigger)
4. `python tools/pipeline/build_maps.py` and `node tools/build_ink.mjs`
5. `WorldScene` plays it; no new code needed per place.

## Ideas for a backend (later)

- Teacher dashboard: class codes, which discoveries each student unlocked, prediction answers before/after
- Accounts / cloud saves across devices
- Content service for dialogues and mini-game data in several languages
- Analytics for the classroom playtests

## Roadmap

- [World improvements backlog](docs/ROADMAP-world.md)
- Next: finish all walk animations (side walks; the fox's natural trot), then the **Mouth** mini-game
  (based on Dounia's prototype in `docs/games-codes/`)

## Team

- **Ben** — game development
- **Dounia** — project lead, vision, story and characters, science content
- **Djihane** — backend development
- *(4th member)*

Art: original characters and world by Dounia; game sprites are produced from her designs with AI tools.
