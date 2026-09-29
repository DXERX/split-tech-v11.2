import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Lock, FileText, Scale } from 'lucide-react'

export default function Terms() {
  return (
    <div className="min-h-screen bg-white font-arabic" dir="rtl">
      {/* Header */}
      <header className="bg-brand-700 text-white py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-right">
          <Link to="/" className="inline-flex items-center gap-2 text-brand-200 hover:text-white text-sm mb-6 transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            العودة للرئيسية
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">الشروط والأحكام وسياسة الخصوصية</h1>
              <p className="text-brand-200 text-sm mt-1">آخر تحديث: يناير 2026</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12 text-slate-700 leading-relaxed text-right">

        {/* Company Info Card */}
        <section className="bg-brand-50 rounded-2xl p-6 border border-brand-100 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="font-bold text-brand-800 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              معلومات المنشأة
            </h2>
            <ul className="text-sm text-brand-700 space-y-2 grid grid-cols-1 md:grid-cols-2">
              <li><strong>الاسم:</strong> سبلت تيك AI</li>
              <li><strong>السجل التجاري:</strong> 7053975251</li>
              <li><strong>المقر:</strong> جدة، المملكة العربية السعودية</li>
              <li><strong>البريد الإلكتروني:</strong> info@splittech.sa</li>
            </ul>
          </div>
          <div className="absolute left-[-20px] top-[-20px] opacity-5 text-brand-900">
             <Shield className="w-32 h-32" />
          </div>
        </section>

        {/* Section 1: Terms of Use */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-2 border-b-2 border-brand-100 flex items-center gap-2">
            <Scale className="w-6 h-6 text-brand-600" />
            أولاً: شروط الاستخدام
          </h2>
          <div className="space-y-6 text-base">
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">1. القبول بالشروط</h3>
              <p>باستخدامك لمنصة ذكاء سبلت، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي جزء من هذه الشروط، يرجى التوقف عن استخدام الخدمة فوراً.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">2. وصف الخدمة</h3>
              <p>منصة ذكاء سبلت هي خدمة تدقيق تشغيلي مدعومة بالذكاء الاصطناعي تتيح للمنشآت التجارية مراقبة متاجرها عبر نظام كاميرات متصل ببرنامج محلي (Engine) مثبّت في المتجر، ومرتبط بالمنصة السحابية.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">3. الاشتراك والترخيص</h3>
              <p>تتوفر الخدمة بنظام اشتراك شهري أو سنوي قابل للتجديد. يتم تفعيل الترخيص عند موافقة الإدارة ويلغى تلقائياً عند انتهاء فترة الاشتراك. الترخيص شخصي وغير قابل للتحويل لطرف ثالث.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">4. سياسة الاسترداد (Refund Policy)</h3>
              <p className="bg-amber-50 p-3 rounded-lg border-r-4 border-amber-400">نظراً لطبيعة الخدمة الرقمية، يتم استرداد المبالغ في حال عدم تفعيل الخدمة تقنياً من طرفنا خلال 48 ساعة من الاشتراك، ولا يتم الاسترداد بعد بدء استخدام الخدمة الفعلي أو تفعيل الترخيص.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">5. التزامات المشترك</h3>
              <ul className="list-disc list-inside space-y-2 text-slate-600 pr-4">
                <li>توفير معلومات صحيحة ودقيقة عند التسجيل.</li>
                <li>عدم مشاركة بيانات الدخول أو مفاتيح API مع أطراف أخرى.</li>
                <li>الالتزام بأنظمة المملكة العربية السعودية المتعلقة بالخصوصية والمراقبة.</li>
                <li>إبلاغ الإدارة فوراً عند الاشتباه في أي اختراق أمني.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 2: Privacy Policy */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-6 pb-2 border-b-2 border-brand-100 flex items-center gap-2">
            <Lock className="w-6 h-6 text-brand-600" />
            ثانياً: سياسة الخصوصية
          </h2>
          <div className="space-y-6 text-base">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2 text-brand-700">1. معالجة البيانات والذكاء الاصطناعي</h3>
              <p className="font-medium">المنصة تقوم بتحليل المؤشرات الحيوية والأنماط السلوكية لحظياً (Real-time Analysis) لغرض الإحصاء والتدقيق التشغيلي فقط، ولا يتم تخزين الصور الشخصية أو ملامح الوجوه في قواعد بياناتنا بشكل دائم، مما يضمن خصوصية الأفراد المطلقة.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">2. البيانات التي نجمعها</h3>
              <ul className="list-disc list-inside space-y-2 text-slate-600 pr-4">
                <li>بيانات التسجيل: الاسم، البريد الإلكتروني، اسم الشركة، رقم الجوال.</li>
                <li>بيانات المتجر: عنوان رابط كاميرات RTSP، أوقات العمل، والأسئلة المخصصة.</li>
                <li>بيانات الجهاز: البصمة الرقمية للجهاز (machine fingerprint) لضمان أمن التراخيص.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">3. تخزين البيانات وسيادتها</h3>
              <p>تلتزم سبلت تيك AI بسيادة البيانات الوطنية؛ حيث تُخزّن جميع البيانات على خوادم داخل المملكة العربية السعودية <strong>(Google Cloud Dammam - me-central2)</strong>.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2 underline decoration-brand-200 underline-offset-4">4. أمان البيانات</h3>
              <p>نطبق تشفير <strong>TLS</strong> لجميع البيانات المنقولة، وتشفير <strong>AES-256</strong> للبيانات المخزّنة، مع سياسات وصول صارمة (RLS) تمنع أي تداخل بين بيانات المشتركين.</p>
            </div>
          </div>
        </section>

        {/* Contact info */}
        <section className="bg-slate-900 rounded-3xl p-8 text-white text-center">
          <h2 className="text-xl font-bold mb-4">هل لديك استفسار قانوني أو تقني؟</h2>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">فريق الامتثال لدينا جاهز للرد على تساؤلاتكم بخصوص معالجة البيانات وشروط الخدمة.</p>
          <a href="mailto:info@splittech.sa" className="inline-block bg-brand-500 hover:bg-brand-600 text-white px-8 py-3 rounded-full font-bold transition-transform hover:scale-105">
            تواصل معنا عبر البريد
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-100 text-center text-xs text-slate-400">
        <p>© 2026 سبلت تيك AI — السجل التجاري: 7053975251 — جدة، المملكة العربية السعودية</p>
      </footer>
    </div>
  )
}