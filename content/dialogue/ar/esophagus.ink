// نزولًا في المريء: من الفم إلى بوابة المعدة (النسخة العربية من content/dialogue/esophagus.ink).
// نفس العُقد ونفس الوسوم ونفس الاختيارات. [player] = اسم اللاعب.

VAR leader = "walid"
VAR predict_pepsin = ""

=== arrival ===
#speaker:leader #mood:surprised
واو! انزلقنا خلف لُقمتنا مباشرة!
#speaker:buddy #mood:thinking
هذا النفق هو المريء. إنه ينقل الطعام من الفم نزولًا إلى المعدة.
#speaker:fox #mood:surprised
يِب؟!
#speaker:buddy #mood:happy
هل شعرتم بهذه الموجة؟ الجدران تنقبض خلف الطعام وتدفعه إلى الأسفل. هذا يُسمّى الحركة الدودية!
#speaker:leader #mood:cheering
هيّا نتبع لُقمتنا إلى بوابة المعدة!
-> END

=== mucus ===
#speaker:leader #mood:thinking
كل شيء هنا زَلِق جدًّا...
#speaker:buddy #mood:happy
إنه المخاط. يغطّي الجدران فينزلق الطعام بسهولة دون أن يخدشها.
#discovery:mucus_slide
#speaker:fox #mood:happy
يِب! ويييي!
-> END

=== upside ===
#speaker:buddy #mood:thinking
يا [player]، هل تظن أننا نستطيع البلع ونحن واقفون على رؤوسنا؟
* [نعم، أظن ذلك.]
* [لا، سيعود الطعام إلى الأعلى!]
- #speaker:leader #mood:surprised
نستطيع! العضلات تدفع الطعام إلى الأسفل بموجات، حتى لو كنّا مقلوبين. ولهذا يستطيع روّاد الفضاء أن يأكلوا في الفضاء!
#discovery:peristalsis
-> END

=== gate ===
#speaker:stomach #mood:happy
مرحبًا أيها المستكشفون! أنا حارس بوابة المعدة.
#speaker:stomach #mood:thinking
هل ترون كيف تنفتح بوابتي فقط عندما يصل الطعام، ثم تنغلق بإحكام؟ هكذا لا تعود حموضة المعدة إلى الأعلى.
#speaker:leader #mood:surprised
إذن عندما يشعر بعض الناس بحرقة في صدورهم... حرقة المعدة... فهذا حمض يتسلّل إلى الأعلى؟
#speaker:stomach #mood:happy
بالضبط! بوابتي حلقة من العضلات تُسمّى العاصِرة.
#discovery:sphincter
#speaker:stomach #mood:thinking
في الداخل، تقلّب جدراني القوية الطعام، ويقوم إنزيم اسمه البِبْسين بتفكيكه. والآن سؤالي: أيّ غذاء تظن أن البِبْسين يفكّكه؟
* [البروتين.]
    ~ predict_pepsin = "protein"
* [النشاء.]
    ~ predict_pepsin = "starch"
* [الدسم.]
    ~ predict_pepsin = "fat"
* [الثلاثة معًا!]
    ~ predict_pepsin = "all"
- #speaker:stomach #mood:surprised
مثير للاهتمام! تذكّر إجابتك، ففي الداخل ستكتشف الحقيقة.
-> ready

= ready
#speaker:stomach #mood:happy
هل أنتم مستعدون لدخول المعدة؟
* [نعم، هيّا بنا!]
    #action:enter
    -> END
* [ليس بعد.]
    #speaker:stomach #mood:happy
    خذوا وقتكم. بوابتي تنفتح مع الموجة القادمة.
    -> END
