import type { Lang } from '../i18n'

export interface SupportBotContext {
  title?: string | null
  description?: string | null
  category?: string | null
  storeName?: string | null
  storeStatus?: string | null
  isConnected?: boolean
  lastHeartbeat?: string | null
  priority?: string | null
}

export interface SupportBotGuide {
  summary: string
  steps: string[]
  suggestedReplies: string[]
  suggestedStatus: 'open' | 'in_progress' | 'resolved'
}

function normalize(value?: string | null) {
  return (value || '').toLowerCase()
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function localeDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')
}

function storeWord(lang: Lang) {
  return lang === 'ar' ? 'المتجر' : 'the store'
}

function connectionSuffix(context: SupportBotContext, lang: Lang): string {
  if (context.isConnected === false) {
    return lang === 'ar' ? 'ولا يوجد اتصال حديث مع المحرك.' : 'No recent engine connection.'
  }
  if (context.lastHeartbeat) {
    const d = localeDate(context.lastHeartbeat, lang)
    return lang === 'ar'
      ? `وآخر نبضة مسجلة كانت ${d}.`
      : `Last heartbeat recorded at ${d}.`
  }
  return lang === 'ar' ? 'ولا توجد نبضة مسجلة حتى الآن.' : 'No heartbeat recorded yet.'
}

