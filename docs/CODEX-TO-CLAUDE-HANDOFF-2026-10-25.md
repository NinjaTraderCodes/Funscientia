# Funscientia: complete Codex-to-Claude Code handoff

**Prepared:** 25 October 2026, using the user's Africa/Lagos calendar date.  
**Workspace:** `C:\Users\TheShadow\Funscientia`  
**For:** Claude Code, taking development back over from Codex.  
**Scope:** Everything undertaken during the Codex takeover: project familiarization, illustrated chapter transitions, Mouth amylase addition and correction, Stomach pepsin update, Chapter 3 planning, artwork, implementation, the user's rejection of the first digestion interface, the interactive rebuild, validation, and current repository state.

This is a development and product handoff, not authorization to publish the current work. The user's agreed workflow is **implement locally → Hicham verifies locally → obtain authorization for commit, push, and live deployment**. Previous publishing approvals covered the earlier Mouth/Stomach releases. **The current Chapter 3 work has not been committed, pushed, deployed, or explicitly accepted after its latest rebuild.** The user's newest instruction was to prepare this detailed document because Claude Code will handle development from here.

## Contents

1. [Immediate state and critical instructions](#1-immediate-state-and-critical-instructions)
2. [What Claude had already built](#2-what-claude-had-already-built)
3. [Chronological record of the takeover](#3-chronological-record-of-the-takeover)
4. [Illustrated chapter transitions](#4-illustrated-chapter-transitions)
5. [Mouth addition: original implementation and required correction](#5-mouth-addition-original-implementation-and-required-correction)
6. [Stomach addition: repeated proteins and four-unit products](#6-stomach-addition-repeated-proteins-and-four-unit-products)
7. [Dounia's Chapter 3 requirements and agreed interpretation](#7-dounias-chapter-3-requirements-and-agreed-interpretation)
8. [Chapter 3 road and story integration](#8-chapter-3-road-and-story-integration)
9. [Current interactive Small Intestine implementation](#9-current-interactive-small-intestine-implementation)
10. [Memory, classification quiz, and ending](#10-memory-classification-quiz-and-ending)
11. [Artwork, generated assets, and packaging](#11-artwork-generated-assets-and-packaging)
12. [Localization, UI consistency, and input](#12-localization-ui-consistency-and-input)
13. [Save/resume changes and compatibility](#13-saveresume-changes-and-compatibility)
14. [Current file inventory](#14-current-file-inventory)
15. [Validation performed and its limits](#15-validation-performed-and-its-limits)
16. [How to run and inspect the local work](#16-how-to-run-and-inspect-the-local-work)
17. [Known limitations and next review priorities](#17-known-limitations-and-next-review-priorities)
18. [Publishing history, tools, and operational notes](#18-publishing-history-tools-and-operational-notes)
19. [Suggested first actions for Claude](#19-suggested-first-actions-for-claude)

## 1. Immediate state and critical instructions

### 1.1 Repository and deployment snapshot

These remote branch hashes were read directly with `git ls-remote` while preparing this handoff:

| Item | State on 25 October 2026 |
| --- | --- |
| Local branch | `main` |
| Local source HEAD / remote `main` | `6e9f50808dd347163c08ed44caf2b7de6e0cba62` |
| Last committed source change | `Make pepsin split five proteins into four-unit pieces` |
| Remote `gh-pages` | `1043a1d6ddee956a672368e9fa23bfb230e86ab6` |
| Source repository | <https://github.com/NinjaTraderCodes/Funscientia> |
| Live game | <https://ninjatradercodes.github.io/Funscientia/> |
| Current Chapter 3 work | Modified tracked files plus many untracked source/art/export files in this workspace |
| Current Chapter 3 publication | Local only |

The earlier three Codex releases were committed, pushed and deployed following the user's instructions. The remote source HEAD still corresponds to the third of those releases. Reading the branch hashes for this document did not push, fetch, change branches, or deploy anything. The live site's asset contents were not re-audited during this documentation-only turn.

### 1.2 The user's most important recent correction

After seeing the first Small Intestine implementation, the user rejected its direction. Their instruction included:

> It should not be as simple as making those boxes! It should be very interactive similar to the Mouth and the Stomach games! So, those items should be moving around, and those upper holes should do something reacting to the player playing.
>
> YOU MUST KEEP THE SAME THEME OF THE INFO BOXES AND Dialogs (Kids or fox reacting to what is happening) like it is in the Mouth and the stomach games.

Treat this as a continuing product requirement. The first card-like digestion interface was a mistake. It was replaced with a moving Phaser playfield, the actual shared mini-game HUD, and the existing dialogue system. Cards remain appropriate for the **separate final memory quiz**. Do not restore the original boxed digestion layout.

The revised implementation passed automated checks, but that does **not** mean Hicham or Dounia has approved its feel, visual quality, pacing or scientific presentation. The last Codex response invited local review; the next user request was this handoff document.

### 1.3 Audience, ownership and scope

- The user is **Hicham**, handling game development. Dounia supplies the educational direction, characters, artwork and feedback. Djihane's backend work predates the current Chapter 3 changes.
- The user explicitly clarified the educational target: **Algerian 4th Year Middle School / 4AM Natural Sciences, approximately ages 13–15**. The README's older ages 8–12 description is stale.
- Preserve Dounia's visual identity: navy, gold and cream interface art, the existing kids and fennec fox, and the established 3D storybook appearance.
- Preserve real character walk cycles and the established party behavior. Codex did not replace the movement system or create new character gaits for Chapter 3.
- Keep live EN/AR text separate from painted background lettering.
- Keep original supplied artwork. Generated derivatives and packaged exports are separate files.
- Automated game tests must intercept online save requests rather than write test progress to the team's actual database.
- This handoff adds documentation only. No further gameplay implementation or publication was requested in this turn.

## 2. What Claude had already built

The takeover began after a substantial game already existed. Codex extended that game; it did not originate the following systems:

- Phaser/TypeScript/Vite application and static GitHub Pages hosting.
- Hero page, intro video, transition into the overlook, hero/avatar selection, custom player names and profile editing.
- Walid, Nesma and fox sprites, directional walk cycles, perspective scaling, party formation, camera behavior and idle animations.
- Generic Tiled-driven `WorldScene`, walkable polygons, glowing waypoints, hotspot conversations and scene transitions.
- The first two-view road to the Mouth Gate.
- The original Mouth game: chewing, mixing, moistening/saliva, tongue interaction, swallowing, score and results.
- The esophagus / road to the Stomach Gate, peristalsis and the Stomach Guardian.
- The original Stomach game: churning, acidity, pepsin interaction and chyme/pylorus release.
- Shared `MiniGameHud`, `DialogueBox`, `DialogueRunner`, bilingual Ink stories, EN/AR phrasebooks and language switching.
- Local saves plus the save-code/Supabase integration and existing backend.
- The Python art pipeline, video-derived character assets, audio and the existing development/test utilities.

The source baseline immediately before the Codex release commits was `0f00b37` (`Online saves: a save code, and "Continue with my code"`, 23 October 2026). Earlier important Claude milestones include `5918f30` for Mouth, `26205d1` for the esophagus/full EN/AR work and `d0e633e` for Stomach. These are context, not claims of Codex authorship.

### 2.1 Claude's local memory and chat files

The user initially asked Codex to inspect the repository and, if accessible, Claude's memory/chat to understand the latest pending requests. Relevant local records are accessible at:

```text
C:\Users\TheShadow\.claude\projects\c--Users-TheShadow-Funscientia\memory\MEMORY.md
C:\Users\TheShadow\.claude\projects\c--Users-TheShadow-Funscientia\memory\funscientia-progress.md
C:\Users\TheShadow\.claude\projects\c--Users-TheShadow-Funscientia\memory\funscientia-project.md
C:\Users\TheShadow\.claude\projects\c--Users-TheShadow-Funscientia\memory\funscientia-gameplay.md
C:\Users\TheShadow\.claude\projects\c--Users-TheShadow-Funscientia\memory\feedback-real-motion.md
C:\Users\TheShadow\.claude\projects\c--Users-TheShadow-Funscientia\memory\feedback-group-walking.md
C:\Users\TheShadow\.claude\projects\c--Users-TheShadow-Funscientia\36fa0400-1c4d-491d-8b98-41fac8a00d20.jsonl
```

These are filesystem records, not access to a live Claude process or its internal context. They were not edited or synchronized by this handoff. Some headings, summaries and older entries are stale; reconcile them with Git, the current files and the user's newer instructions. In particular, old notes saying the Mouth/Stomach is still pending, describing the old peptide behavior, or limiting the MVP to the first organ do not describe the current project.

Existing memory principles still relevant here:

- Hybrid structure: the trio walks and talks in world scenes; the player performs direct actions in mini-games while companions react.
- Learning loop: predict → try → explain; wrong choices should teach.
- Character gait must come from the real/generated walk assets, not replacement procedural hops or sways.
- The trio walks level and stays close without reversing against the leader, overlapping, or herding in front of them.

The initial user instruction was **read and verify only**. Editing began only after the user requested the first chapter-image proof and later explicitly approved implementation steps.

## 3. Chronological record of the takeover

| Stage | User request / feedback | Codex action | Final status |
| --- | --- | --- | --- |
| Repository familiarization | Read project and Claude context, verify game/tools, initially do not edit | Inspected project structure, existing systems, art/toolchain and local running/testing workflow | Context gathering; original architecture retained |
| First small proof | Start with `Chapter1_Road_To_Mouth.jpg`; remove baked English so EN/AR can be drawn in the game | Created a text-free derivative, preserving the supplied scene | Included in the first release |
| Chapter/Mouth planning | Understand the requested starch/scissors addition before continuing | Planned the mission using the supplied `MouthGame_AddedStep_*` references | User approved proceeding |
| First implementation | Replace Chapter 1/2 transitions and implement Mouth addition | Added four illustrated transition plates, bilingual text overlays, amylase cutting task, art and browser test | Committed/pushed/deployed as `aff671a` |
| Mouth correction | A single moist bread hit was entering cutting too early; finish moistening, then hit 4–5 breads, then cut 4–5 chains | Changed to a complete timed moistening round followed by five persistent bread reveals and five chains | Committed/pushed/deployed as `b4311e3` |
| Stomach planning | Dounia: more repeated proteins, blue pepsin scissors, four-unit polypeptides | Reviewed `StomachGame_Edit.jpg` and designed five required proteins, each becoming two groups of four | User approved proceeding |
| Stomach implementation | Implement, then publish after local review | Added required repeated proteins, correct four-unit fragments, tool selection, overtime and regression test | Committed/pushed/deployed as `6e9f508` |
| Chapter 3 analysis | Plan third road and Small Intestine from Dounia's detailed messages and `SI_3rdGame_*` art | Analyzed fats, protein, maltose, remaining starch, already-simple nutrients and cellulose; asked audience/absorption questions | Audience clarified as 4AM, ages 13–15 |
| Ending scope clarification | Dounia proposed memory/choose-correctly after Small Intestine and stopping the organ journey there | Integrated memory and classification as a final revision game; kept absorption explanatory | User liked the plan and requested visual proposals |
| Chapter 3 visual planning | Show proposed road and game backgrounds, generate as needed | Generated two road concepts, digestion chamber and memory hall, with references/prompts saved | User approved implementation |
| First Chapter 3 implementation | Build locally for Hicham to verify before publishing | Added roads, stories, digestion model, initial DOM/card-style digestion UI, revision, assets and checkpoints | Local; first digestion UI was subsequently rejected |
| Safe pause | Work was taking longer than expected; user asked to pause | Saved `IMPLEMENTATION-CHECKPOINT.md` and stopped | Pause was later explicitly revoked by “You can continue now” |
| Resume and product correction | User insisted on moving molecules, reactive openings and the exact established HUD/dialogue theme | Rebuilt digestion as a Phaser action scene, reused shared HUD/dialogues, revised quiz chrome and phone layout | Local; see current implementation below |
| Final validation | Verify the interactive rebuild and avoid regressions | Passed Chapter 3 EN/AR browser checks, legacy-save tests, Mouth/Stomach regressions, build/Ink checks and focused phone review | Tested, awaiting user acceptance; unpublished |
| Handoff | User said Claude Code will handle work and requested a very detailed Markdown record | Created this document from conversation, Git, current source, memory references and test evidence | Documentation only |

### 3.1 Exact Codex source release commits

All three have commit dates of 24 October 2026 at UTC+01:00:

| Commit | Time | Subject |
| --- | --- | --- |
| `aff671aa2a99ac5ef449945b13385d8670dd7905` | 00:40:16 | Add illustrated chapters and playable salivary amylase mission |
| `b4311e3f5fb96ce149a75704186574e78116d6f3` | 01:22:43 | Finish moistening before the five-bread amylase task |
| `6e9f50808dd347163c08ed44caf2b7de6e0cba62` | 15:26:03 | Make pepsin split five proteins into four-unit pieces |

Use `git show <commit>` for exact historical diffs. The first commit's Mouth behavior was superseded by the second commit. Do not treat both as independent current mission variants.

## 4. Illustrated chapter transitions

### 4.1 Requested behavior

Use Dounia's supplied chapter artwork instead of generic transition screens. Remove the painted English titles from the bitmap, retain the scene and decorations, and render translated chapter/title text at runtime.

The initial proof focused only on `Chapter1_Road_To_Mouth.jpg`. The same approach was then applied to all four Chapter 1/2 transition illustrations after approval.

### 4.2 Source-to-export mapping

| Original supplied art in `docs/images/` | Text-free derivative in the same directory | Runtime export in `public/assets/chapters/` |
| --- | --- | --- |
| `Chapter1_Road_To_Mouth.jpg` | `Chapter1_Road_To_Mouth_NoText.png` | `road-to-mouth.webp` |
| `Chapter1_Mouth_Mission.jpg` | `Chapter1_Mouth_Mission_NoText.png` | `mouth-mission.webp` |
| `Chapter2_Down_The_Esophagues.jpg` | `Chapter2_Down_The_Esophagues_NoText.png` | `esophagus.webp` |
| `Chapter2_Stomach_Mission.jpg` | `Chapter2_Stomach_Mission_NoText.png` | `stomach-mission.webp` |

The original filename spelling `Esophagues` is retained on disk. Runtime names use `esophagus`.

The image-edit prompts requested removal of lettering only, preserving composition, aspect ratio, lighting, architecture, ornaments and a quiet navy area for live text. Complete generation prompts are in:

```text
content/prompts/chapters/road-to-mouth-no-text.txt
content/prompts/chapters/mouth-mission-no-text.txt
content/prompts/chapters/esophagus-no-text.txt
content/prompts/chapters/stomach-mission-no-text.txt
```

### 4.3 Code integration

- Extended `src/scenes/ChapterScene.ts` with `ChapterArtwork`, artwork metadata, image preload and an illustrated rendering path.
- Preserved the generic title-card path for callers without artwork.
- Added image-specific vertical text positions rather than assuming the title belongs at the same point on every illustration.
- Added live EN/AR titles using `I18n`, Arabic RTL/font handling, English letter spacing and width fitting for long titles.
- Added resize handling and a second layout pass when fonts finish loading.
- Landscape fills the screen; portrait keeps the entire illustration visible.
- Retained the existing fade/title reveal/automatic onward transition structure.
- Wired illustrated cards into Overlook → Mouth road, World → Mouth/Stomach, Mouth → esophagus and online-save resume destinations in `src/main.ts`.

Chapter 3 later added `smallIntestineRoad`, `smallIntestineMission` and `revision` artwork keys locally. Those additions are separate from the already-deployed four Chapter 1/2 plates.

## 5. Mouth addition: original implementation and required correction

### 5.1 Educational request

The user referred back to their Claude prompt and Dounia's `MouthGame_AddedStep_*` drawings. Bread/starch needed to become an explicit mission: reveal a long purple starch molecule, choose salivary amylase scissors, and cut the chain into maltose pairs.

The artwork on disk is named `MouthGame_AddedStep_00.jpg` through `MouthGame_AddedStep_03.jpg`, despite variations such as `MouthGame_AddStep_*` in conversation.

### 5.2 First release and why it changed

`aff671a` added the scissors task and translated instructions/results, but the first implementation could transition into cutting after hitting one bread during moistening. The user explicitly corrected that behavior. The important lesson is that the chemical task must **follow** the completed moistening activity and must involve multiple bread targets.

`b4311e3` implemented the requested sequence. This is the current deployed Mouth mission structure:

1. Play the existing chewing and mixing rounds.
2. Play the **entire timed moistening round**. A valid moist bread hit contributes to normal play and does not interrupt the timer.
3. When moistening finishes, clear ordinary foods and the tongue from the separate task area and hide the saliva controls.
4. Present **five persistent breads**. Each is counted once and reveals one six-unit purple starch chain when hit.
5. Keep amylase scissors hidden until **all five** breads have been revealed.
6. Require explicit scissors selection.
7. Allow taps or swipes at the two valid inter-pair bonds on each six-unit chain. Do not cut the internal bond of a maltose pair into individual glucose in the mouth.
8. Produce three maltose pairs per chain: **five chains → fifteen pairs**. All five chains must finish before swallowing proceeds.
9. Retain swallowing, results, discoveries, explanation and onward travel to the esophagus.

The special reveal/cut sequence is untimed. It cannot be skipped by expiry of the old moistening timer. Repeatedly hitting an already-revealed bread or an already-completed cut does not award additional progress or points.

### 5.3 Main implementation files

| File | Responsibility |
| --- | --- |
| `src/scenes/MouthScene.ts` | Full-round handoff, `bread`/`starch` phases, input routing, cleanup, results and onward transition |
| `src/world/StarchTask.ts` | Five targets, bread reveal, six-unit chains, valid cut sites, pair products, scissors and completion |
| `src/ui/MouthHud.ts` | Untimed objective text, bread/pair counters, explicit scissors button, localized hints and maltose result line |
| `src/i18n/en.ts`, `src/i18n/ar.ts` | Mission instructions, tool names, progress, hints and results |
| `content/dialogue/mouth.ink`, `content/dialogue/ar/mouth.ink` | Updated bilingual educational dialogue |
| `src/styles.css` | Digestion task/scissors layout and small landscape adaptations |
| `tools/check_mouth.mjs` | Desktop English and Arabic phone regression |

### 5.4 Mouth art and controls

Introduced `MouthGame_Amylase_Scissors.png` and `MouthGame_Maltose.png` derivatives and these runtime textures:

```text
public/assets/mouth/amylase-scissors.webp
public/assets/mouth/maltose.webp
public/assets/mouth/starch_0.webp
public/assets/mouth/starch_1.webp
```

Prompts for the tool/product cutouts are in `content/prompts/mouth/amylase-scissors-cutout.txt` and `maltose-cutout.txt`. Existing Mouth background, hammer, tongue, food, sound and shared theme remain the basis of the scene.

Mouse/touch can reveal bread and tap/swipe cut sites. Keyboard input supports the corresponding reveal/cut actions; explicit amylase selection remains required. The regression script verifies touch, keyboard, pause, invalid intra-pair cuts, all fifteen pairs, rewards and the illustrated esophagus transition.

### 5.5 Additional local Mouth fix after the Chapter 3 rebuild

During the latest regression run, the Mouth test caught `bread hits wait while paused` failing. Phaser could deliver a queued native keyboard event more than once between frames, allowing a pause toggle to be processed again.

The **uncommitted** fix adds a `WeakSet<KeyboardEvent>` guard, resets it on scene creation and ignores repeated pause-key events. This follows the event guard already used by Stomach. Keyboard resume also calls the new shared HUD `dismissPause()` method so the overlay is removed. The existing Mouth regression subsequently passed in both contexts.

This small local fix is beyond deployed `6e9f508`; it must be included or consciously reviewed with the eventual Chapter 3 changes.

## 6. Stomach addition: repeated proteins and four-unit products

### 6.1 Dounia's requirement

Dounia requested several long protein chains arriving among maltose and fats. The player should select blue pepsin scissors and cut proteins into four-unit pieces named **متعدد البيبتيد**. The user summarized their earlier Claude request as showing protein more often and cutting it into groups of four.

Reference: `docs/images/StomachGame_Edit.jpg`.

### 6.2 Implemented behavior in `6e9f508`

- Set a required target of **five protein chains** in the pepsin round.
- Each incoming long protein contains **eight blue units**.
- Highlight the middle bond between units four and five.
- A successful cut produces **two intact groups of four**, labeled as four-unit polypeptides.
- Five correct proteins yield **ten four-unit polypeptides**, rather than arbitrary small fragments or single amino acids.
- Use two lanes and bounded active chains, with repeated arrivals, to make progress reliable without overcrowding the chamber.
- Require explicit pepsin selection; keep the blue tool distinct from acid addition.
- Retain the acidity prerequisite. Pepsin cannot successfully cut outside the established pepsin acidity zone.
- Maltose and fat float through as non-targets and are not digested by pepsin.
- Count proteins cut and polypeptides produced in HUD/results.
- If the timer expires before the five proteins are complete, continue in overtime. Do not silently finish with missing proteins.
- Let visible products finish their short display/exit period before the round completes.
- Retain churning, acid/germ behavior, chyme formation, pylorus timing and results.
- Support mouse taps, swipes, touch and keyboard equivalents; relabel four-unit products on language changes.

Relevant constants in `StomachScene.ts` are `PROTEIN_TARGET = 5`, `PROTEIN_UNITS = 8`, `PEPTIDE_UNITS = 4` and `PEPTIDE_SECONDS = 3.2`.

The exact 8 → 4 + 4 and later 4 → 2 → 1 sizes are a school-level visual model matching Dounia's instructions. They are not claims that all real protease products have those exact lengths.

### 6.3 Files and later Chapter 3 integration

The deployed update changed `StomachScene.ts`, `StomachHud.ts`, bilingual stomach Ink/compiled JSON, EN/AR phrasebooks, shared styles and package test scripts, added `StomachGame_Edit.jpg`, and added `tools/check_stomach.mjs`.

At the time of that release, the scene still ended on the existing Chapter 3 “to be continued” card. The **current local** change replaces that ending with the illustrated Chapter 3 road card and `World { place: 'intestine-road' }`. It sets `GameState.place` accordingly. This onward handoff is part of unpublished Chapter 3, not part of the live Stomach release.

## 7. Dounia's Chapter 3 requirements and agreed interpretation

### 7.1 Digestion pathways

The user supplied Dounia's detailed messages and artwork named `SI_3rdGame_01.jpg` through `SI_3rdGame_21.jpg`. Conversation referred to PNGs, but the provided files in this workspace are JPGs.

| Material arriving in Small Intestine | Dounia's requested helper/order | Educational outcome |
| --- | --- | --- |
| Fat: green body with three yellow tails | Bile first to prepare/emulsify; yellow lipase scissors second | Glycerol and fatty-acid products in the classroom diagram |
| Four-unit blue protein fragment from Stomach | Pancreatic Trypsin, then intestinal Peptidase | Four → two + two → individual amino acids |
| Purple maltose pair | Intestinal Maltase | Two → individual glucose units |
| Remaining long purple starch | Pancreatic Amylase, then intestinal Maltase | Starch → maltose pairs → glucose |
| Water, mineral salts and vitamins | No enzyme cutting | Already sufficiently simple; explain their onward absorption |
| Cellulose fibre | No human enzyme for this substrate | Remains undigested and helps move intestinal contents |

Bile is a preparatory secretion, **not an enzyme scissors step that breaks the molecule's bonds**. Blue tools are differentiated with ② / ③ labels/badges. Amylase remains purple; Maltase was made rose pink for distinction. There is one yellow lipase tool representing the school-level task rather than separate pancreatic and intestinal lipase sub-missions.

### 7.2 Age/curriculum clarification

Codex asked about school year because the old README said ages 8–12. Hicham answered **4AM Natural Sciences in Algeria, most likely ages 13–15**. This should guide terminology and pacing going forward.

Codex also asked how absorption should be introduced. Hicham asked for deeper interpretation of Dounia's messages and images rather than deciding without that context. The later memory-game message clarified the desired ending scope.

### 7.3 Dounia's memory-game message changed the ending plan

Dounia proposed using the supplied cards to match/remember concepts, select complex or simple foods, and reinforce that materials must be sufficiently simplified before absorption. She suggested stopping the organ journey at the Small Intestine, perhaps adding only memory/choose-correctly revision, then focusing on the video and necessary corrections.

The adopted plan therefore became:

```text
Stomach completion
  → third walkable road, in two views
  → Small Intestine digestion mission
  → brief explanation of absorption and undigested travellers
  → memory and choose-correctly revision
  → Kingdom of Digestion ending/replay
```

There is **no full fourth-organ chapter and no separate absorption action game** in the implemented scope. `Memory_Game_DifferentWay_01.jpg` and `_02.jpg` informed the interpretation of blood/lymph and absorption, but were not treated as automatic authorization for an additional game.

Scientific wording distinguishes digestion from absorption, blood from lymph, and cellulose from digestible complex molecules. It avoids treating “complex” as synonymous with “every substance our enzymes can digest.” Dounia's final curriculum/terminology review is still valuable.

## 8. Chapter 3 road and story integration

### 8.1 Two walkable views

The new road reuses Claude's `WorldScene`, `Character`, `Party`, walkable-area logic, cameras, waypoints and Ink/DialogueBox flow. New maps are:

```text
content/maps/intestine-road.tmj
content/maps/intestine-gate.tmj
```

They package to corresponding `.place.json` files and WebP backgrounds in `public/assets/world/`.

First view, `intestine-road`:

- Arrival from Stomach and a shared walk along the golden passage.
- `chyme` conversation: gastric mixing, pylorus release and the protein fragments still needing digestion.
- `starch` conversation: salivary amylase did not finish the whole meal; remaining starch reaches pancreatic amylase later.
- Exit into the gate view.

Second view, `intestine-gate`:

- Arrival draws attention to the two supply openings beside the gate.
- `helpers` conversation explains liver/gallbladder bile and pancreatic juice.
- Explicitly states that food stays on the intestinal path; the trio does not walk through the pancreas or gallbladder.
- Gate prediction: which acts first on fat — bile, lipase, or amylase?
- Records `predict_bile` through `GameState.predict('bile', ...)`.
- Ready / not-yet choice; entering uses the illustrated mission card and starts `SmallIntestine`.

The four road story sources are `intestine-road.ink` / `intestine-gate.ink` and their Arabic counterparts. English and Arabic compiled JSON is shipped under `public/assets/dialogue/` and `/ar/`.

### 8.2 Integration points

- `StomachScene.ts`: new Chapter 3 road handoff after completion.
- `WorldScene.ts`: collects the `bile` prediction alongside existing saliva/pepsin predictions; chooses Small Intestine artwork and supports replay on re-entering a finished mission.
- `ChapterScene.ts`: new illustrated artwork keys and text positions.
- `main.ts`: registers `SmallIntestine` and `Revision`, adds resume destinations and development preview routes.
- `GameState.ts`: persists Chapter 3 progress and migrates qualifying old completed-Stomach saves.

### 8.3 Road timeout investigation

An early automated road walkthrough timed out after 30 seconds while the trio was still approaching the exit. Existing movement becomes slow at a distance because of perspective scaling/foreshortening. Codex did not change established walking speed or character animation to make that test pass.

The final chapter browser test allows longer transitions and, in `--quick` mode, speeds up walking **inside the test only** using a `walkTo(..., 6)` override. A separate local diagnostic traversed the first new road at its normal speed and reached the gate view in **48 seconds including dialogue**, without speed overrides. That diagnostic is `.tools/work/natural-road.mjs` and its result is in `.tools/work/natural-road.log`.

This confirms reachability, not that every player will find the road's pace ideal. Manual pacing review remains appropriate.

## 9. Current interactive Small Intestine implementation

### 9.1 Rebuild after the rejected prototype

The first local version presented digestion in DOM panels/cards. The user correctly objected that this did not feel like the Mouth or Stomach games. That scene was replaced; the earlier new `src/scenes/SmallIntestineScene.ts` prototype file was removed.

**Current file:** `src/scenes/IntestineScene.ts`.  
**Exported class:** `SmallIntestineScene`.  
**Phaser scene key:** `SmallIntestine`.

Do not search only for a file named `SmallIntestineScene.ts` and conclude the implementation is missing. `main.ts` imports it from `IntestineScene.ts`.

The current scene is a Phaser canvas game. `src/scenes/Chapter3Base.ts` is used for Revision's DOM card board; Small Intestine does **not** derive from that base.

### 9.2 Moving chamber and target behavior

- Uses a 1280 × 720 logical scene and a background scaled to cover the viewport, following the Stomach approach.
- Molecules enter from the left opening, move into two broad vertical bands, drift across the chamber and gently flex/rotate.
- Spawns three original molecules per lesson, with at most two original families active at once. New roots are staggered rather than appearing as a static row of boxes.
- Descendants of a cut become new visible actors and separate from one another.
- Finished products remain visible briefly, then move toward the right exit and fade. Their exit is a presentation event, not a separate player-controlled absorption mechanic.
- Includes moving water, minerals and fibre as non-target travellers during digestion; the later explanation displays vitamin groups as well.
- Uses glowing links to indicate valid bond targets, scissors cursor motion, cut sparks, score popups, synthesized sounds and chamber-wave effects.
- Wrong tools preserve the substrate, give a shake/sound/hint and do not grant progress.
- Touch users see the scissors during contact; they hide after release so products remain readable.

### 9.3 Reactive supply openings

The openings now participate in play rather than remaining decorative:

- **Green bile opening:** pulses and sprays green/gold droplets toward the selected target. Correct bile treatment adds a visible coating/droplets around fat while retaining its bonds.
- **Pancreatic opening:** pulses in the selected enzyme's color. Particles and a small scissors sprite travel from the duct toward the substrate for pancreatic tools.
- **Intestinal wall:** provides colored effects for intestinal Peptidase and Maltase rather than incorrectly sourcing every tool from the pancreatic duct.
- Selection previews the helper's source; a successful action triggers its supply effect again.
- Lipase attempted before bile specifically directs attention back to the green opening.

The approximate logical effect origins are bile `(620,190)`, pancreas `(750,200)`, intestinal wall `(870,570)`, entry `(95,365)` and exit `(1190,475)`.

### 9.4 Pure digestion model

`src/chapter3/digestion.ts` contains a rendering-independent state model and the allowed transformations. The visual actors are driven by successful model actions; visual effects alone cannot complete a substrate.

| Lesson | Originals | Required sequence | Final products across the lesson | Correct actions |
| --- | --- | --- | --- | --- |
| Fats | 3 fats | Bile → emulsified fat → Lipase | 3 glycerol + 9 fatty acids | 6 |
| Protein | 3 four-unit polypeptides | Trypsin → two peptides each → Peptidase on every pair | 12 amino acids | 9 |
| Maltose | 3 pairs | Maltase on every pair | 6 glucose | 3 |
| Remaining starch | 3 six-unit chains | Amylase → three pairs each → Maltase on every pair | 18 glucose | 12 |
| **Total** | **12 originals** | Every required descendant must finish | **3 glycerol, 9 fatty acids, 12 amino acids, 24 glucose** | **30** |

Every correct action awards 10 points, so a fresh complete mission yields **300 points**. Wrong-tool mistakes affect the final star classification rather than subtracting points. Three stars are awarded for at most three mistakes, two for at most eight, otherwise one.

Model protections include:

- No transformation without tool selection.
- Lipase cannot act on untreated fat.
- Applying bile again to an already-prepared fat does not create extra progress.
- An enzyme cannot act on another pathway's substrate.
- Finished products cannot be cut or repeatedly rewarded.
- Completion checks every descendant of every original, not just the first successful cut.
- A lesson is not finished until all three originals are terminal and their visible products have left the playfield.

The glycerol + three fatty-acid products and exact protein/carbohydrate unit counts follow the chosen classroom diagram. Preserve the distinction between this teaching model and a detailed account of all real digestive intermediates.

### 9.5 Lesson structure, dialogue and timing

Each of the four lessons has an actual Ink conversation and a shared HUD mission banner/countdown before play. Each starts with a soft 60-second timer. Expiry changes the message to “Keep going” and allows completion; it does not skip work or create an automatic failure.

`content/dialogue/intestine.ink` and its Arabic equivalent contain `intro`, `fats`, `protein`, `maltose`, `starch`, `travellers`, `absorb` and `explain` knots.

After digestion, the story explains:

- Water, minerals and vitamins need no enzyme cutting.
- B/C are water-soluble vitamins; A/D/E/K are fat-soluble and their absorption involves fats/bile.
- Humans have no enzyme to digest cellulose; it helps movement and continues onward.
- Digestion prepares small nutrients; absorption moves them across the intestinal lining.
- Glucose and amino acids enter blood capillaries; most dietary fats enter lymph first and subsequently reach blood.

The scene then shows shared results, reminds the player of bile preparation, and transitions to the revision chapter card and `Revision` scene. The current explanation references the prediction generically; it does not yet branch its wording for every stored prediction answer.

### 9.6 Controls and lifecycle

- Click/tap a helper button, then a moving substrate or its highlighted bond.
- Drag/swipe across valid links for cutting.
- Keys `1` / `2` select the lesson's available tools; Space provides an equivalent eligible-target action. Enter acts when it is not being used to activate a focused HTML button.
- P / Escape pauses/resumes active play.
- Pausing freezes scene simulation, lesson time, Phaser timers and tweens. The shared reaction bubble still uses the existing browser-timeout behavior.
- Document hiding auto-pauses active play.
- Resize refits the camera; live language changes relabel actors and the current reaction.
- Shutdown removes DOM overlays, listeners, language subscriptions and resets cursor/time state. A visit token guards the main asynchronous lesson sequence when a scene is left.

## 10. Memory, classification quiz, and ending

### 10.1 Intent and theme

Cards belong here because Dounia specifically requested a memory/matching revision game after Small Intestine. `RevisionScene.ts` uses DOM buttons for accessible card interaction over a Phaser background. It retains the actual shared timer/score/pause/reaction UI, not the first prototype's independent header and feedback boxes.

An existing-style `DialogueBox` introduction gives the kids and fox a speaking role before the first board. Card/name labels are live EN/AR. Blue Trypsin and Peptidase pictures use ② / ③ badges; Maltase is pink.

### 10.2 Two memory boards

Each board has six illustration-to-name pairs / twelve cards, shuffled on preparation:

| Board | Concepts |
| --- | --- |
| Molecules | Starch, maltose, glucose, four-unit polypeptide, two-unit peptide, amino acid |
| Helpers | Bile, lipase, Trypsin ②, Peptidase ③, pancreatic Amylase, intestinal Maltase |

A match requires the same concept and opposite faces, not merely two pictures. Incorrect pairs remain visible briefly and flip back; correct pairs remain revealed. Input locks while a pair is being resolved. Pause freezes those Phaser reveal timers. All six pairs are required to continue.

### 10.3 Three classification questions

The first prompt deliberately asks what **still needs digestion**, rather than using an unqualified complex/simple dichotomy that would mishandle cellulose.

| Question | Correct choices | Distractors |
| --- | --- | --- |
| Select all molecules still needing digestion | Starch, fat, four-unit polypeptide, maltose | Glucose, amino acid |
| Select all substances ready for absorption without further enzyme cutting | Water, amino acids, mineral salts, glucose, water-soluble vitamins, fat-soluble vitamins | Starch, cellulose |
| What happens to cellulose fibre? | Remains undigested and helps movement | An enzyme cuts it into glucose; the whole fibre enters the blood |

The first two use exact multi-selection; the cellulose question is single-choice. Empty and incorrect answers cannot advance. Incorrect answers give explanations and allow another attempt. Correct answers give an explanation before Continue.

### 10.4 Ending and replay

- Final progress is `quiz = 5`, `place = 'complete'` and discovery `kingdom_complete`.
- Displays the trio, a shared-theme results panel, completion text and replay options.
- Replay the quiz resets its board/question checkpoint.
- Replay Small Intestine resets Chapter 3 mission/quiz counters and scores, then starts fats again.
- Re-explore the road returns to `World { place: 'intestine-road' }`.
- Existing discoveries are retained by replay.
- Last phone polish gives the ending a compact two-column layout and hides the old quiz reaction, so all replay controls fit without scrolling on the tested landscape viewport.

## 11. Artwork, generated assets, and packaging

### 11.1 Approved Chapter 3 background concepts

The user requested visual proposals before implementation, then approved proceeding. The retained concept masters are:

| File in `docs/previews/chapter3/` | Use |
| --- | --- |
| `road-a-concept-v1.png` | First walkable road view, 1536 × 1024 |
| `road-b-concept-v1.png` | Second road/gate view with supply ducts, 1536 × 1024 |
| `digestion-room-concept-v1.png` | Side-on moving digestion chamber, 1672 × 941 |
| `memory-hall-concept-v1.png` | Palace-style revision background, 1672 × 941 |
| `prompts.json` | Background prompts and supplied references, including correction of inherited stomach motifs to intestine motifs |
| `README.md` | Visual-plan context and sequence |
| `IMPLEMENTATION-CHECKPOINT.md` | Short local implementation/test checkpoint; updated after resuming |

The revision background draws on Dounia's memory artwork; the chamber draws on her Small Intestine reference. These are derivatives, not replacements for original supplied images.

### 11.2 Chapter 3 generated/cutout masters

`art/chapter3/` contains eleven local PNG masters:

```text
mission-card.png
bile.png
lipase.png
maltase.png
glycerol.png
fattyAcid.png
water.png
minerals.png
waterVitamins.png
fatVitamins.png
fibre.png
```

- `mission-card.png`: removed baked English from `Chapter3_Small_Intestines_Mission.jpg` for translated runtime titles.
- `bile.png`: isolated the bile mascot from `Memory_Game_19.jpg`.
- `lipase.png`: isolated yellow scissors from `Memory_Game_05.jpg`.
- `maltase.png`: recolored the existing purple/gold amylase scissors to rose pink/gold while preserving the tool's style.
- `glycerol.png` / `fattyAcid.png`: isolated the green body and **one** complete yellow tail, respectively. Earlier product crops were inadequate; the current exports use separate proper sprites.
- Water/mineral/vitamin/fibre sprites: transparent-background derivatives of `SI_3rdGame_05.jpg` through `_09.jpg` for moving actors rather than white rectangular source pictures.

Built-in image generation/editing was used for raster derivatives, with supplied references and preserved visual direction. Pillow was used for normal resizing/format conversion in packaging. Complete tool/cutout prompts are in `content/prompts/chapter3/assets.json`.

`art/` is gitignored. Keep these local masters available if regenerating exports. A fresh clone can run from shipped assets; it cannot rerun this packaging script without the masters/references it expects.

### 11.3 Packaged runtime assets

`tools/pipeline/pack_chapter3.py` produces:

```text
public/assets/chapters/small-intestine-road.webp
public/assets/chapters/small-intestine-mission.webp
public/assets/chapters/revision.webp
public/assets/world/intestine-road.webp
public/assets/world/intestine-road.place.json
public/assets/world/intestine-gate.webp
public/assets/world/intestine-gate.place.json
public/assets/intestine/background.webp
public/assets/intestine/bile.webp
public/assets/intestine/lipase.webp
public/assets/intestine/maltase.webp
public/assets/intestine/glycerol.webp
public/assets/intestine/fattyAcid.webp
public/assets/intestine/water.webp
public/assets/intestine/minerals.webp
public/assets/intestine/waterVitamins.webp
public/assets/intestine/fatVitamins.webp
public/assets/intestine/fibre.webp
public/assets/intestine/ui_card_fats.webp
public/assets/intestine/ui_card_protein.webp
public/assets/intestine/ui_card_maltose.webp
public/assets/intestine/ui_card_starch.webp
public/assets/revision/background.webp
public/assets/revision/card-back.webp
```

Step cards come from `Memory_Game_18.jpg` (fats), `_07.jpg` (protein), `_11.jpg` (maltose) and `_10.jpg` (starch). The revision card back comes from `Memory_Game_02.jpg`.

The game also intentionally reuses existing Stomach fat/protein/starch unit/scissors textures and Mouth amylase/maltose textures. Not every supplied `SI_3rdGame_*` or `Memory_Game_*` image is loaded directly. Some are scientific/interface references or alternatives.

### 11.4 Packaging commands

From this Windows workspace, the working Pillow environment is:

```powershell
.tools\venv\Scripts\python.exe tools/pipeline/pack_chapter3.py
```

That script invokes `build_maps.py intestine-road intestine-gate`. Codex added optional positional map-name filters to `build_maps.py` so the new maps can be built without regenerating unrelated maps. Calling it without map names retains its existing all-maps behavior.

The local default Python lacked Pillow. The existing venv's Windows Store launcher needed execution outside the Codex sandbox during packaging; that was a tool-launch restriction, not a game requirement. Do not reinstall the entire art toolchain merely to run the game.

## 12. Localization, UI consistency, and input

### 12.1 Shared UI reuse

The rebuilt mission's `IntestineHud` extends the existing `MiniGameHud`. The revision base creates a `RevisionHud` that also extends it. They reuse actual existing timer/score/pause art, mission banners, cream/gold character reactions and result cards.

`DialogueBox` and `DialogueRunner` remain the story/dialogue path. There is no replacement chat interface or separate character style.

The shared HUD received two small additive methods:

- `retextReaction(text)`: updates the current reaction's text and speaker name when a scene changes language.
- `dismissPause()`: removes the pause card when resuming through the keyboard.

The latest local Mouth fix also uses `dismissPause()`; earlier deployed behavior is otherwise preserved.

### 12.2 Translation structure

- `src/i18n/chapter3.ts`: paired English/Arabic dictionary for roads, stages, model names, quiz, results, discoveries and ending.
- `src/i18n/intestine.ts`: instructions and reactions specific to the interactive rebuild/shared HUD.
- `en.ts` and `ar.ts` spread these additions into the existing phrasebooks.
- Four new Ink story names (`intestine-road`, `intestine-gate`, `intestine`, `revision`), each with EN and AR source/compiled JSON.
- Runtime text remains live. Baked-in English was removed from the Chapter 3 mission plate just as for Chapters 1/2.

Arabic progress uses “{n} من {total}” to avoid a reversed slash fraction. Existing fonts include Baloo Bhaijaan 2. Use explicit UTF-8 when reading Arabic through Windows PowerShell; its default display can show mojibake even when the file and browser rendering are correct.

### 12.3 Responsive fixes made during the rebuild

- A centered task header initially covered the green/pancreatic openings on the 740 × 360 phone viewport. The short-landscape rule moves the task box to the upper right, leaving both openings visible.
- Tool buttons and reactions use compact phone dimensions while retaining the existing visual theme.
- Revision uses `ResizeObserver` to reserve bottom space for longer character explanations, preventing them from covering choice cards.
- The final ending received a compact layout so its replay buttons fit on the phone viewport.
- Native window keyboard handling in the new scenes avoids the queued-event duplication seen in the older Mouth test. Enter does not both activate a focused helper button and perform an unintended cut.

## 13. Save/resume changes and compatibility

### 13.1 Stored data

Existing local-storage key remains `funscientia.save.v1`; online envelope remains version 1. `GameState` adds:

```ts
interface Chapter3Progress {
  lesson: number;   // 0..4; completed digestion lessons
  quiz: number;     // 0..5; completed revision stages
  score: number;
  mistakes: number;
}
```

`chapter3` is optional in `OnlineData` for older saves. Values are validated/clamped to finite, nonnegative integers: lesson ≤ 4, quiz ≤ 5, score ≤ 100000, mistakes ≤ 10000. Local loading normalizes missing progress to zero.

`checkpointChapter3()` persists changes through the existing GameState listeners, allowing the already-existing online-save mechanism to serialize the additional JSON. No SQL migration, new database table, credentials or backend feature was added for this chapter.

### 13.2 Checkpoint boundaries

- Digestion saves after each **completed lesson**, with its score/mistakes. It does not save individual actor positions or partly-cut molecules.
- Refreshing mid-lesson restarts that lesson; earlier completed lessons remain complete.
- Revision saves between memory boards and classification questions. Mid-board matched/open cards are not persisted.
- New places are `intestine-road`, `intestine-gate`, `small-intestine`, `revision` and `complete`.
- `main.ts` maps those places to the correct chapter artwork and onward scene during Continue-with-code.
- A legacy save with no Chapter 3 object, `place === 'stomach'` and the `chyme` discovery is advanced to the new road. An unfinished Stomach save is not advanced by that condition.
- Replay mission resets lesson/quiz/score/mistakes; replay quiz resets only quiz progress. Discoveries/predictions and the chosen avatar/name are retained.

The existing online-save code and backend remain important inherited systems. Do not replace or reset them to simplify testing.

## 14. Current file inventory

### 14.1 Tracked files modified beyond deployed source HEAD

At the start of this documentation turn, these eleven tracked files had local modifications:

| File | Local change |
| --- | --- |
| `package.json` | Adds `test:chapter3`; no new Chapter 3 dependency installation |
| `src/i18n/ar.ts` | Integrates new Arabic phrasebooks |
| `src/i18n/en.ts` | Integrates new English phrasebooks |
| `src/main.ts` | Scene registration, Chapter 3 CSS imports, resume destinations, development review URLs |
| `src/scenes/ChapterScene.ts` | Chapter 3 artwork keys/positions and title treatment |
| `src/scenes/MouthScene.ts` | Duplicate keyboard-event guard and keyboard pause-card removal |
| `src/scenes/StomachScene.ts` | Handoff from completed Stomach into the new road |
| `src/scenes/WorldScene.ts` | Bile prediction and Small Intestine gate/art/replay integration |
| `src/state/GameState.ts` | Chapter 3 checkpoints, validation, export/restore and legacy migration |
| `src/ui/MiniGameHud.ts` | `retextReaction()` and `dismissPause()` |
| `tools/pipeline/build_maps.py` | Optional map filters |

The deployed chapter/Mouth/Stomach changes are already in Git and therefore do not appear as uncommitted changes unless additionally modified above. Use the three release commits for their historical inventory.

### 14.2 New, currently untracked implementation files

```text
src/scenes/IntestineScene.ts
src/scenes/RevisionScene.ts
src/scenes/Chapter3Base.ts
src/ui/IntestineHud.ts
src/chapter3/digestion.ts
src/chapter3/art.ts
src/chapter3/styles.css
src/chapter3/intestine.css
src/i18n/chapter3.ts
src/i18n/intestine.ts
content/maps/intestine-road.tmj
content/maps/intestine-gate.tmj
content/dialogue/intestine-road.ink
content/dialogue/intestine-gate.ink
content/dialogue/intestine.ink
content/dialogue/revision.ink
content/dialogue/ar/intestine-road.ink
content/dialogue/ar/intestine-gate.ink
content/dialogue/ar/intestine.ink
content/dialogue/ar/revision.ink
content/prompts/chapter3/assets.json
tools/check_chapter3.mjs
tools/pipeline/pack_chapter3.py
```

Their shipped art is listed in section 11. Compiled story counterparts are new in `public/assets/dialogue/` and `public/assets/dialogue/ar/`. `docs/previews/chapter3/` is also new/untracked, including its images, prompts, README and checkpoint.

### 14.3 Supplied images present but not yet tracked

These are part of the user's material in the workspace, not disposable scratch files:

- `docs/images/Chapter3_Small_Intestines_Mission.jpg`.
- `docs/images/MiniGame3_01.jpg`.
- `docs/images/SI_3rdGame_01.jpg` through `_21.jpg`.
- `docs/images/Memory_Game_01.jpg` through `_35.jpg`, the extra `Memory_Game_045.jpg`, and `Memory_Game_DifferentWay_01.jpg` / `_02.jpg`.

Preserve them. Decide intentionally what source/reference material to include when eventually staging; do not blindly delete untracked files or assume every untracked file was generated by Codex.

### 14.4 Local/ignored working artifacts

- `art/chapter3/`: generated PNG masters.
- `.tools/work/`: test logs, helper scripts and additional screenshots.
- `dist/`: latest production build output, regenerable.
- `%TEMP%/funscientia-*`: Playwright screenshots from individual runs.

These are outside normal Git tracking under existing ignore rules. The handoff document itself is a new file in `docs/`.

## 15. Validation performed and its limits

### 15.1 Build and content checks

The latest implementation turn successfully ran:

```powershell
npm.cmd run build
npm.cmd run ink
git diff --check
```

`build` runs `tsc --noEmit` and Vite production bundling. Ink compilation includes the new EN/AR stories and language-structure checks. Diff checking passed; Windows CRLF normalization warnings were informational.

These results were checked from the actual commands/logs, not inferred from code inspection. This documentation-only turn read that evidence rather than rerunning all gameplay checks.

### 15.2 Chapter 3 domain and browser regression

Command:

```powershell
npm.cmd run test:chapter3 -- http://127.0.0.1:5178/ --quick
```

Latest complete run passed:

```text
PASS: digestion prerequisites, complete descendants, three originals, conserved products and no duplicate rewards.
desktop-en: PASS — roads, prediction, all digestion pathways, pause, language, checkpoints, both memory boards, classification, ending and replay.
phone-ar: PASS — roads, prediction, all digestion pathways, pause, language, checkpoints, both memory boards, classification, ending and replay.
legacy save: PASS — no forced stomach replay and backward-compatible progress.
PASS: Chapter 3 complete.
```

Coverage includes moving target positions, no-tool/wrong-tool handling, reactive bile outlet state, every pathway/descendant, three originals, no single-hit lesson finish, simulation pause, keyboard resume/overlay removal, language toggles, refresh after the fats lesson, saved score, both memory boards, mismatched-pair pause behavior, exact classification answers, ending, replay and old online save restoration.

Contexts are desktop English at 1280 × 720 / DPR 1 and Arabic mobile/touch emulation at 740 × 360 / DPR 2. Tests use `playwright-core` with installed Microsoft Edge (`channel: 'msedge'`).

`--quick` shortens banners and speeds road movement in the test harness. It still interacts with actual moving Phaser actors using pointer/touch coordinates and checks real model progress. It is **not** evidence that a complete unaccelerated chapter was played manually on a physical phone.

Latest full-run screenshots:

```text
C:\Users\TheShadow\AppData\Local\Temp\funscientia-chapter3-2iPepF\
```

They include road views, moving lessons, intermediate protein/starch pairs, completed lessons, results, both memory boards, all questions and ending. A preceding interactive run is in `funscientia-chapter3-nm7y58`; older prototype/failure screenshots exist as well. Prefer the latest run and the final focused screenshots when evaluating the current interface.

### 15.3 Existing game regressions

```powershell
npm.cmd run test:mouth -- http://127.0.0.1:5178/ --quick
npm.cmd run test:stomach -- http://127.0.0.1:5178/ --quick --small
```

Both passed desktop and Arabic phone contexts after the local Mouth keyboard fix.

Mouth covers a complete desktop moistening round, five bread reveals, all five chains/fifteen pairs, explicit tool selection, invalid cuts, pause, localization, rewards and esophagus card. Its quick mode shortens earlier rounds; mobile also exercises the idle-timeout path.

Stomach covers churning/acidity behavior, five proteins, pepsin selection, four-unit products, unchanged maltose/fat, overtime, pause, language, chyme and the new chapter handoff. Quick/small modes accelerate setup; they do not constitute a full real-time balance assessment of every round.

Latest screenshots:

```text
C:\Users\TheShadow\AppData\Local\Temp\funscientia-mouth-J8ztMV\
C:\Users\TheShadow\AppData\Local\Temp\funscientia-stomach-svXzrI\
```

### 15.4 Focused checks after the last layout changes

After the full Chapter 3 run, small final changes added explicit development replay links and improved the phone ending layout. A focused browser script passed:

```text
PASS: fresh review links, bile/lipase touch actions, phone ending controls, and no page exceptions.
```

That script verified fresh mission/quiz links, a real bile → lipase touch interaction and all ending controls fitting within the phone viewport. The final build and Ink compilation passed after those changes. The entire long Chapter 3 regression was not unnecessarily rerun after that last narrow layout/link polish.

Files:

```text
.tools/work/final-review.mjs
.tools/work/intestine-interactive-ar.png
.tools/work/chapter3-ending-ar.png
.tools/work/natural-road.mjs
.tools/work/natural-road.log
.tools/work/chapter3-regression.log
.tools/work/mouth-regression.log
.tools/work/stomach-regression.log
.tools/work/chapter3-build.log
.tools/work/chapter3-ink.log
```

These are local/ignored convenience artifacts. Durable regression scripts live in `tools/`.

### 15.5 Database isolation and remaining test limits

All the browser tests intercept Supabase requests to the project's host and return fixtures for create/save/load. `TEST-2345` is a test fixture, not a production save to modify. Do not remove interception when running automated loops.

Test success confirms the exercised behavior, buildability and absence of observed missing resources/page exceptions. It does not establish physical-device performance, final curriculum acceptance, user enjoyment, every screen size, or approval to publish. There was no new comprehensive backend/security test campaign for Chapter 3 because no backend implementation changed.

## 16. How to run and inspect the local work

### 16.1 Stack and environment

Current package declarations are Phaser `4.2.1`, TypeScript `~6.0.3`, Vite `^8.3.4`, inkjs `^2.4.0`, playwright-core `^1.64.1` and Baloo Bhaijaan 2 `^5.3.0`. Node 24.12.0 was used locally. The Chapter 3 test imports a `.ts` domain file directly with Node's native TypeScript support; use the existing Node 24 environment rather than assuming the old README's Node 20 minimum covers this test command.

Use `npm.cmd` in PowerShell: the execution policy blocked the `npm.ps1` shim. No application dependency changes were needed for the Chapter 3 features.

### 16.2 Local server and review URLs

The implementation was last served at `http://127.0.0.1:5178/`. A previously running process may not survive a new session; start it if necessary:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5178
```

Development-only review links:

| Review | URL |
| --- | --- |
| New road | <http://127.0.0.1:5178/?preview=intestine-road> |
| Digestion, respecting saved checkpoint | <http://127.0.0.1:5178/?preview=intestine> |
| Digestion, restart for review | <http://127.0.0.1:5178/?preview=intestine&replay=1> |
| Revision, respecting saved checkpoint | <http://127.0.0.1:5178/?preview=revision> |
| Revision, restart for review | <http://127.0.0.1:5178/?preview=revision&replay=1> |

The `import.meta.env.DEV` branch in `main.ts` provides these shortcuts and is removed from the production bundle. Default links preserve progress. `replay=1` explicitly invokes replay behavior: mission replay resets the Chapter 3 lesson/quiz/score/mistakes; quiz replay resets the quiz checkpoint. If a preserved-checkpoint link goes straight to a late section or the ending, that can be saved progress rather than a broken scene.

Unlike the automated tests, ordinary manual preview sessions use the normal save integration. Be conscious of the save code/session being used for manual review.

### 16.3 Useful read-only history commands

```powershell
git status --short --branch
git log -8 --oneline
git show --stat aff671a
git show --stat b4311e3
git show --stat 6e9f508
git diff -- src/scenes/MouthScene.ts src/scenes/StomachScene.ts src/state/GameState.ts
```

Use the current files plus these diffs when picking development back up. Do not reset to HEAD simply because the implementation is not yet committed.

## 17. Known limitations and next review priorities

These distinguish actual implementation details and unfinished review from the earlier “done” reports:

1. **User acceptance is pending.** The latest rebuild has not received Hicham/Dounia approval. Their demand for interactive motion and the existing HUD/dialogue theme takes priority over preserving Codex's earlier design decisions.
2. **Chapter 3 is unpublished.** The local scene integration, assets, saves, tests and the small Mouth input fix are not on `main`/the live game yet.
3. **Road pace needs a human judgment.** Normal first-road traversal works, but distant perspective movement is slow. Do not casually alter core `Character`/`Party` behavior or substitute fake gait animation.
4. **The new mission uses successive lessons.** It is not a fully mixed continuous stream of all four digestible substrate types. During each lesson, that substrate and its descendants move among ambient travellers. This is the actual current structure, not a promise of mixed simultaneous pathways.
5. **Starch cut granularity differs from Mouth.** In the Small Intestine model, one valid Amylase action transforms a six-unit chain into all three maltose pairs. The long chain displays two highlighted possible bond locations, but it does not currently require two separate successful Amylase cuts as the Mouth task does. All resulting maltose pairs still require Maltase. Review this if Dounia/user wants identical cut-by-cut granularity.
6. **Bile is shown as coating/preparation.** The rendered single fat sprite gains droplets/coating; it is not a physical simulation of a fat droplet breaking into many separate emulsified droplets. Bonds remain intact until Lipase. Check whether the wet/prepared appearance sufficiently conveys Dounia's explanation.
7. **Supply effects preview on selection.** They can animate toward the current target before a successful cut. Model changes still require a valid tool/substrate action. This is a visual choice to review, not proof the enzyme has already acted.
8. **Prediction explanation is generic.** The bile answer is saved and the rule is explained, but `explain` does not tailor its text to a wrong/correct stored choice. This is a gap relative to a fully personalized predict → try → explain loop.
9. **Absorption is explanatory.** Finished products drifting out of the chamber are not a blood/lymph routing game. Avoid presenting that exit animation as tested nutrient transport physiology.
10. **Curriculum simplifications remain deliberate.** Four-unit polypeptides, two-unit peptides, single-unit end products and glycerol + three fatty acids reflect the teaching diagrams. Have Dounia review terminology and scientific framing for 4AM before broadening detail.
11. **Some prototype CSS remains.** `src/chapter3/styles.css` still has obsolete boxed-digestion selectors such as `.c3-root-molecule` and `.intestine-game`. They are not used by the rebuilt Phaser mission. Cleanup is reasonable after confirming the active Revision/art styles that still depend on that file; do not restore the removed prototype because those selectors exist.
12. **Checkpoint granularity is intentionally coarse.** Individual cuts, actor motion and mid-memory matches are not restored after refresh. Document/test any future change to this contract.
13. **Shared HUD behavior has inherited limits.** Reaction bubbles use browser timeouts and can expire during pause. The new mission/quiz keyboard pause-overlay removal was tested; there was no broad redesign of all existing HUD timing behavior.
14. **Device coverage is emulated.** Manual landscape review on Hicham's actual device is still needed, especially target readability, touch accuracy, overlapping moving labels and performance. No formal FPS/performance benchmark was completed.
15. **Documentation outside this handoff is stale.** Root README still says early prototype/Mouth next, ages 8–12 and no backend. Claude's memory contains older partial status. This handoff does not silently rewrite those documents or the external memory.
16. **Art regeneration has local prerequisites.** Ignored masters and local tooling exist here but are not included automatically in a clone. Runtime exports are present and sufficient for normal game execution.
17. **Other proposed work is not implemented.** Dounia mentioned focusing on the video and remaining corrections after this chapter. Codex did not complete a submission/demo-video overhaul, a new fourth-organ game, teacher dashboards, new backend features or additional character animation during this takeover.

## 18. Publishing history, tools, and operational notes

### 18.1 Publication during Codex's work

The user separately authorized commit/push/deploy after the chapter/Mouth work, after the five-bread correction and after the Stomach update. Those releases form the three commits above. No blanket publishing permission carries over to the unreviewed Chapter 3 work.

The project has two publishing mechanisms:

- `npm.cmd run deploy` → `tools/deploy.mjs`: builds the current working directory, copies `dist` to a temporary Git repository, commits a deployment and force-updates the remote `gh-pages` branch.
- `.github/workflows/deploy.yml`: configured to build/deploy Pages on pushes to `main` or workflow dispatch; historical notes say Actions availability was a reason to use the manual script.

Do not run either publishing path while merely inspecting/reviewing this handoff. The manual script can publish **dirty local work**, adding `(+ local changes)` to its deployment message. A source push can also trigger the configured workflow. After later explicit approval, check the intended source/art inventory and repository/Pages settings before using the existing workflow.

The local `origin/gh-pages` remote-tracking ref was stale at `99972e1` (`Deploy b4311e3`) during documentation. A read-only `git ls-remote` confirmed actual remote `gh-pages` is `1043a1d6ddee956a672368e9fa23bfb230e86ab6`; do not mistake the stale tracking ref for evidence the Stomach release was never published.

### 18.2 Tools actually used for the takeover

- Git history/status/diffs and the existing local source/toolchain.
- PowerShell, `rg`, Node/npm and the Vite development server.
- TypeScript compiler and Vite production build.
- Existing Ink compilation/language parity tooling.
- Playwright Core with installed Edge for browser/touch emulation, assertions and screenshots.
- Built-in image generation/editing for text removal, new background concepts and reference-derived sprites.
- Existing Pillow environment for packaging WebP exports and existing Tiled map conversion code.
- Local Claude memory files as context references; these were not a substitute for checking actual current source.

No application framework migration, external game-builder migration or replacement backend was introduced. Earlier local AI/video/upscale tools remain inherited project facilities; listing them in old README/memory is not a claim that every one was rerun for Chapter 3.

### 18.3 Workspace care

- Keep `.tools/`, `art/`, `dist/` and raw videos under their existing ignore strategy.
- `docs/videos/` is intentionally ignored; do not publish raw team videos accidentally.
- The many untracked supplied images and new source/export files are important. Avoid destructive clean/reset operations.
- Git/PowerShell may display permission or CRLF notices in this environment. Distinguish tooling restrictions from source/build failures.
- No `AGENTS.md` or `CLAUDE.md` was found inside this repository during the handoff inspection. Relevant Claude context exists under the user-profile path listed above.
- No live chat messages, email, Slack messages or other team communications were sent as part of this handoff.

## 19. Suggested first actions for Claude

1. Read this document, the user's latest feedback, and [the shorter Chapter 3 checkpoint](previews/chapter3/IMPLEMENTATION-CHECKPOINT.md).
2. Inspect `git status` and the current `IntestineScene.ts`, `IntestineHud.ts`, `MiniGameHud.ts`, `RevisionScene.ts`, `digestion.ts` and new Ink stories. Preserve local work and supplied files.
3. Open the fresh local mission URL and judge whether movement, reactive openings, cutting, information boxes and companion reactions now meet the user's standard. Compare directly with existing Mouth and Stomach behavior.
4. Let Hicham verify locally and incorporate his/Dounia's feedback. Pay particular attention to the concrete limitations in section 17 rather than assuming passing automation settled product quality.
5. When gameplay changes justify it, rerun the relevant build, Ink and browser regressions with database interception intact. Inspect phone screenshots, not only exit codes.
6. Update stale project documentation/memory intentionally if useful, while keeping the user's explicit 4AM audience and interactive-theme correction prominent.
7. Only after the user's later publishing authorization, stage the intended source/export/reference files, commit, push and deploy using the existing project mechanism. Do not publish as part of simply receiving this handoff.

**Handoff boundary:** Codex's implementation work is left in place for Claude Code. This document records what happened and what is currently present; it does not imply that the user accepted Chapter 3 or requested further Codex development.
