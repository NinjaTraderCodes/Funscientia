// الطريق إلى بوابة الفم، اللقطة الثانية (النسخة العربية من content/dialogue/road2.ink).
// نفس العُقد ونفس الوسوم ونفس الاختيارات.

VAR leader = "walid"
VAR predict_saliva = ""
VAR met_tooth = false

=== arrival ===
#speaker:buddy #mood:surprised
انظروا كم صارت البوابة قريبة!
#speaker:leader #mood:cheering
وهناك من ينتظرنا عندها!
-> END

=== fox_sniff ===
#speaker:fox #mood:happy
شمّ... شمّ... يِب!
#speaker:buddy #mood:thinking
لقد وجد أزهار خبزٍ رائحتها شهيّة. أوه، لقد سال لعابي!
#speaker:leader #mood:surprised
وأنا أيضًا! لماذا يحدث ذلك؟
#speaker:buddy #mood:happy
عندما نشمّ الطعام، يُفرز فمنا اللعاب استعدادًا للأكل.
#discovery:saliva_smell
-> END

=== gate ===
{ met_tooth: -> gate_again }
~ met_tooth = true
#speaker:tooth #mood:happy
مرحبًا أيها المستكشفون! أنا حارس بوابة الفم.
#speaker:tooth #mood:thinking
في الداخل، يُحضَّر الطعام لرحلته الطويلة. الأسنان واللسان واللعاب يعملون كلّهم معًا.
#speaker:leader #mood:thinking
لماذا نحتاج إلى الأسنان واللعاب معًا؟ ألا يكفي أحدهما؟
#speaker:tooth #mood:happy
هذا بالضبط ما ستكتشفونه! لكن أولًا، توقُّع.
#speaker:tooth #mood:thinking
ماذا تظنّ أن اللعاب يفعل بقطعة خبز؟
* [يبلّلها فقط.]
    ~ predict_saliva = "wet"
* [يبدأ بتحويلها إلى سكر.]
    ~ predict_saliva = "sugar"
* [لا شيء أبدًا.]
    ~ predict_saliva = "nothing"
- #speaker:tooth #mood:happy
مثير للاهتمام! تذكّر إجابتك، فستختبرها في الداخل.
#speaker:buddy #mood:cheering
هيّا ندخل!
#action:enter_mouth
-> END

=== gate_again ===
#speaker:tooth #mood:happy
هل أنتم مستعدون لدخول الفم أيها المستكشفون؟
* [نعم، هيّا بنا!]
    #action:enter_mouth
    -> END
* [ليس بعد.]
    #speaker:tooth #mood:happy
    خذوا وقتكم. البوابة ستنتظركم.
    -> END
