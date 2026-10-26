# Funscientia — Kingdoms of Discovery

**A story-driven web game where pupils explore the human body as a magical kingdom, and learn digestion by doing it:
chewing, cutting molecules with enzyme "scissors", and sending nutrients into the villi.**

Made for Algerian middle-school Natural Sciences (4AM, ages 13–15), in **English and Arabic**. Built by the
Funscientia team for the **Thirduni** team project (Cohort 1, 2026).

**▶ Play: https://ninjatradercodes.github.io/Funscientia/** (phone, tablet or computer; best in landscape)

| For the jury | |
|---|---|
| Jump to any part of the game | **https://ninjatradercodes.github.io/Funscientia/?review** (a "Jump to" menu; the ☰ tab on the left brings it back) |
| Start at a chapter with a code | On the start page: **Continue with my code**, then one of these (you get your own new code, the jury code never changes) |

| Starting point | Code |
|---|---|
| Chapter 1 – the Mouth mission | `257F-T76R` |
| Chapter 2 – down the Esophagus | `7368-PVHZ` |
| Chapter 2 – the Stomach mission | `HBFK-XQC2` |
| Chapter 3 – the road to the Small Intestine | `Y779-VJJH` |
| Chapter 3 – the Small Intestine mission | `WMDZ-HHJU` |
| Chapter 3 – the Kingdom Memory Challenge | `RHPV-A2ZJ` |

## What it is

Digestion is usually taught with a diagram and a list of enzyme names, which pupils memorise and forget. In
Funscientia they *are* the digestive system's helpers: every enzyme is a tool they use, every rule (bile before
lipase, pepsin only on proteins, fibre is never absorbed) is something they discover by trying.

Each part follows the same learning loop: **predict → try → explain**. A Guardian asks a question before a mission;
the mission lets the pupil test it; the Guardian then explains what happened, starting from the pupil's own answer.
Wrong moves teach instead of punishing.

**The journey (the Kingdom of Digestion):**

1. **The Road to the Mouth Gate**: the trio (Walid, Nesma and their fennec) meet the Tooth Guardian.
2. **The Mouth mission**: chew with the teeth, mix with the tongue, moisten with saliva, then cut starch with
   salivary amylase into maltose.
3. **Down the Esophagus**: peristalsis waves and mucus; the Stomach Guardian's question about pepsin.
4. **The Stomach mission**: churn, keep the acid right, cut proteins with pepsin into polypeptides, release chyme.
5. **The Road to the Small Intestine**: a road through the villi to the Helpers' Junction (bile and pancreatic ducts),
   where the Small Intestine Guardian asks which helper acts first on fats.
6. **The Small Intestine mission**: take helpers from three openings (bile, the pancreas, the intestine wall) to finish
   fats, proteins and sugars, then absorb the nutrients into the blood or the lymph.
7. **The Kingdom Memory Challenge**: two memory boards (molecules; helpers and their names) and three questions.
8. **The finale**: a certificate with the pupil's name, stars and discoveries, to download or print.

Along the way the pupil collects **discovery notes** in Nesma's **Discovery Book** (📖 under the profile badge),
which also shows the **Journey**: what is done, each mission's best stars, and the kingdoms still to come. Progress is
saved on the device and online with a **save code** (no accounts, no email), so a pupil can continue on another device.

## Run it locally

Requirements: **Node.js 20+** (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, to test on a phone)
```

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run ink        # recompile the dialogues (content/dialogue/*.ink) after editing them
npm run deploy     # build and publish to GitHub Pages (gh-pages branch)
```

No configuration is needed: the online saves use the team's Supabase project through its **publishable** key
(`src/config.ts`), which is public by design. If the saves are unreachable, the game still plays and saves on the device.

