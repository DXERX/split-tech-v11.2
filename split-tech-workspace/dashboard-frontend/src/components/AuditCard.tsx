import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Clock, MessageSquare, Eye, AlertTriangle, Info } from 'lucide-react'
import { formatRelative } from '../lib/utils'
import { useLanguage } from '../contexts/LanguageContext'
import type { AnalyticsLog, YoloDetection, DetectionsJson } from '../types'

/**
 * Safely extract a flat YoloDetection[] from whatever shape detections_json has.
 * Engine stores: { frames:[{objects:[...]}], summary:{...}, yolo_available:bool }
 * Older/legacy shape might be a plain array.
 */
function flatDetections(dj: AnalyticsLog['detections_json']): YoloDetection[] {
  if (!dj) return []
  if (Array.isArray(dj)) return dj as YoloDetection[]
  const obj = dj as DetectionsJson
  if (obj.frames && Array.isArray(obj.frames)) {
    return obj.frames.flatMap(f => Array.isArray(f.objects) ? f.objects : [])
  }
  return []
}

interface AuditCardProps {
  log: AnalyticsLog
  index?: number
}

// ── YOLO detection helpers ──────────────────────────────────────────────────
function groupDetections(detections: YoloDetection[]) {
  const map = new Map<string, { label: string; count: number; severity: string | null; maxConf: number }>()
  for (const d of detections) {
    const key = d.class
    if (!map.has(key)) map.set(key, { label: d.class_ar || d.class, count: 0, severity: d.severity, maxConf: 0 })
    const entry = map.get(key)!
    entry.count++
    if (d.conf > entry.maxConf) entry.maxConf = d.conf
    if (d.severity === 'violation') entry.severity = 'violation'
  }
  return [...map.values()].sort((a, b) => {
    if (a.severity === 'violation' && b.severity !== 'violation') return -1
    if (b.severity === 'violation' && a.severity !== 'violation') return 1
    return b.count - a.count
  })
}

function DetectionBadges({ detections, isAr }: { detections: YoloDetection[]; isAr: boolean }) {
  const groups = groupDetections(detections)
  if (!groups.length) return null
  const violations = groups.filter(g => g.severity === 'violation')
  return (
    <div className="space-y-2">
      {violations.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="text-xs font-semibold text-red-500">{isAr ? 'مخالفات:' : 'Violations:'}</span>
          {violations.map(v => (
            <span key={v.label}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40">
              {v.label} ×{v.count}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          {isAr ? 'كل الكشوفات:' : 'Detections:'}
        </span>
        {groups.filter(g => g.severity !== 'violation').map(g => (
          <span key={g.label}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-soft)', border: '1px solid var(--border)' }}>
            {g.severity === 'info' && <Info className="w-2.5 h-2.5" />}
            {g.label} ×{g.count}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────
export default function AuditCard({ log, index = 0 }: AuditCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const { lang, isRtl } = useLanguage()
  const isAr = lang === 'ar'

  const detections = flatDetections(log.detections_json)
  const hasYolo = !!(log.annotated_image_url || detections.length > 0)
  const violationCount = detections.filter(d => d.severity === 'violation').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="rounded-2xl border overflow-hidden hover:shadow-md transition-shadow duration-200"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
        style={{ textAlign: isRtl ? 'right' : 'left' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold line-clamp-1" style={{ color: 'var(--text-base)' }}>
              {log.summary || (isAr ? 'جولة تدقيق' : 'Audit round')}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" style={{ color: 'var(--text-faint)' }} />
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {formatRelative(log.created_at, lang)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {violationCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40">
              ⚠ {violationCount}
            </span>
          )}
          {hasYolo && violationCount === 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-muted)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
              <Eye className="w-3 h-3 inline mr-0.5" />YOLO
            </span>
          )}
          {Array.isArray(log.observations) && log.observations.length > 0 && (
            <span className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--bg-muted)' }}>
              {log.observations.length} {isAr ? 'سؤال' : 'Q'}
            </span>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
          </motion.div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              {/* AI Summary */}
              {log.ai_reasoning && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                    {isAr ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis'}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                    {log.ai_reasoning}
                  </p>
                </div>
              )}

              {/* Observations Q&A */}
              {Array.isArray(log.observations) && log.observations.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {isAr ? 'الملاحظات' : 'Observations'}
                  </p>
                  {log.observations.map((obs, i) => (
                    <div key={i} className="rounded-xl p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-soft)' }}>{String(obs.question ?? '')}</p>
                      <p className="text-sm" style={{ color: 'var(--text-base)' }}>{String(obs.answer ?? '')}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* YOLO Annotated Frame */}
              {log.annotated_image_url && !imgError && (
                <div className="mt-4 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
                    <Eye className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {isAr ? 'لقطة YOLO المُعلَّقة' : 'YOLO Annotated Frame'}
                    </span>
                    {violationCount > 0 && (
                      <span className="mr-auto ml-0 text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                        {isAr ? `${violationCount} مخالفة` : `${violationCount} violation${violationCount > 1 ? 's' : ''}`}
                      </span>
                    )}
                  </div>
                  <img
                    src={log.annotated_image_url}
                    alt={isAr ? 'لقطة التحليل' : 'Audit frame'}
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: '280px' }}
                    onError={() => setImgError(true)}
                  />
                </div>
              )}

              {/* YOLO Detection Badges */}
              {detections.length > 0 && (
                <div className="mt-3 p-3 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
                  <DetectionBadges detections={detections} isAr={isAr} />
                </div>
              )}

              {/* Confidence */}
              {log.confidence_score != null && (
                <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-faint)' }}>
                  <span>{isAr ? 'مستوى الثقة:' : 'Confidence:'}</span>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(log.confidence_score * 100)}%
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
