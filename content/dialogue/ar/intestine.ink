// لعبة المعي الدقيق (النسخة العربية من content/dialogue/intestine.ink): نفس العُقد ونفس الوسوم.
// [player] = اسم اللاعب. اللعبة تضبط predict_bile (إجابة بوابة المعي الدقيق) قبل `explain`.

VAR leader = "walid"
VAR predict_bile = ""

=== intro ===
#speaker:intestine #mood:happy
تفضّل يا [player]! لقد وصل كيموسك للتوّ من المعدة.
#speaker:intestine #mood:thinking
هنا يكتمل الهضم. انظر إلى الأعلى: القناة الخضراء تجلب الصفراء من المرارة، والقناة البرتقالية تجلب عصارة البنكرياس، وجداري أنا يصنع عصارة أيضًا.
#speaker:buddy #mood:surprised
إذن المساعدون يأتون من ثلاثة أماكن مختلفة؟
#speaker:intestine #mood:happy
بالضبط. انقر على فتحة لتأخذ مساعدها، ثم استعمله على الطعام. وعندما يصير كلّ شيء صغيرًا بما يكفي... ستمتصّه زغاباتي!
#speaker:fox #mood:happy
يِب!
-> END

=== explain ===
{
- predict_bile == "bile":
    #speaker:intestine #mood:cheering
    عند بوابتي توقّعت أن الصفراء تعمل أوّلًا على الدسم. وكنت على حقّ!
- predict_bile == "lipase":
    #speaker:intestine #mood:thinking
    عند بوابتي ظننت أن الليباز يعمل أوّلًا. هل رأيت؟ ارتدّ الليباز عن الدسم حتى هيّأته الصفراء.
- predict_bile == "amylase":
    #speaker:intestine #mood:thinking
    عند بوابتي اخترت الأميلاز. لكنّ الأميلاز لا يعمل إلا على النشاء: الدسم يحتاج إلى الصفراء، ثم الليباز.
- else:
    #speaker:intestine #mood:thinking
    إذن، أيّ مساعد يعمل أوّلًا على الدسم؟
}
#speaker:intestine #mood:thinking
الصفراء ليست إنزيمًا: إنها تستحلب الدسم، فيستطيع الليباز أن يقطّعه إلى غليسرول وأحماض دسمة.
#speaker:leader #mood:surprised
والبروتينات والسكّريات قُطّعت مرّتين!
#speaker:intestine #mood:happy
نعم. التريبسين والبيبتيداز يُكملان البروتينات إلى أحماض أمينية. والأميلاز والمالتاز يُكملان النشاء إلى غلوكوز. أمّا الماء والأملاح المعدنية والفيتامينات فلم تحتج إلى هضم أبدًا.
#speaker:buddy #mood:thinking
وماذا عن الألياف؟
#speaker:intestine #mood:happy
ليس لدينا إنزيم للسليلوز. فهو لا يُهضم ولا يُمتصّ، لكنه يساعد الطعام على التقدّم.
#speaker:intestine #mood:cheering
ثم امتصّت زغاباتي المغذّيات الصغيرة: إلى الدم، والدسم إلى اللمف أوّلًا. صار الطعام مغذّيات للجسم كلّه!
#discovery:bile #discovery:intestinal_fats #discovery:intestinal_protein #discovery:intestinal_carbs #discovery:ready_nutrients #discovery:absorption
#speaker:fox #mood:cheering
يِب! يِب!
#speaker:intestine #mood:happy
والآن، لنرَ كم تتذكّر!
-> END
