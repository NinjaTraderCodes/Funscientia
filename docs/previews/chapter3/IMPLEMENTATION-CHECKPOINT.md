# Chapter 3 local review checkpoint

Resumed after the user's pause. Updated 2026-10-25. All work remains local and uncommitted; nothing was pushed or deployed.

## Implemented

- Two walkable Tiled roads, trio dialogue, bile prediction, chapter artwork, and handoff from Stomach.
- A Phaser SmallIntestine scene with moving molecules, glowing cut sites, tap/swipe scissors, separating fragments, and products drifting out of the chamber.
- Bile spray from the green opening, pancreatic enzymes from the second opening, and intestinal tools from the wall. The supply openings pulse in response to tool selection and use.
- Three originals per pathway: bile then lipase; protein 4-to-2-to-1; maltose to glucose; remaining starch to maltose then glucose. Every descendant must finish. A soft timer never skips incomplete molecules.
- Existing MiniGameHud timer, score, mission banners, pause/results, and kid/fox reactions; existing DialogueBox/Ink conversations in both languages.
- Moving water, minerals, vitamin groups and cellulose, followed by a short absorption explanation.
- Two six-pair memory boards, three classification questions, ending and replay. Shared HUD/reactions remain consistent with the earlier games.
- Backward-compatible checkpoints between lessons and quiz boards. Completed legacy Stomach saves can reach the new chapter without replaying Stomach.
- Phone layout keeps both supply openings visible and reserves space for longer quiz explanations.
- Mouth regression exposed duplicate Phaser keyboard events during pause. Added the same event guard already present in Stomach, plus removal of the pause overlay on keyboard resume.

## Validation

- Production build/typecheck passed.
- All bilingual Ink stories compile; English/Arabic structures match.
- Chapter 3 desktop English and Arabic touch-phone playthroughs passed: both roads, prediction, moving targets, all digestion pathways, pause and keyboard resume, language switching, refresh checkpoints, memory boards, classification, ending, replay and legacy saves.
- Pure digestion checks passed: prerequisites, three originals, complete descendants, conserved product counts and no duplicate rewards.
- Existing Mouth and Stomach desktop/phone regressions passed.
- Natural first-road traversal passed without speed overrides (48 seconds including dialogue).
- Automated save RPCs are intercepted; no tests write to the team's database.

Full Chapter 3 screenshots: `C:/Users/TheShadow/AppData/Local/Temp/funscientia-chapter3-2iPepF/`.
Local logs and extra review captures: `.tools/work/` (gitignored).

## Local review

Dev server: http://127.0.0.1:5178/

- Road: `?preview=intestine-road`
- Digestion: `?preview=intestine`
- Memory/quiz: `?preview=revision`

Preview links preserve checkpoints by default. Explicit `&replay=1` restarts that mission/quiz, using the same replay behavior as the ending buttons. These preview routes are development-only.

Select a helper, then tap a moving molecule or tap/swipe its glowing bond. Keys 1/2 select tools; Space acts on an eligible target; P/Escape pauses/resumes.

Run `npm.cmd run dev -- --host 127.0.0.1 --port 5178` if the server needs restarting. Validation commands are `npm.cmd run build`, `npm.cmd run ink`, `npm.cmd run test:chapter3 -- http://127.0.0.1:5178/ --quick`, `npm.cmd run test:mouth -- http://127.0.0.1:5178/ --quick`, and `npm.cmd run test:stomach -- http://127.0.0.1:5178/ --quick --small`.

Art masters stay in gitignored `art/chapter3`; packaged exports are in `public/assets`. Generation prompts are in `content/prompts/chapter3/assets.json` and `docs/previews/chapter3/prompts.json`. Packaging uses `.tools/venv/Scripts/python.exe tools/pipeline/pack_chapter3.py`.

User workflow: local review first, then separate authorization for commit, push and deploy.
