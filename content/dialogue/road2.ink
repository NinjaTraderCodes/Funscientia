// The Road to the Mouth Gate, shot 2 (after the bend): the fox's discovery and the Tooth Guardian.
// Speaker tags as in road.ink: leader, buddy, fox, tooth.

VAR leader = "walid"
VAR predict_saliva = ""
VAR met_tooth = false

=== arrival ===
#speaker:buddy #mood:surprised
Look how close the gate is now!
#speaker:leader #mood:cheering
And someone is waiting for us there!
-> END

=== fox_sniff ===
#speaker:fox #mood:happy
Sniff... sniff... YIP!
#speaker:buddy #mood:thinking
He found sweet-smelling bread flowers. Hey, my mouth is watering!
#speaker:leader #mood:surprised
Mine too! Why does that happen?
#speaker:buddy #mood:happy
When we smell food, our mouth makes saliva, to get ready for eating.
#discovery:saliva_smell
-> END

=== gate ===
{ met_tooth: -> gate_again }
~ met_tooth = true
#speaker:tooth #mood:happy
Welcome, explorers! I am the Guardian of the Mouth Gate.
#speaker:tooth #mood:thinking
Inside, food is prepared for its long journey. Teeth, tongue and saliva all work together.
#speaker:leader #mood:thinking
Why do we need teeth AND saliva? Isn't one enough?
#speaker:tooth #mood:happy
That is exactly what you will discover! But first, a prediction.
#speaker:tooth #mood:thinking
What do you think saliva does to a piece of bread?
* [It just makes it wet.]
    ~ predict_saliva = "wet"
* [It starts turning it into sugar.]
    ~ predict_saliva = "sugar"
* [Nothing at all.]
    ~ predict_saliva = "nothing"
- #speaker:tooth #mood:happy
Interesting! Remember your answer. You will test it inside.
#speaker:buddy #mood:cheering
Let's go in!
#action:enter_mouth
-> END

=== gate_again ===
#speaker:tooth #mood:happy
Ready to enter the Mouth, explorers?
* [Yes, let's go!]
    #action:enter_mouth
    -> END
* [Not yet.]
    #speaker:tooth #mood:happy
    Take your time. The gate will wait for you.
    -> END
