// Down the Esophagus: from the Mouth to the Stomach Gate.
// Speaker tags as in road.ink, plus stomach (the Stomach Guardian). [player] = the player's name.
// The Arabic version is content/dialogue/ar/esophagus.ink (same knots, same tags, same choices).

VAR leader = "walid"
VAR predict_pepsin = ""

=== arrival ===
#speaker:leader #mood:surprised
Whoa! We slid right down after our bolus!
#speaker:buddy #mood:thinking
This tunnel is the esophagus. It carries food from the mouth down to the stomach.
#speaker:fox #mood:surprised
Yip?!
#speaker:buddy #mood:happy
Feel that wave? The walls squeeze behind the food and push it down. It's called peristalsis!
#speaker:leader #mood:cheering
Let's follow our bolus to the Stomach Gate!
-> END

=== mucus ===
#speaker:leader #mood:thinking
Everything here is so slippery...
#speaker:buddy #mood:happy
That's mucus. It coats the walls, so food slides down easily without scratching them.
#discovery:mucus_slide
#speaker:fox #mood:happy
Yip! Wheee!
-> END

=== upside ===
#speaker:buddy #mood:thinking
[player], do you think we could still swallow if we were standing on our heads?
* [Yes, I think so.]
* [No, food would fall back up!]
- #speaker:leader #mood:surprised
We could! The muscles push the food down in waves, even upside down. That's how astronauts can eat in space!
#discovery:peristalsis
-> END

=== gate ===
#speaker:stomach #mood:happy
Welcome, explorers! I am the Guardian of the Stomach Gate.
#speaker:stomach #mood:thinking
See how my gate opens only when food arrives, then closes tight? That keeps the stomach's acid from coming back up.
#speaker:leader #mood:surprised
So when people feel a burning in their chest... heartburn... that's acid sneaking up?
#speaker:stomach #mood:happy
Exactly! My gate is a ring of muscle called a sphincter.
#discovery:sphincter
#speaker:stomach #mood:thinking
Inside, my strong walls churn the food, and an enzyme called pepsin cuts it apart. So, here is my question: which food do you think pepsin cuts?
* [Protein.]
    ~ predict_pepsin = "protein"
* [Starch.]
    ~ predict_pepsin = "starch"
* [Fat.]
    ~ predict_pepsin = "fat"
* [All three!]
    ~ predict_pepsin = "all"
- #speaker:stomach #mood:surprised
Interesting! Remember your answer - inside, you will find out.
-> ready

= ready
#speaker:stomach #mood:happy
Ready to enter the Stomach?
* [Yes, let's go!]
    #action:enter
    -> END
* [Not yet.]
    #speaker:stomach #mood:happy
    Take your time. My gate opens with the next wave.
    -> END
