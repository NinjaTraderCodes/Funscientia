// The Stomach mini-game: the Stomach Guardian coaches, the friends chime in.
// Speaker tags as in road.ink: leader, buddy, fox, stomach. [player] = the player's own name.
// The game sets predict_pepsin (the answer given at the Stomach Gate) before `explain`.
// The Arabic version is content/dialogue/ar/stomach.ink (same knots, same tags, same choices).

VAR leader = "walid"
VAR predict_pepsin = ""

=== intro ===
#speaker:stomach #mood:happy
Welcome to my kingdom, [player]! Your bolus has just arrived.
#speaker:stomach #mood:thinking
Food stays with me for a few hours. In that time I do three jobs: I churn it, I make it acidic, and my enzyme pepsin cuts its proteins.
#speaker:buddy #mood:surprised
So the stomach is a mixer AND a chemistry lab?
#speaker:fox #mood:happy
Yip!
#speaker:stomach #mood:cheering
Exactly! Let's digest this meal together.
-> END

=== explain ===
{
- predict_pepsin == "protein":
    #speaker:stomach #mood:cheering
    At my gate you predicted that pepsin cuts proteins. You were right!
- predict_pepsin == "starch":
    #speaker:stomach #mood:thinking
    At my gate you thought pepsin cuts starch. Did you see? My scissors bounced right off the purple chains.
- predict_pepsin == "fat":
    #speaker:stomach #mood:thinking
    At my gate you thought pepsin cuts fat. But the yellow fat molecules came through without a scratch.
- predict_pepsin == "all":
    #speaker:stomach #mood:surprised
    At my gate you said pepsin cuts all three. Surprise: pepsin is very picky!
- else:
    #speaker:stomach #mood:thinking
    So, which food does pepsin really cut?
}
#speaker:stomach #mood:thinking
Pepsin only cuts proteins. It breaks the long chains into shorter pieces called peptides. That is only part of the job: the small intestine will finish it.
#speaker:leader #mood:surprised
And it only worked when the acid was right!
#speaker:stomach #mood:happy
Yes. My gastric juice contains hydrochloric acid. It makes me very acidic, about pH 2. Pepsin needs that to work, and the acid also stops many germs.
#speaker:buddy #mood:thinking
What about the starch and the fat?
#speaker:stomach #mood:happy
They leave me unchanged. Even the amylase from saliva stops working in my acid. Each enzyme works on one kind of food only.
#speaker:stomach #mood:cheering
Churned, mixed with gastric juice and partly digested, your food has become chyme. My pylorus let it out a little at a time.
#discovery:stomach_churn #discovery:stomach_acid #discovery:pepsin_protein #discovery:enzyme_specific #discovery:chyme
#speaker:fox #mood:cheering
Yip! Yip!
#speaker:stomach #mood:happy
Your chyme is on its way to the small intestine... your next adventure!
-> END
