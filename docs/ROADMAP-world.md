# World improvements backlog

Ideas agreed on 2026-10-20 for the overlook (before the hero choice) and the Road to the Mouth Gate.
Tick them off as they land.

## Overlook
- [x] **1. A short scene before the choice.** A short exchange after the camera pull-back (Walid: "Look, the whole Kingdom!", Nesma: "Where do we start?", the fox yips towards the trail), then "Who leads the way?".
- [x] **2. Ambient life.** Drifting clouds, sparkling waterfalls, a few birds, so the world feels alive rather than a still picture.
- [x] **3. Sound and music.** Continue the intro's music into the game. Add soft footsteps and sparkle sounds for waypoints. This matters most for the demo video.

## Road to the Mouth Gate
- [x] **4. 3D Tooth Guardian and a real signpost.** Replace Dounia's flat 2D sticker with a 3D-style Tooth, and draw the signpost prop. Codex images; no GPU quota needed.
- [ ] **5. Lighting per place.** The characters carry the overlook's warm sunset tint. Tint them to each place's light in-game.
- [x] **6. Mood portraits.** Surprised, thinking and cheering expressions for Walid, Nesma, the fox and the Tooth (Codex, from the turnarounds).
- [ ] **7. Discovery book.** A small book icon showing the discovery cards collected so far (progress plus learning evidence).
- [ ] **8. Arabic dialogue.** Translate `content/dialogue/road.ink`; the dialogue box already supports right-to-left text.

## Character movement (waiting for GPU quota)
- [x] Side walks for Walid and Nesma (Wan clip, 3 s)
- [x] Walid's front walk redone (3 s clip, so both steps are complete)
- [x] Fox-only clips (front, back, side) with a natural diagonal trot

## Walk to the Mouth Gate (2026-10-20)
- [x] Depth layers (parallax): far / mid / near per place (`tools/pipeline/place_layers.py`, Tiled `parallaxx`)
- [x] Camera with intent: works slightly zoomed in, looks ahead, eases closer near the goal, establishing shot on arrival
- [x] New shot at the bend: a second road picture (`road2`) and a whip-pan cut between them
- [x] Contact shadows under the characters
- [ ] A fox with a mind of its own: sniffing and sitting idles, from Wan clips (prompts ready in `content/prompts/fox_idle_*.txt`)
