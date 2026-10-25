// The Helpers' Junction: the second view of the road, at the Small Intestine Gate.
// Speaker tags as in road.ink, plus intestine (the Small Intestine Guardian). [player] = the player's name.
// The Arabic version is content/dialogue/ar/intestine-gate.ink (same knots, same tags, same choices).

VAR leader = "walid"
VAR predict_bile = ""

=== arrival ===
#speaker:leader #mood:surprised
Look at those two openings beside the gate!
#speaker:buddy #mood:thinking
They bring helpers into the first part of the small intestine: the duodenum.
#speaker:fox #mood:happy
Yip! Our food stays on this path. The helpers come to us!
#speaker:leader #mood:happy
Let's discover where they come from before entering.
-> END

=== helpers ===
#speaker:leader #mood:thinking
What comes through the green opening?
#speaker:buddy #mood:happy
Bile. The liver makes it, and the gallbladder stores and releases it into the small intestine.
#speaker:buddy #mood:thinking
The other duct brings pancreatic juice. Its enzymes help digest proteins, fats and the starch that remains.
#speaker:leader #mood:surprised
So we don't walk through the gallbladder or pancreas. Their secretions join the food here!
#discovery:bile
-> END

=== gate ===
#speaker:intestine #mood:happy
Welcome, explorers! I am the Guardian of the Small Intestine.
#speaker:intestine #mood:thinking
Behind me is the duodenum, the first part of the small intestine. Here the chyme from the stomach meets bile and pancreatic juice.
#speaker:leader #mood:surprised
And after that, where does the food go?
#speaker:intestine #mood:happy
Along my long, folded tube. It is so long that it lies coiled up inside the belly!
#speaker:intestine #mood:thinking
Now, here is my question. A fat molecule arrives: which helper should act on it first?
* [Bile.]
    ~ predict_bile = "bile"
* [The yellow Lipase scissors.]
    ~ predict_bile = "lipase"
* [The purple Amylase scissors.]
    ~ predict_bile = "amylase"
- #speaker:intestine #mood:surprised
Interesting! Remember your answer - inside, you will find out.
-> ready

= ready
#speaker:intestine #mood:happy
Ready to enter the Small Intestine?
* [Yes, let's go!]
    #action:enter
    -> END
* [Not yet.]
    #speaker:intestine #mood:happy
    Take your time. My helpers are always ready.
    -> END
