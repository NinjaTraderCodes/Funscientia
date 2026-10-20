// The Road to the Mouth Gate — dialogue for the first world stretch.
//
// Speaker tags (#speaker:...) are resolved by the game:
//   leader = the hero the child chose (Walid or Nesma), buddy = the other kid,
//   fox, tooth (the Tooth guardian of the Mouth Gate).
// Mood tags (#mood:...) pick the portrait: happy, surprised, thinking, cheering.
//
// The game sets `leader` before the first line ("walid" or "nesma").

VAR leader = "walid"
VAR predict_saliva = ""
VAR met_tooth = false

=== arrival ===
#speaker:leader #mood:surprised
Look! The Digestive Kingdom!
#speaker:buddy #mood:thinking
Every bite of food we eat starts its journey right there.
#speaker:fox #mood:happy
Yip! Yip!
#speaker:buddy #mood:happy
He smells something. Let's follow the road to that gate!
-> END

=== signpost ===
#speaker:leader #mood:thinking
"Food's Great Journey: Mouth, then Stomach, then Intestines."
#speaker:buddy #mood:surprised
So the mouth is the very first stop. That's where digestion begins!
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
