// ملتقى المساعدين (النسخة العربية من content/dialogue/intestine-gate.ink): نفس العُقد ونفس الوسوم ونفس الاختيارات.

VAR leader = "walid"
VAR predict_bile = ""

=== arrival ===
#speaker:leader #mood:surprised
انظروا إلى الفتحتين بجانب البوابة!
#speaker:buddy #mood:thinking
تُدخلان المساعدين إلى أول جزء من المعي الدقيق: الاثنا عشر.
#speaker:fox #mood:happy
يِب! يبقى الطعام على هذا الطريق، ويأتي المساعدون إلينا!
#speaker:leader #mood:happy
لنكتشف من أين يأتون قبل الدخول.
-> END

=== helpers ===
#speaker:leader #mood:thinking
ماذا يصل عبر الفتحة الخضراء؟
#speaker:buddy #mood:happy
الصفراء. ينتجها الكبد، وتخزّنها المرارة ثم تطلقها إلى المعي الدقيق.
#speaker:buddy #mood:thinking
وتجلب القناة الأخرى العصارة البنكرياسية. تساعد إنزيماتها على هضم البروتينات والدسم والنشاء المتبقي.
#speaker:leader #mood:surprised
إذًا لن نسير داخل المرارة أو البنكرياس. تلتقي عصاراتهما بالطعام هنا!
#discovery:bile
-> END

=== gate ===
#speaker:intestine #mood:happy
مرحبًا أيها المستكشفون! أنا حارس المعي الدقيق.
#speaker:intestine #mood:thinking
خلفي الاثنا عشر، أوّل جزء من المعي الدقيق. هنا يلتقي الكيموس القادم من المعدة بالصفراء والعصارة البنكرياسية.
#speaker:leader #mood:surprised
وبعد ذلك، إلى أين يذهب الطعام؟
#speaker:intestine #mood:happy
يسير في أنبوبي الطويل المطويّ. إنه طويل جدًّا، لذلك يلتفّ داخل البطن!
#speaker:intestine #mood:thinking
والآن، إليك سؤالي. تصل جزيئة دسم: أيّ مساعد يجب أن يعمل عليها أوّلًا؟
* [الصفراء.]
    ~ predict_bile = "bile"
* [مقص الليباز الأصفر.]
    ~ predict_bile = "lipase"
* [مقص الأميلاز البنفسجي.]
    ~ predict_bile = "amylase"
- #speaker:intestine #mood:surprised
مثير للاهتمام! تذكّر إجابتك، ففي الداخل ستكتشف الجواب.
-> ready

= ready
#speaker:intestine #mood:happy
هل أنت مستعدّ لدخول المعي الدقيق؟
* [نعم، هيّا بنا!]
    #action:enter
    -> END
* [ليس بعد.]
    #speaker:intestine #mood:happy
    خذ وقتك. مساعديّ جاهزون دائمًا.
    -> END
