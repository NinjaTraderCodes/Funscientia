// The Mouth mini-game: the Tooth Guardian coaches, the friends chime in.
// Speaker tags as in road.ink: leader, buddy, fox, tooth. [player] = the player's own name.
// The game sets predict_saliva (the answer given at the Mouth Gate) before `explain`.

VAR leader = "walid"
VAR predict_saliva = ""

=== intro ===
#speaker:tooth #mood:happy
Welcome inside the Mouth, [player]! Every meal starts its journey right here.
#speaker:tooth #mood:thinking
Your mission: get this food ready to swallow. Three jobs, one at a time - just like a real mouth.
#speaker:buddy #mood:surprised
Wait... WE are the mouth now?
#speaker:fox #mood:happy
Yip!
-> END

=== swallow_fact ===
#speaker:tooth #mood:surprised
GLOOP! A perfect swallow!
#speaker:tooth #mood:thinking
Did you see the little drop hanging above the throat? That's the uvula. When you swallow, it closes the way to your nose, so food can't go the wrong way.
#speaker:buddy #mood:happy
So that's what it's for!
-> END

=== explain ===
{
- predict_saliva == "sugar":
    #speaker:tooth #mood:happy
    At the gate you predicted that saliva starts turning bread into sugar. You were right!
- predict_saliva == "wet":
    #speaker:tooth #mood:thinking
    At the gate you said saliva just makes the bread wet. It does - and it does something even more surprising.
- predict_saliva == "nothing":
    #speaker:tooth #mood:surprised
    At the gate you thought saliva does nothing at all. Surprise - it is one of the mouth's hardest workers!
- else:
    #speaker:tooth #mood:thinking
    Now, what does saliva really do to bread?
}
#speaker:tooth #mood:thinking
Saliva has an enzyme called amylase. It starts breaking down starch - the big molecules in bread - into sugar.
#speaker:leader #mood:surprised
So that's why bread tastes sweet when we chew it for a long time!
#speaker:tooth #mood:happy
Exactly. Your teeth broke the food, your tongue mixed it, and your saliva softened it and began to digest it. Together they made a soft ball: the bolus.
#discovery:teeth_chew #discovery:tongue_mix #discovery:saliva_amylase #discovery:bolus_swallow
#speaker:fox #mood:cheering
Yip! Yip!
#speaker:tooth #mood:happy
Your bolus is on its way down the esophagus... to the Stomach Kingdom!
-> END
