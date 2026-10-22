// لعبة المعدة (النسخة العربية من content/dialogue/stomach.ink): نفس العُقد ونفس الوسوم.
// [player] = اسم اللاعب. اللعبة تضبط predict_pepsin (إجابة بوابة المعدة) قبل `explain`.

VAR leader = "walid"
VAR predict_pepsin = ""

=== intro ===
#speaker:stomach #mood:happy
مرحبًا بك في مملكتي يا [player]! لقد وصلت لُقمتك للتوّ.
#speaker:stomach #mood:thinking
يبقى الطعام عندي بضع ساعات. وفي هذا الوقت أقوم بثلاث مهامّ: أقلّبه، وأجعله حمضيًّا، ويقطّع إنزيمي الببسين بروتيناته.
#speaker:buddy #mood:surprised
إذن المعدة خلّاط ومختبر كيمياء في الوقت نفسه؟
#speaker:fox #mood:happy
يِب!
#speaker:stomach #mood:cheering
بالضبط! هيّا نهضم هذه الوجبة معًا.
-> END

=== explain ===
{
- predict_pepsin == "protein":
    #speaker:stomach #mood:cheering
    عند بوابتي توقّعت أن الببسين يقطّع البروتينات. وكنت على حقّ!
- predict_pepsin == "starch":
    #speaker:stomach #mood:thinking
    عند بوابتي ظننت أن الببسين يقطّع النشاء. هل رأيت؟ ارتدّ مقصّي عن السلاسل البنفسجية.
- predict_pepsin == "fat":
    #speaker:stomach #mood:thinking
    عند بوابتي ظننت أن الببسين يقطّع الدسم. لكن جزيئات الدسم الصفراء مرّت دون أيّ خدش.
- predict_pepsin == "all":
    #speaker:stomach #mood:surprised
    عند بوابتي قلت إن الببسين يقطّع الثلاثة. مفاجأة: الببسين انتقائي جدًّا!
- else:
    #speaker:stomach #mood:thinking
    إذن، أيّ غذاء يقطّعه الببسين حقًّا؟
}
#speaker:stomach #mood:thinking
الببسين لا يقطّع إلا البروتينات. فهو يكسّر السلاسل الطويلة إلى قطع أقصر تُسمّى الببتيدات. وهذا جزء من العمل فقط: ستُكمله الأمعاء الدقيقة.
#speaker:leader #mood:surprised
ولم يعمل إلا عندما كانت الحموضة مناسبة!
#speaker:stomach #mood:happy
نعم. يحتوي عصيري المعدي على حمض كلور الماء. فهو يجعلني حمضية جدًّا، في حدود pH 2. والببسين يحتاج إلى ذلك ليعمل، كما يوقف الحمض كثيرًا من الجراثيم.
#speaker:buddy #mood:thinking
وماذا عن النشاء والدسم؟
#speaker:stomach #mood:happy
يغادرانني دون تغيير. حتى أميلاز اللعاب يتوقّف عن العمل في حمضي. فكلّ إنزيم يعمل على نوع واحد من الغذاء فقط.
#speaker:stomach #mood:cheering
بعد التقليب والخلط بالعصير المعدي والهضم الجزئي، صار طعامك كيموسًا. وقد سمح بوّابي بخروجه قليلًا قليلًا.
#discovery:stomach_churn #discovery:stomach_acid #discovery:pepsin_protein #discovery:enzyme_specific #discovery:chyme
#speaker:fox #mood:cheering
يِب! يِب!
#speaker:stomach #mood:happy
كيموسك في طريقه إلى الأمعاء الدقيقة... مغامرتك القادمة!
-> END
