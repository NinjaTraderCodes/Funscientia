// The Road to the Mouth Gate, shot 1 (from the overlook trail to the bend).
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
