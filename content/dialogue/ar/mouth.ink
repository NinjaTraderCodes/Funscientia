// لعبة الفم (النسخة العربية من content/dialogue/mouth.ink): نفس العُقد ونفس الوسوم.
// [player] = اسم اللاعب. اللعبة تضبط predict_saliva (إجابة بوابة الفم) قبل `explain`.

VAR leader = "walid"
VAR predict_saliva = ""

=== intro ===
#speaker:tooth #mood:happy
مرحبًا بك داخل الفم يا [player]! كلّ وجبة تبدأ رحلتها من هنا.
#speaker:tooth #mood:thinking
مهمّتك: تحضير هذا الطعام للبلع. ثلاث مهامّ، واحدة تلو الأخرى، تمامًا مثل فمٍ حقيقي.
#speaker:buddy #mood:surprised
مهلًا... هل صرنا نحن الفم الآن؟
#speaker:fox #mood:happy
يِب!
-> END

=== swallow_fact ===
#speaker:tooth #mood:surprised
غُلوب! بلعٌ مثالي!
#speaker:tooth #mood:thinking
هل رأيت القطرة الصغيرة المتدلّية فوق الحلق؟ إنها اللَّهاة. عندما تبلع، تُغلق الطريق إلى أنفك، فلا يذهب الطعام في الاتجاه الخطأ.
#speaker:buddy #mood:happy
إذن هذا هو دورها!
-> END

=== explain ===
{
- predict_saliva == "sugar":
    #speaker:tooth #mood:happy
    عند البوابة توقّعت أن اللعاب يبدأ بتحويل الخبز إلى سكر. وكنت على حقّ!
- predict_saliva == "wet":
    #speaker:tooth #mood:thinking
    عند البوابة قلت إن اللعاب يبلّل الخبز فقط. هو يفعل ذلك، ويفعل شيئًا أكثر إدهاشًا أيضًا.
- predict_saliva == "nothing":
    #speaker:tooth #mood:surprised
    عند البوابة ظننت أن اللعاب لا يفعل شيئًا. مفاجأة: إنه من أنشط العاملين في الفم!
- else:
    #speaker:tooth #mood:thinking
    والآن، ماذا يفعل اللعاب حقًّا بالخبز؟
}
#speaker:tooth #mood:thinking
يحتوي اللعاب على إنزيم اسمه الأميلاز. يبدأ بتفكيك النشاء، وهو الجزيئات الكبيرة في الخبز، إلى سكر.
#speaker:leader #mood:surprised
إذن لهذا يصير طعم الخبز حلوًا عندما نمضغه طويلًا!
#speaker:tooth #mood:happy
بالضبط. أسنانك فتّتت الطعام، ولسانك خلطه، ولعابك ليّنه وبدأ بهضمه. ومعًا صنعوا كرة طريّة: اللُّقمة.
#discovery:teeth_chew #discovery:tongue_mix #discovery:saliva_amylase #discovery:bolus_swallow
#speaker:fox #mood:cheering
يِب! يِب!
#speaker:tooth #mood:happy
لُقمتك في طريقها نزولًا عبر المريء... إلى مملكة المعدة!
-> END
