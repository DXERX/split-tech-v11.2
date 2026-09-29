/**
 * Compare.tsx — سبلت تيك مقابل المراقبة التقليدية
 * SEO-optimised comparison page targeting كاميرات مراقبة / نظام مراقبة متاجر keywords
 */
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  CheckCircle2, XCircle, ArrowLeft, Zap, Shield, Camera,
  Clock, TrendingUp, Brain, AlertTriangle, Star, ChevronRight,
} from 'lucide-react'
import SplitLogo from '../components/ui/SplitLogo'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'
import { useLanguage } from '../contexts/LanguageContext'

const ease = [0.22, 1, 0.36, 1]

function Reveal({
  children, delay = 0, className = '',
}: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-30px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── Comparison data ─────────────────────────────────────────────────────────
interface CompareRow {
  feature: string
  featureEn: string
  splittech: string
  traditional: string
  winner: 'splittech' | 'tie'
}

const rows: CompareRow[] = [
  {
    feature: 'التحليل التلقائي',
    featureEn: 'Automated Analysis',
    splittech: 'ذكاء اصطناعي يحلل الصورة ويصدر التقرير خلال ثوانٍ',
    traditional: 'يتطلب مراقباً بشرياً يشاهد الشاشة باستمرار',
    winner: 'splittech',
  },
  {
    feature: 'سرعة التقرير',
    featureEn: 'Report Speed',
    splittech: 'أقل من 30 ثانية من التقاط الصورة حتى التقرير',
    traditional: 'ساعات أو أيام إذا تطلّب مراجعة يدوية',
    winner: 'splittech',
  },
  {
    feature: 'الموضوعية',
    featureEn: 'Objectivity',
    splittech: 'لا تحيّز — نفس المعيار على جميع الفروع',
    traditional: 'متغيرة حسب المراقب والإجهاد',
    winner: 'splittech',
  },
  {
    feature: 'مقارنة الفروع',
    featureEn: 'Branch Comparison',
    splittech: 'لوحة تحكم موحدة تقارن جميع الفروع لحظياً',
    traditional: 'تقارير منفصلة يجمعها موظف يدوياً',
    winner: 'splittech',
  },
  {
    feature: 'سيادة البيانات',
    featureEn: 'Data Sovereignty',
    splittech: '100% داخل المملكة العربية السعودية (Google Cloud me-central2)',
    traditional: 'قد تُخزَّن في خوادم خارج المملكة',
    winner: 'splittech',
  },
  {
    feature: 'التكامل',
    featureEn: 'Integrations',
    splittech: 'Webhook مع POS / ERP / واتساب / ديسكورد',
    traditional: 'لا يوجد تكامل رقمي بشكل افتراضي',
    winner: 'splittech',
  },
  {
    feature: 'التكلفة التشغيلية',
    featureEn: 'Operational Cost',
    splittech: 'اشتراك شهري ثابت — لا رواتب مراقبين',
    traditional: 'رواتب + تدريب + إدارة للمراقبين',
    winner: 'splittech',
  },
  {
    feature: 'التوسّع',
    featureEn: 'Scalability',
    splittech: 'أضف فروعاً بنقرة واحدة بدون تكاليف إضافية',
    traditional: 'كل فرع جديد يعني مراقباً إضافياً',
    winner: 'splittech',
  },
  {
    feature: 'الكاميرات المطلوبة',
    featureEn: 'Camera Requirement',
    splittech: 'تعمل مع كاميرات RTSP الموجودة مسبقاً',
    traditional: 'يعمل مع أي نظام كاميرات',
    winner: 'tie',
  },
  {
    feature: 'الدعم الفني',
    featureEn: 'Technical Support',
    splittech: 'دعم بالعربية والإنجليزية، استجابة سريعة',
    traditional: 'يعتمد على المورد',
    winner: 'splittech',
  },
]

// ─── Stats strip ─────────────────────────────────────────────────────────────
const stats = [
  { value: '87%', label: 'متوسط معدل الامتثال', labelEn: 'Avg compliance rate' },
  { value: '30ث', label: 'سرعة إصدار التقرير', labelEn: 'Report generation' },
  { value: '27+', label: 'موقع مطبّق', labelEn: 'Deployed locations' },
  { value: '4.9★', label: 'تقييم العملاء', labelEn: 'Customer rating' },
]

// ─── FAQ ─────────────────────────────────────────────────────────────────────
const faqs = [
  {
    q: 'هل أحتاج لتغيير كاميراتي الحالية؟',
    a: 'لا، سبلت تيك يتصل مباشرة بكاميرات RTSP الموجودة في متجرك. لا تحتاج لشراء أي أجهزة جديدة سوى Raspberry Pi الصغير الذي نوفّره.',
  },
  {
    q: 'كيف يختلف سبلت تيك عن نظام CCTV التقليدي؟',
    a: 'نظام CCTV التقليدي يسجّل فقط — سبلت تيك يفهم ويحلّل. يتعرّف الذكاء الاصطناعي على الالتزام بالزي، ترتيب الرفوف، الحضور، وجودة الخدمة، ثم يصدر تقريراً فورياً بدون تدخل بشري.',
  },
  {
    q: 'هل البيانات آمنة داخل المملكة؟',
    a: 'نعم، جميع البيانات مخزّنة على خوادم Google Cloud في منطقة me-central2 (الدمام) داخل المملكة العربية السعودية حصراً.',
  },
  {
    q: 'هل يمكن مراقبة أكثر من فرع؟',
    a: 'نعم، لوحة التحكم تعرض جميع فروعك في مكان واحد مع إمكانية مقارنة الأداء وترتيب الفروع حسب الالتزام.',
  },
]

// ─── Component ───────────────────────────────────────────────────────────────
export default function Compare() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'

  return (
    <div className="min-h-screen bg-[#070D18] text-white" dir={isAr ? 'rtl' : 'ltr'}>
      {/* ── SEO JSON-LD ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: isAr
              ? 'سبلت تيك مقابل المراقبة التقليدية — مقارنة شاملة'
              : 'SplitTech vs Traditional Monitoring — Full Comparison',
            url: 'https://splittech.sa/compare',
            description: isAr
              ? 'مقارنة شاملة بين سبلت تيك (نظام الرقابة التشغيلية بالذكاء الاصطناعي) وأنظمة المراقبة التقليدية للمتاجر والفروع في السعودية.'
              : 'Full comparison between SplitTech AI operational monitoring and traditional CCTV surveillance systems.',
            publisher: {
              '@type': 'Organization',
              name: 'سبلت تيك',
              url: 'https://splittech.sa',
            },
          }),
        }}
      />

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#070D18]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" aria-label="الرئيسية">
            <SplitLogo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
            <Link
              to="/signup"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#AECC1E] text-[#070D18] text-sm font-bold hover:bg-[#c8eb2c] transition-colors"
            >
              {isAr ? 'جرّب مجاناً' : 'Free Trial'}
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 text-center overflow-hidden">
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#AECC1E]/8 rounded-full blur-[80px]" />
        </div>

        <Reveal>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#AECC1E]/15 text-[#AECC1E] border border-[#AECC1E]/25 mb-5">
            <Brain size={12} />
            {isAr ? 'مقارنة شاملة' : 'Full Comparison'}
          </span>
        </Reveal>

        <Reveal delay={0.05}>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
            {isAr ? (
              <>
                سبلت تيك{' '}
                <span className="text-[#AECC1E]">مقابل</span>
                {' '}المراقبة التقليدية
              </>
            ) : (
              <>
                SplitTech{' '}
                <span className="text-[#AECC1E]">vs</span>
                {' '}Traditional Monitoring
              </>
            )}
          </h1>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="max-w-2xl mx-auto text-white/60 text-base sm:text-lg leading-relaxed">
            {isAr
              ? 'لماذا يتخلّى أصحاب المتاجر والفروع في السعودية عن كاميرات المراقبة التقليدية لصالح الذكاء الاصطناعي؟ هذه المقارنة تشرح الفرق بالأرقام والحقائق.'
              : 'Why Saudi store and branch owners are switching from traditional CCTV to AI-powered monitoring — a fact-based comparison.'}
          </p>
        </Reveal>
      </section>

      {/* ── Stats strip ── */}
      <section className="border-y border-white/8 bg-white/3 py-8 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {stats.map((s, i) => (
            <Reveal key={s.value} delay={i * 0.06}>
              <div className="text-2xl sm:text-3xl font-bold text-[#AECC1E]">{s.value}</div>
              <div className="text-xs text-white/50 mt-1">{isAr ? s.label : s.labelEn}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Comparison table ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <Reveal>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            {isAr ? 'مقارنة ميزة بميزة' : 'Feature-by-Feature Comparison'}
          </h2>
        </Reveal>

        {/* Table header */}
        <Reveal delay={0.05}>
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 mb-3 px-3 text-sm font-semibold text-white/50">
            <span>{isAr ? 'الميزة' : 'Feature'}</span>
            <span className="text-[#AECC1E]">
              {isAr ? '🟢 سبلت تيك' : '🟢 SplitTech'}
            </span>
            <span className="text-white/40">
              {isAr ? '🔴 المراقبة التقليدية' : '🔴 Traditional'}
            </span>
          </div>
        </Reveal>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <Reveal key={row.feature} delay={0.03 * i}>
              <div
                className={`grid grid-cols-[1fr_1fr_1fr] gap-3 p-3 rounded-xl border transition-colors
                  ${row.winner === 'splittech'
                    ? 'border-[#AECC1E]/15 bg-[#AECC1E]/4 hover:bg-[#AECC1E]/7'
                    : 'border-white/8 bg-white/3 hover:bg-white/5'
                  }`}
              >
                {/* Feature name */}
                <div className="flex items-start gap-2">
                  {row.winner === 'splittech' ? (
                    <TrendingUp size={14} className="text-[#AECC1E] mt-0.5 shrink-0" />
                  ) : (
                    <Star size={14} className="text-white/30 mt-0.5 shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-white/90">
                    {isAr ? row.feature : row.featureEn}
                  </span>
                </div>

                {/* SplitTech */}
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 size={13} className="text-[#AECC1E] mt-0.5 shrink-0" />
                  <span className="text-xs text-white/75 leading-relaxed">{row.splittech}</span>
                </div>

                {/* Traditional */}
                <div className="flex items-start gap-1.5">
                  {row.winner === 'splittech' ? (
                    <XCircle size={13} className="text-red-400/70 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle2 size={13} className="text-white/40 mt-0.5 shrink-0" />
                  )}
                  <span className="text-xs text-white/45 leading-relaxed">{row.traditional}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Why AI wins ── */}
      <section className="bg-white/3 border-y border-white/8 py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
              {isAr
                ? 'لماذا الذكاء الاصطناعي أفضل من الحارس البشري؟'
                : 'Why AI Outperforms Human Monitoring?'}
            </h2>
            <p className="text-white/50 text-center text-sm mb-10 max-w-xl mx-auto">
              {isAr
                ? 'المراقب البشري يُصيبه التعب، يتشتت، ويُؤثر التحيّز على قراراته. الذكاء الاصطناعي لا ينام ولا يتعب ولا يتحيّز.'
                : 'Human monitors get tired, distracted, and biased. AI never sleeps, never tires, never plays favourites.'}
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: <Clock size={20} />,
                title: isAr ? '24/7 بدون انقطاع' : '24/7 Non-Stop',
                body: isAr
                  ? 'سبلت تيك يراقب متجرك على مدار الساعة كل يوم بدون إجازات أو مرضى.'
                  : 'SplitTech monitors your store around the clock, every day — no holidays, no sick days.',
              },
              {
                icon: <Shield size={20} />,
                title: isAr ? 'معيار موحّد 100%' : '100% Consistent Standard',
                body: isAr
                  ? 'نفس قائمة التدقيق تُطبَّق على كل فرع بنفس الطريقة في كل مرة.'
                  : 'The same checklist is applied to every branch in exactly the same way, every time.',
              },
              {
                icon: <Zap size={20} />,
                title: isAr ? 'استجابة فورية' : 'Instant Response',
                body: isAr
                  ? 'تنبيه فوري للمدير عند اكتشاف أي مخالفة — قبل أن يلاحظها العميل.'
                  : 'Instant manager alert when a violation is detected — before the customer notices.',
              },
            ].map((card, i) => (
              <Reveal key={card.title} delay={0.08 * i}>
                <div className="p-5 rounded-2xl border border-white/8 bg-white/3 h-full">
                  <div className="w-10 h-10 rounded-xl bg-[#AECC1E]/15 flex items-center justify-center text-[#AECC1E] mb-3">
                    {card.icon}
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{card.title}</h3>
                  <p className="text-white/50 text-xs leading-relaxed">{card.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Warning: traditional risks ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Reveal>
          <div className="border border-red-500/20 bg-red-500/5 rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
              <h3 className="font-bold text-red-300 text-sm">
                {isAr
                  ? 'مخاطر الاعتماد على المراقبة التقليدية'
                  : 'Risks of Relying on Traditional Monitoring'}
              </h3>
            </div>
            <ul className="space-y-2 text-xs text-white/55 leading-relaxed">
              {(isAr ? [
                'الموظف المراقَب يعلم متى يُشاهَد — فيُحسّن أداءه مؤقتاً فقط أمام المراقب',
                'لا وجود لسجل تاريخي قابل للمقارنة بين الفروع والأشهر',
                'التقييمات تتأثر بالعلاقات الشخصية بين المراقب والموظفين',
                'عدم الاكتشاف الفوري يعني أن المشكلة تتراكم قبل أن يراها المدير',
                'التوسع في الفروع يعني تضاعف التكاليف البشرية',
              ] : [
                'Observed employees improve performance temporarily only when watched',
                'No historical record comparable across branches and months',
                'Evaluations influenced by personal relationships between monitor and staff',
                'No real-time detection means problems accumulate before management sees them',
                'Scaling branches means doubling human oversight costs',
              ]).map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <Reveal>
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">
            {isAr ? 'أسئلة شائعة' : 'Frequently Asked Questions'}
          </h2>
        </Reveal>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <Reveal key={faq.q} delay={0.05 * i}>
              <details className="group border border-white/8 rounded-xl bg-white/3 hover:bg-white/5 transition-colors">
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer text-sm font-semibold select-none">
                  <span>{faq.q}</span>
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-white/40 group-open:rotate-90 transition-transform"
                  />
                </summary>
                <p className="px-5 pb-4 text-xs text-white/55 leading-relaxed">
                  {faq.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className="border-t border-white/8 bg-gradient-to-b from-[#AECC1E]/8 to-transparent py-16 px-4 sm:px-6 text-center">
        <Reveal>
          <Camera size={32} className="mx-auto mb-4 text-[#AECC1E]" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            {isAr
              ? 'حوّل كاميراتك من تسجيل إلى ذكاء'
              : 'Turn Your Cameras From Recording to Intelligence'}
          </h2>
          <p className="text-white/50 text-sm mb-7 max-w-lg mx-auto">
            {isAr
              ? 'جرّب سبلت تيك مجاناً 14 يوماً — لا يلزم بطاقة ائتمان، وكاميراتك تبقى كما هي.'
              : 'Try SplitTech free for 14 days — no credit card required, your existing cameras stay as-is.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-[#AECC1E] text-[#070D18] font-bold text-sm hover:bg-[#c8eb2c] transition-colors"
            >
              {isAr ? 'ابدأ تجربتك المجانية' : 'Start Free Trial'}
              <ArrowLeft size={15} className={isAr ? '' : 'rotate-180'} />
            </Link>
            <Link
              to="/demo"
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl border border-white/15 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              {isAr ? 'شاهد عرضاً توضيحياً' : 'Watch Demo'}
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 py-8 px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <SplitLogo size="sm" />
        </div>
        <p className="text-xs text-white/30">
          {isAr
            ? '© 2025 مؤسسة سبلت تيك لتقنية المعلومات — جدة، المملكة العربية السعودية'
            : '© 2025 SplitTech Information Technology — Jeddah, Saudi Arabia'}
        </p>
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-white/30">
          <Link to="/" className="hover:text-white/60 transition-colors">{isAr ? 'الرئيسية' : 'Home'}</Link>
          <Link to="/pricing" className="hover:text-white/60 transition-colors">{isAr ? 'الأسعار' : 'Pricing'}</Link>
          <Link to="/demo" className="hover:text-white/60 transition-colors">{isAr ? 'تجربة' : 'Demo'}</Link>
          <Link to="/contact" className="hover:text-white/60 transition-colors">{isAr ? 'تواصل' : 'Contact'}</Link>
          <Link to="/terms" className="hover:text-white/60 transition-colors">{isAr ? 'الشروط' : 'Terms'}</Link>
        </div>
      </footer>
    </div>
  )
}