Controls: tap or click the ground, or use the arrow keys / WASD; in the missions, tap, click or swipe. **Esc** or **P**
pauses (the pause card shows the round's instructions again, and the music / sound / reduce-motion settings).

## Who built which part

| Member | Role | Built |
|---|---|---|
| **Dounia** | Project lead, science teacher, game design | The vision and story, the characters and the world (the Douniaverse), the science content and its accuracy, the designs of every mission and of the memory cards, and the review of each part in class terms |
| **Hicham** | Game development | The whole game: engine, world and characters, the three missions and the Memory Challenge, the Discovery Book, English/Arabic, the art and animation pipeline that turns Dounia's designs into game assets, the integration of the online saves, testing and hosting |
| **Djihane** | Backend development | The online saves on Supabase (PostgreSQL): the table, the three API functions (create, save, load by code), row-level security and grants, the 14-check test page (`backend/`) |

Art: original characters and world by Dounia. Game-ready sprites, backgrounds, layers and walk cycles are produced
from her designs with AI tools (ChatGPT image generation via the Codex CLI, Wan 2.2 video for the walks) and the local
pipeline in `tools/pipeline/`.

## How it is built

| Area | Choice | Why |
|---|---|---|
| Game engine | [Phaser 4](https://phaser.io) (WebGL, Canvas fallback) | Mature 2D engine: scenes, sprites, tweens, input, cameras |
| Language / build | TypeScript (strict) + [Vite](https://vite.dev) | Fast dev server, static output that runs on any web host |
| Dialogue | [ink](https://github.com/inkle/ink) via `inkjs` | Writers edit plain-text scripts in English and Arabic without touching code |
| Level layout | [Tiled](https://www.mapeditor.org) map files (`.tmj`) | Walkable areas, stars (hotspots), Guardians and spawn points are drawn visually |
| Interface | HTML/CSS over the canvas | Sharp text, accessibility, right-to-left Arabic |
| Saves | `localStorage` + [Supabase](https://supabase.com) (code-based online saves) | No accounts: a short code continues the game anywhere |
| Hosting | GitHub Pages (static site) | Free, fast, nothing to run |
| Asset pipeline | Python + OpenCV/Pillow, rembg, Real-ESRGAN, LaMa, Depth Anything | Turns AI-generated art and video into game-ready sprites and parallax layers |

```
src/
  main.ts                start page, intro, save codes, the review menu (?review), the Discovery Book button
  scenes/                Overlook, World (every road), Mouth, Stomach, SmallIntestine (IntestineScene.ts),
                         Revision (the Memory Challenge and the finale), Chapter (title cards)
  world/                 characters with real walk cycles, the trio's formation, walkable areas, stars, peristalsis
  ui/                    dialogue box, mission HUDs, Discovery Book, certificate, save-code panel, review menu
  state/                 GameState (progress), OnlineSave (Supabase), discoveries (the book's pages), Settings
  i18n/                  English and Arabic phrasebooks
content/
  dialogue/*.ink         every conversation (English; Arabic in dialogue/ar/)
  maps/*.tmj             the roads, drawn in Tiled
  prompts/               the prompts used to generate art
backend/                 Djihane's Supabase SQL, test page and evidence
tools/                   dialogue compiler, map builder, asset pipeline (tools/pipeline/), deploy
public/assets/           game-ready assets, served as they are
```

High-resolution art masters (`art/`), AI models and heavy tools (`.tools/`) and source videos (`docs/videos/`) stay
out of the repository: they are large and regenerable. The repository has everything needed to **run and change the
game**.

## Security and data

- **No secrets are committed.** The only key in the code is Supabase's publishable key, meant for browsers. The
  database allows nothing but the three save functions (row-level security on, direct table access revoked); see
  `backend/README.md`.
- A save holds only what the game needs: the chosen avatar, an optional first name, the language, discoveries,
  predictions and progress. No email, no account, no location.
- Automated tests of the game intercept every save request, so test runs never write to the team's database.

## What next

- **The next kingdoms** (already announced in the game as *coming soon*): Breathing, the Body's Defenders
  (immunity) and the Nerves, built on the same engine and the same predict → try → explain loop.
- **A teacher view**: a class code that groups pupils' saves, so a teacher sees the class's progress and which
  predictions changed after each mission.
- **Offline play** for classrooms with weak internet (an installable web app).
- **French**, the third language of Algerian schools (the dialogue system already supports more languages).

## Credits

Sound: the background birds and waterfall are "Birds and Waterfall" by rmultimediaeu on
[Pixabay](https://pixabay.com/) (Pixabay Content License), cleaned of its low thumps by
`tools/pipeline/make_ambience.py`. Footsteps, chimes and tones are synthesised in code; the intro's soundtrack and the
kids' "wow" come from the intro clips.