export function buildSupportBotGuide(context: SupportBotContext, lang: Lang = 'ar'): SupportBotGuide {
  const title = normalize(context.title)
  const description = normalize(context.description)
  const text = `${title} ${description}`
  const storeName = context.storeName || storeWord(lang)
  const connectionText = connectionSuffix(context, lang)
  const isEn = lang === 'en'

  if (context.storeStatus === 'pending' || hasAny(text, ['pending', 'approve', 'موافقة', 'اعتماد', 'تفعيل الحساب'])) {
    return isEn
      ? {
          summary: `${storeName}'s request is still pending admin approval; some features stay disabled until final activation.`,
          steps: [
            'Review Admin → Store approvals to activate the request.',
            'After approval, the subscription activates and the license key is issued automatically.',
            'If the customer is urgent, move the ticket to In progress and share the expected activation time.',
          ],
          suggestedReplies: [
            `We've reviewed ${storeName}'s request; it's in the approval queue. We'll activate it and send license details right after approval.`,
            'The request is registered correctly; the next step is store approval from the admin panel, then engine activation.',
            'If you need urgent activation, send the branch name and registered mobile number and we will expedite review.',
          ],
          suggestedStatus: 'in_progress',
        }
      : {
          summary: `طلب ${storeName} ما زال بانتظار موافقة الإدارة، لذلك بعض الخصائص لن تعمل قبل التفعيل النهائي.`,
          steps: [
            'راجع لوحة الإدارة > الموافقة على المتاجر لتفعيل الطلب.',
            'بعد الموافقة سيتم تفعيل الاشتراك وإصدار مفتاح الترخيص تلقائياً.',
            'إذا كان العميل مستعجلاً، حدّث حالة التذكرة إلى "قيد المعالجة" وأبلغه بوقت التفعيل المتوقع.',
          ],
          suggestedReplies: [
            `تمت مراجعة طلب ${storeName} وهو الآن في قائمة الاعتماد. سنقوم بتفعيله وإرسال بيانات الترخيص لك فور الموافقة.`,
            'الطلب مسجل لدينا بشكل صحيح، والخطوة التالية هي اعتماد المتجر من لوحة الإدارة ثم تفعيل المحرك.',
            'إذا احتجت تفعيلًا عاجلًا أرسل لنا اسم الفرع ورقم الجوال المرتبط بالحساب وسنسرّع المراجعة.',
          ],
          suggestedStatus: 'in_progress',
        }
  }

  if (hasAny(text, ['license', 'activation', 'subscribe', 'subscription', 'ترخيص', 'تفعيل', 'اشتراك', 'تجديد', 'فاتورة', 'دفع'])) {
    return isEn
      ? {
          summary: `This looks related to license or subscription status for ${storeName}.`,
          steps: [
            'Check subscription status in Admin → Subscriptions.',
            'Confirm the store is active and the license key is not expired.',
            'If expired, renew the subscription then restart the engine from the IT dashboard.',
          ],
          suggestedReplies: [
            'We verified activation: next step is confirming subscription and license key before restarting the engine.',
            'If the license shows inactive, re-enter the license code and restart the client app once.',
            'We escalated to activation and will update you once subscription or renewal is confirmed.',
          ],
          suggestedStatus: 'in_progress',
        }
      : {
          summary: `المشكلة تبدو مرتبطة بالترخيص أو حالة الاشتراك الخاصة بـ ${storeName}.`,
          steps: [
            'تحقق من حالة الاشتراك من لوحة الإدارة > الاشتراكات.',
            'تأكد أن المتجر بحالة active وأن مفتاح الترخيص لم ينتهِ.',
            'إذا كان الترخيص منتهيًا، جدّد الاشتراك ثم أعد تشغيل المحرك من لوحة IT.',
          ],
          suggestedReplies: [
            'تحققنا من جانب التفعيل، والخطوة الحالية هي التأكد من حالة الاشتراك ومفتاح الترخيص قبل إعادة تشغيل المحرك.',
            'إذا ظهر لك أن الترخيص غير نشط، رجاء أعد إدخال رمز الترخيص ثم أعد تشغيل التطبيق مرة واحدة.',
            'تم توجيه الطلب إلى فريق التفعيل، وسنحدّثك فور تأكيد حالة الاشتراك أو التجديد.',
          ],
          suggestedStatus: 'in_progress',
        }
  }

  if (hasAny(text, ['camera', 'rtsp', 'stream', 'video', 'كاميرا', 'بث', 'صورة', 'تصوير'])) {
    return isEn
      ? {
          summary: `The ticket points to a camera or RTSP path issue for ${storeName}.`,
          steps: [
            'Verify the camera works on the local network and the RTSP URL is correct.',
            'Review Store Setup: stream URL and credentials.',
            'After any change, restart the engine and wait for a new heartbeat on IT.',
          ],
          suggestedReplies: [
            'This is likely an RTSP path or credentials issue — please verify the URL and password, then restart the engine.',
            'Please confirm the camera works on the LAN first, then reopen the app or send a screenshot of stream settings.',
            'We escalated the technical ticket and will align camera settings with the current device state.',
          ],
          suggestedStatus: 'in_progress',
        }
      : {
          summary: `البلاغ يشير إلى مشكلة في الكاميرا أو مسار RTSP لمتجر ${storeName}.`,
          steps: [
            'تأكد من أن الكاميرا تعمل محليًا وأن مسار RTSP صحيح.',
            'راجع بيانات `Store Setup` وتحقق من عنوان البث وكلمة المرور.',
            'بعد أي تعديل أعد تشغيل المحرك وانتظر نبضة جديدة في لوحة IT.',
          ],
          suggestedReplies: [
            'غالبًا المشكلة من مسار الكاميرا أو بيانات RTSP، لذلك نوصي بالتحقق من الرابط وكلمة المرور ثم إعادة تشغيل المحرك.',
            'يرجى التأكد أن الكاميرا تعمل من الشبكة المحلية أولًا، ثم أعد فتح التطبيق أو أرسل لنا لقطة من إعدادات البث.',
            'تمت إحالة البلاغ الفني، وسنطابق إعدادات الكاميرا مع حالة الجهاز الحالية.',
          ],
          suggestedStatus: 'in_progress',
        }
  }

  if (context.isConnected === false || hasAny(text, ['offline', 'network', 'internet', 'heartbeat', 'غير متصل', 'اتصال', 'شبكة', 'انترنت'])) {
    return isEn
      ? {
          summary: `There are signs of a connectivity issue at ${storeName}. ${connectionText}`,
          steps: [
            'Check power and internet on the device or Raspberry Pi.',
            'From IT, send a `restart` or `run` command to the engine.',
            'If no new heartbeat within 10 minutes, review system logs and error messages.',
          ],
          suggestedReplies: [
            'This looks like a device connectivity issue — please restart the engine, verify the network, and share the result.',
            'We have not seen a recent heartbeat; please check power and internet, then try again.',
            'If it stays offline after restart, send a device screenshot or error log for deeper diagnosis.',
          ],
          suggestedStatus: 'in_progress',
        }
      : {
          summary: `هناك مؤشرات على مشكلة اتصال في ${storeName} ${connectionText}`,
          steps: [
            'تحقق من الكهرباء والإنترنت على الجهاز أو الـ Raspberry Pi.',
            'من لوحة IT أرسل أمر `restart` أو `run` للمحرك.',
            'إذا لم تصل نبضة جديدة خلال 10 دقائق، افحص سجل النظام ورسائل الخطأ.',
          ],
          suggestedReplies: [
            'المشكلة تبدو مرتبطة بانقطاع اتصال الجهاز، ونوصي بإعادة تشغيل المحرك والتأكد من الشبكة ثم موافاتنا بالنتيجة.',
            'لم نرصد نبضة حديثة من الجهاز، لذلك نرجو فحص الاتصال بالطاقة والإنترنت ثم إعادة المحاولة.',
            'إذا استمر الانقطاع بعد إعادة التشغيل، أرسل لنا صورة من شاشة الجهاز أو سجل الخطأ لنكمل التشخيص.',
          ],
          suggestedStatus: 'in_progress',
        }
  }

  if (hasAny(text, ['whatsapp', 'notification', 'تنبيه', 'واتساب'])) {
    return isEn
      ? {
          summary: `This is about WhatsApp notifications or alerts for ${storeName}.`,
          steps: [
            'Confirm WhatsApp is enabled in store settings.',
            'Use international format for the number, e.g. `+966...`.',
            'Run an audit round or send a test alert to confirm delivery.',
          ],
          suggestedReplies: [
            'Please enable WhatsApp notifications and use the international number format, then we can retry a test alert.',
            'Initial settings reviewed; next step is testing delivery after updating the number.',
            'If messages still do not arrive after verifying the number, send a screenshot of WhatsApp settings in the dashboard.',
          ],
          suggestedStatus: 'in_progress',
        }
      : {
          summary: `الطلب مرتبط بإشعارات واتساب أو التنبيهات الخاصة بمتجر ${storeName}.`,
          steps: [
            'تأكد من تفعيل خيار واتساب داخل إعدادات المتجر.',
            'راجع صيغة الرقم لتكون دولية مثل `+966...`.',
            'نفّذ جولة أو حدث تنبيهًا تجريبيًا للتأكد من وصول الرسالة.',
          ],
          suggestedReplies: [
            'يرجى التأكد من تفعيل إشعارات واتساب وكتابة الرقم بالصيغة الدولية، ثم نجرب إرسال تنبيه جديد.',
            'تمت مراجعة الإعدادات المبدئية، والخطوة التالية هي اختبار إرسال تنبيه بعد تحديث الرقم.',
            'إذا لم تصل الرسالة بعد التحقق من الرقم، أرسل لنا لقطة من إعدادات واتساب داخل لوحة التحكم.',
          ],
          suggestedStatus: 'in_progress',
        }
  }

  return isEn
    ? {
        summary: `Ticket analyzed for ${storeName}. Start with store status and connectivity, then review system logs.`,
        steps: [
          'Review store and subscription in the admin panel.',
          'Check the latest device heartbeat and system logs on IT.',
          'If the issue is broad, ask the customer for a screenshot or clearer description.',
        ],
        suggestedReplies: [
          'We received your request and started technical review. We will first verify store status and connectivity, then update you.',
          'We need more details such as when the issue started or a screenshot to continue diagnosis.',
          'The ticket was escalated to engineering; we will update the status after the initial check.',
        ],
        suggestedStatus: 'in_progress',
      }
    : {
        summary: `تم تحليل البلاغ الخاص بـ ${storeName}، ويوصى ببدء التشخيص من حالة المتجر والاتصال ثم مراجعة سجلات النظام.`,
        steps: [
          'راجع حالة المتجر والاشتراك من لوحة الإدارة.',
          'تحقق من آخر نبضة للجهاز وسجل النظام في لوحة IT.',
          'إذا كانت المشكلة عامة، اطلب من العميل لقطة شاشة أو وصفًا أدق لتسريع الحل.',
        ],
        suggestedReplies: [
          'استلمنا طلبك وبدأنا المراجعة الفنية الآن. سنقوم أولًا بالتحقق من حالة المتجر والاتصال ثم نوافيك بالتحديث.',
          'نحتاج بعض التفاصيل الإضافية مثل وقت ظهور المشكلة أو لقطة شاشة حتى نكمل التشخيص بدقة أكبر.',
          'تم تصعيد البلاغ للفريق الفني، وسنحدث حالة التذكرة فور الانتهاء من الفحص الأولي.',
        ],
        suggestedStatus: 'in_progress',
      }
}

export function getSuggestedReplies(context: SupportBotContext, lang: Lang = 'ar', limit = 3) {
  return buildSupportBotGuide(context, lang).suggestedReplies.slice(0, limit)
}
