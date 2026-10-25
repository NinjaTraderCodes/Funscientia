# Chapter 3 background concepts

These approved concepts now supply the packaged backgrounds in the local Chapter 3 implementation. This directory retains the original review masters.

| File | Intended use |
| --- | --- |
| [road-a-concept-v1.png](road-a-concept-v1.png) | First walkable view after leaving the stomach; approach to the small-intestine passage. |
| [road-b-concept-v1.png](road-b-concept-v1.png) | Second walkable view; two side supply ducts and the small-intestine mission gate. |
| [digestion-room-concept-v1.png](digestion-room-concept-v1.png) | Side-view digestion chamber adapted from Dounia's SI_3rdGame_01.jpg, with a quieter central play area. |
| [memory-hall-concept-v1.png](memory-hall-concept-v1.png) | Empty palace backdrop adapted from Memory_Game_01.jpg for interactive revision cards. |

The road images are 1536 x 1024. The digestion and memory backgrounds are 1672 x 941; these are review concepts, not final production exports.

## Implemented sequence

Stomach completion → two-view walkable road → Chapter 3 mission card → small-intestine digestion missions → brief explanation of absorption → memory / choose-correctly revision game → Kingdom of Digestion ending.

Dounia's new message favors stopping the organ journey after the small intestine. The two Memory_Game_DifferentWay images introduce an alternative absorption concept, but do not by themselves require a second full action game.

The previous proposed closing classification task moves into the revision game. The digestion mission still introduces water, minerals, vitamins and fibre, so pupils encounter these substances before the quiz.

Suggested revision activities:
- Match an illustration to its scientific name.
- Select molecules that need digestion or are ready for absorption, with cellulose treated explicitly as an undigested exception.
- Give a short explanation after each answer; allow replay without a time-out failure.

Use live English/Arabic labels. Keep enzyme colors and stage badges consistent with the digestion mission. Treat supplied interface illustrations as visual references, not as an automatic scientific answer key.

## Generation record

These concepts were made with the built-in image_gen tool. [prompts.json](prompts.json) contains the complete prompts and references, including the correction that replaces the first road draft's inherited stomach emblems with small-intestine emblems.

Supplied reference images were preserved. See [IMPLEMENTATION-CHECKPOINT.md](IMPLEMENTATION-CHECKPOINT.md) for implementation and validation details. Changes remain local pending review.

