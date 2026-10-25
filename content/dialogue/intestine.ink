// The Small Intestine mini-game: the Small Intestine Guardian coaches, the friends chime in.
// Speaker tags as in road.ink, plus intestine (the Small Intestine Guardian). [player] = the player's name.
// The game sets predict_bile (the answer given at the Small Intestine Gate) before `explain`.
// The Arabic version is content/dialogue/ar/intestine.ink (same knots, same tags, same choices).

VAR leader = "walid"
VAR predict_bile = ""

=== intro ===
#speaker:intestine #mood:happy
Come in, [player]! Your chyme has just arrived from the stomach.
#speaker:intestine #mood:thinking
Here, digestion is finished. Look up: the green duct brings bile from the gallbladder, the orange duct brings the pancreas' juice, and my own wall makes juice too.
#speaker:buddy #mood:surprised
So the helpers come from three different places?
#speaker:intestine #mood:happy
Exactly. Tap an opening to take its helper, then use it on the food. And when everything is small enough... my villi will absorb it!
#speaker:fox #mood:happy
Yip!
-> END

=== explain ===
{
- predict_bile == "bile":
    #speaker:intestine #mood:cheering
    At my gate you predicted that bile acts first on fats. You were right!
- predict_bile == "lipase":
    #speaker:intestine #mood:thinking
    At my gate you thought lipase acts first. Did you see? Lipase bounced off the fats until bile had prepared them.
- predict_bile == "amylase":
    #speaker:intestine #mood:thinking
    At my gate you chose amylase. But amylase only works on starch: fats need bile, then lipase.
- else:
    #speaker:intestine #mood:thinking
    So, which helper acts first on fats?
}
#speaker:intestine #mood:thinking
Bile is not an enzyme: it emulsifies the fats, so lipase can cut them into glycerol and fatty acids.
#speaker:leader #mood:surprised
And the proteins and the sugars were cut twice!
#speaker:intestine #mood:happy
Yes. Trypsin and peptidase finish the proteins into amino acids. Amylase and maltase finish the starch into glucose. Water, mineral salts and vitamins needed no digestion at all.
#speaker:buddy #mood:thinking
And the fibre?
#speaker:intestine #mood:happy
We have no enzyme for cellulose. It is not digested and not absorbed, but it helps the food move along.
#speaker:intestine #mood:cheering
Then my villi absorbed the small nutrients: into the blood, and the fats into the lymph first. Food has become nutrients for the whole body!
#discovery:bile #discovery:intestinal_fats #discovery:intestinal_protein #discovery:intestinal_carbs #discovery:ready_nutrients #discovery:absorption
#speaker:fox #mood:cheering
Yip! Yip!
#speaker:intestine #mood:happy
Now, let's see how much you remember!
-> END
