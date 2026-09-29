import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Crosshair, Trash2, Save, RotateCcw, Info,
  CheckCircle, AlertTriangle, Layers, DoorOpen, Armchair, Sofa,
  MousePointerClick, Loader2, Video, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMyStore } from '../../hooks/useStore'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'

const API = import.meta.env.VITE_API_URL

// ── Types ────────────────────────────────────────────────────────────────────

type Point = [number, number] // percentage [0-100]

interface Zone {
  id: string
  name: 'work_area' | 'waiting_area'
  label_ar: string
  label_en: string
  color: string
  fillColor: string
  polygon: Point[]
}

interface DoorLine {
  points: Point[]
  color: string
}

type DrawingMode = 'work_area' | 'waiting_area' | 'door_line' | null

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function pctToCanvas(pt: Point, w: number, h: number): [number, number] {
  return [(pt[0] / 100) * w, (pt[1] / 100) * h]
}

function canvasToPct(x: number, y: number, w: number, h: number): Point {
  return [
    Math.round((x / w) * 10000) / 100,
    Math.round((y / h) * 10000) / 100,
  ]
}

// ── Zone Presets ─────────────────────────────────────────────────────────────

const ZONE_PRESETS: Record<'work_area' | 'waiting_area', Omit<Zone, 'id' | 'polygon'>> = {
  work_area: {
    name: 'work_area',
    label_ar: 'منطقة العمل',
    label_en: 'Work Zone',
    color: '#22c55e',
    fillColor: 'rgba(34,197,94,0.15)',
  },
  waiting_area: {
    name: 'waiting_area',
    label_ar: 'منطقة الانتظار',
    label_en: 'Waiting Zone',
    color: '#3b82f6',
    fillColor: 'rgba(59,130,246,0.15)',
  },
}

const DOOR_LINE_COLOR = '#ef4444'

// ── Component ────────────────────────────────────────────────────────────────

export default function ZoneConfig() {
  const { user } = useAuth()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const { data: store } = useMyStore()

  // ── Multi-camera state ───────────────────────────────────────────────────
  const [cameras, setCameras] = useState<{ camera_id: string; name: string; is_door: boolean }[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [isDoorCamera, setIsDoorCamera] = useState(false)

  // ── Cached full config (zones for all cameras) ──────────────────────────
  const [cachedConfig, setCachedConfig] = useState<any>(null)

  // Helper: apply zone config for a given camera ID from the cached config
  function applyZoneConfig(cfg: any, camId: string) {
    const zoneCfgs = cfg.zone_configs || {}
    const defaultZoneCfg = cfg.zone_config || null
    // Try exact camera match, then fall back to 'camera_01' (legacy single-camera stores),
    // then fall back to the first key in zone_configs, then to zone_config
    const camZoneCfg =
      (camId ? (zoneCfgs[camId] || null) : null) ||
      zoneCfgs['camera_01'] ||
      (Object.keys(zoneCfgs).length === 1 ? zoneCfgs[Object.keys(zoneCfgs)[0]] : null) ||
      defaultZoneCfg
    if (camZoneCfg) {
      const restoredZones: Zone[] = (camZoneCfg.zones || []).map((z: any) => ({
        id: uid(),
        name: z.name,
        ...ZONE_PRESETS[z.name as 'work_area' | 'waiting_area'] || ZONE_PRESETS.work_area,
        polygon: z.polygon,
      }))
      setZones(restoredZones)
      setDoorLine(camZoneCfg.door_line
        ? { points: camZoneCfg.door_line, color: DOOR_LINE_COLOR }
        : null)
    } else {
      setZones([])
      setDoorLine(null)
    }
  }

  // Fetch camera list + full config once when store is ready
  useEffect(() => {
    if (!store?.id) return
    async function loadCameras() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch(`${API}/v1/engine-config?store_id=${store!.id}&_t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        })
        if (!res.ok) return
        const cfg = await res.json()
        setCachedConfig(cfg)
        const cams = cfg.cameras || []
        if (cams.length > 0) {
          const firstCamId = cams[0].camera_id
          setCameras(cams.map((c: any) => ({
            camera_id: c.camera_id,
            name: c.name || c.camera_id,
            is_door: c.is_door === true,
          })))
          setSelectedCameraId(firstCamId)
          setIsDoorCamera(cams[0].is_door === true)
          // Use firstCamId directly — selectedCameraId state is still '' here
          applyZoneConfig(cfg, firstCamId)
        } else {
          // No cameras configured — try to load under 'camera_01' (legacy save key)
          applyZoneConfig(cfg, 'camera_01')
        }
      } catch { /* ignore */ }
    }
    loadCameras()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id])

  // Reload zones whenever the user switches to a different camera
  useEffect(() => {
    if (!cachedConfig || !selectedCameraId) return
    applyZoneConfig(cachedConfig, selectedCameraId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraId])

  // Drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 450 })
  const [zones, setZones] = useState<Zone[]>([])
  const [doorLine, setDoorLine] = useState<DoorLine | null>(null)
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null)
  const [currentPoints, setCurrentPoints] = useState<Point[]>([])
  const [saving, setSaving] = useState(false)
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const snapshotImg = useRef<HTMLImageElement | null>(null)

  // ── Fetch camera snapshot ────────────────────────────────────────────────
  const fetchSnapshot = useCallback(async () => {
    if (!store?.id) return
    setSnapshotLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const camId = selectedCameraId || 'camera_01'
      const url = `${API}/v1/camera-snapshot/${store.id}?camera_id=${encodeURIComponent(camId)}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        setSnapshotUrl(objectUrl)
      } else {
        setSnapshotUrl(null)
      }
    } catch {
      // snapshot not available; use placeholder
    } finally {
      setSnapshotLoading(false)
    }
  }, [store?.id, selectedCameraId])

  // Re-fetch snapshot whenever store or selected camera changes
  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])

  // Preload snapshot image
  useEffect(() => {
    if (!snapshotUrl) { snapshotImg.current = null; return }
    const img = new Image()
    img.src = snapshotUrl
    img.onload = () => { snapshotImg.current = img; redraw() }
    return () => { URL.revokeObjectURL(snapshotUrl) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotUrl])

  // ── Canvas resize ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleResize() {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const w = Math.floor(rect.width)
      const h = Math.floor(w * 9 / 16) // 16:9 aspect
      setCanvasSize({ w, h })
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── Canvas drawing ───────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = canvasSize

    ctx.clearRect(0, 0, w, h)

    // Draw snapshot or placeholder
    if (snapshotImg.current) {
      ctx.drawImage(snapshotImg.current, 0, 0, w, h)
    } else {
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(0, 0, w, h)
      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      // Center text
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(isAr ? 'لقطة الكاميرا غير متوفرة' : 'Camera snapshot unavailable', w / 2, h / 2 - 10)
      ctx.fillText(isAr ? 'ارسم المناطق على هذه المساحة' : 'Draw zones on this area', w / 2, h / 2 + 14)
    }

    // Draw completed zones
    zones.forEach(zone => {
      if (zone.polygon.length < 3) return
      ctx.beginPath()
      const [sx, sy] = pctToCanvas(zone.polygon[0], w, h)
      ctx.moveTo(sx, sy)
      zone.polygon.slice(1).forEach(pt => {
        const [px, py] = pctToCanvas(pt, w, h)
        ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.fillStyle = zone.fillColor
      ctx.fill()
      ctx.strokeStyle = zone.color
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw vertices
      zone.polygon.forEach(pt => {
        const [px, py] = pctToCanvas(pt, w, h)
        ctx.beginPath()
        ctx.arc(px, py, 4, 0, Math.PI * 2)
        ctx.fillStyle = zone.color
        ctx.fill()
      })

      // Label
      const cx = zone.polygon.reduce((s, p) => s + p[0], 0) / zone.polygon.length
      const cy = zone.polygon.reduce((s, p) => s + p[1], 0) / zone.polygon.length
      const [lx, ly] = pctToCanvas([cx, cy], w, h)
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = zone.color
      ctx.fillText(isAr ? zone.label_ar : zone.label_en, lx, ly)
    })

    // Draw completed door line
    if (doorLine && doorLine.points.length === 2) {
      const [ax, ay] = pctToCanvas(doorLine.points[0], w, h)
      const [bx, by] = pctToCanvas(doorLine.points[1], w, h)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.strokeStyle = DOOR_LINE_COLOR
      ctx.lineWidth = 3
      ctx.setLineDash([8, 4])
      ctx.stroke()
      ctx.setLineDash([]);

      [doorLine.points[0], doorLine.points[1]].forEach(pt => {
        const [px, py] = pctToCanvas(pt, w, h)
        ctx.beginPath()
        ctx.arc(px, py, 5, 0, Math.PI * 2)
        ctx.fillStyle = DOOR_LINE_COLOR
        ctx.fill()
      })

      // Label
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = DOOR_LINE_COLOR
      ctx.fillText(isAr ? 'خط الباب' : 'Door Line', mx, my - 10)
    }

    // Draw current points (in-progress drawing)
    if (currentPoints.length > 0) {
      const modeColor = drawingMode === 'door_line'
        ? DOOR_LINE_COLOR
        : drawingMode === 'work_area'
          ? '#22c55e'
          : '#3b82f6'

      ctx.beginPath()
      const [fx, fy] = pctToCanvas(currentPoints[0], w, h)
      ctx.moveTo(fx, fy)
      currentPoints.slice(1).forEach(pt => {
        const [px, py] = pctToCanvas(pt, w, h)
        ctx.lineTo(px, py)
      })
      ctx.strokeStyle = modeColor
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.stroke()
      ctx.setLineDash([])

      currentPoints.forEach(pt => {
        const [px, py] = pctToCanvas(pt, w, h)
        ctx.beginPath()
        ctx.arc(px, py, 5, 0, Math.PI * 2)
        ctx.fillStyle = modeColor
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
    }
  }, [canvasSize, zones, doorLine, currentPoints, drawingMode, isAr])

  useEffect(() => { redraw() }, [redraw])

  // ── Canvas click handler ─────────────────────────────────────────────────
  function getCanvasPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number
    if ('touches' in e) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    const x = clientX - rect.left
    const y = clientY - rect.top
    return canvasToPct(x, y, canvasSize.w, canvasSize.h)
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawingMode) return
    const pt = getCanvasPos(e)
    if (!pt) return

    if (drawingMode === 'door_line') {
      const next = [...currentPoints, pt]
      if (next.length >= 2) {
        setDoorLine({ points: [next[0], next[1]], color: DOOR_LINE_COLOR })
        setCurrentPoints([])
        setDrawingMode(null)
        toast.success(isAr ? 'تم رسم خط الباب' : 'Door line drawn')
      } else {
        setCurrentPoints(next)
      }
      return
    }

    setCurrentPoints(prev => [...prev, pt])
  }

  function handleCanvasDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!drawingMode || drawingMode === 'door_line') return
    if (currentPoints.length < 3) {
      toast.error(isAr ? 'يجب رسم 3 نقاط على الأقل' : 'Draw at least 3 points')
      return
    }

    const preset = ZONE_PRESETS[drawingMode]
    const newZone: Zone = {
      id: uid(),
      ...preset,
      polygon: [...currentPoints],
    }

    // Replace existing zone of same type
    setZones(prev => [...prev.filter(z => z.name !== drawingMode), newZone])
    setCurrentPoints([])
    setDrawingMode(null)
    toast.success(isAr ? `تم رسم ${preset.label_ar}` : `${preset.label_en} drawn`)
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (!drawingMode) return
    e.preventDefault()
    const pt = getCanvasPos(e)
    if (!pt) return

    if (drawingMode === 'door_line') {
      const next = [...currentPoints, pt]
      if (next.length >= 2) {
        setDoorLine({ points: [next[0], next[1]], color: DOOR_LINE_COLOR })
        setCurrentPoints([])
        setDrawingMode(null)
        toast.success(isAr ? 'تم رسم خط الباب' : 'Door line drawn')
      } else {
        setCurrentPoints(next)
      }
      return
    }

    setCurrentPoints(prev => [...prev, pt])
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function startDrawing(mode: DrawingMode) {
    setDrawingMode(mode)
    setCurrentPoints([])
  }

  function cancelDrawing() {
    setDrawingMode(null)
    setCurrentPoints([])
  }

  function deleteZone(name: string) {
    setZones(prev => prev.filter(z => z.name !== name))
    toast.success(isAr ? 'تم حذف المنطقة' : 'Zone deleted')
  }

  function deleteDoorLine() {
    setDoorLine(null)
    toast.success(isAr ? 'تم حذف خط الباب' : 'Door line deleted')
  }

  function resetAll() {
    setZones([])
    setDoorLine(null)
    setCurrentPoints([])
    setDrawingMode(null)
    toast.success(isAr ? 'تم إعادة التعيين' : 'Reset complete')
  }

  // ── Finish polygon via button (mobile-friendly) ──────────────────────────
  function finishPolygon() {
    if (!drawingMode || drawingMode === 'door_line') return
    if (currentPoints.length < 3) {
      toast.error(isAr ? 'يجب رسم 3 نقاط على الأقل' : 'Draw at least 3 points')
      return
    }
    const preset = ZONE_PRESETS[drawingMode]
    const newZone: Zone = {
      id: uid(),
      ...preset,
      polygon: [...currentPoints],
    }
    setZones(prev => [...prev.filter(z => z.name !== drawingMode), newZone])
    setCurrentPoints([])
    setDrawingMode(null)
    toast.success(isAr ? `تم رسم ${preset.label_ar}` : `${preset.label_en} drawn`)
  }

  // ── Save to API ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!store?.id) {
      toast.error(isAr ? 'لا يوجد متجر مرتبط' : 'No store found')
      return
    }
    if (zones.length === 0 && !doorLine) {
      toast.error(isAr ? 'ارسم منطقة واحدة على الأقل' : 'Draw at least one zone')
      return
    }

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expired')

      const zoneData = {
        door_line: doorLine ? doorLine.points : null,
        zones: zones.map(z => ({
          name: z.name,
          polygon: z.polygon,
        })),
        frame_resolution: [canvasSize.w, canvasSize.h],
      }

      const payload: any = {
        store_id: store.id,
        zone_config: zoneData,
      }

      // Multi-camera: save per-camera zone config + is_door flag
      if (selectedCameraId) {
        payload.camera_id = selectedCameraId
        payload.is_door = isDoorCamera   // explicit — never inferred from name
      }

      const res = await fetch(`${API}/v1/engine-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to save')
      }

      toast.success(isAr ? 'تم حفظ إعدادات المناطق بنجاح' : 'Zone configuration saved successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isAr ? 'فشل الحفظ' : 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  // ── Mode label helpers ───────────────────────────────────────────────────
  function getModeLabel(): string {
    switch (drawingMode) {
      case 'work_area': return isAr ? 'ارسم منطقة العمل — انقر لإضافة نقاط، انقر مزدوج أو اضغط "إنهاء" لإغلاق الشكل' : 'Draw Work Zone — click to add points, double-click or press "Finish" to close'
      case 'waiting_area': return isAr ? 'ارسم منطقة الانتظار — انقر لإضافة نقاط، انقر مزدوج أو اضغط "إنهاء" لإغلاق الشكل' : 'Draw Waiting Zone — click to add points, double-click or press "Finish" to close'
      case 'door_line': return isAr ? 'انقر نقطتين لرسم خط الباب' : 'Click 2 points to draw the door line'
      default: return ''
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <Crosshair className="w-6 h-6 text-brand-700" />
          {isAr ? 'إعداد المناطق' : 'Zone Configuration'}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? 'حدد مناطق العمل والانتظار وخط الباب على لقطة الكاميرا'
            : 'Define work zone, waiting zone, and door line on the camera feed'}
        </p>
      </div>

      {/* ── Camera Selector (multi-camera) ── */}
      {cameras.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Video size={16} style={{ color: 'var(--text-muted)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>
              {isAr ? 'اختر الكاميرا:' : 'Select Camera:'}
            </span>
          </div>
          {cameras.map((cam) => (
            <button
              key={cam.camera_id}
              onClick={() => {
                setSelectedCameraId(cam.camera_id)
                setIsDoorCamera(cam.is_door)
                setZones([])
                setDoorLine(null)
                setCurrentPoints([])
                setDrawingMode(null)
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                selectedCameraId === cam.camera_id
                  ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                  : 'hover:bg-[var(--bg-subtle)]'
              }`}
              style={selectedCameraId !== cam.camera_id ? { borderColor: 'var(--border)', color: 'var(--text-soft)' } : {}}
            >
              <Camera size={13} />
              {cam.name}
              {cam.is_door && <span className="text-[9px] bg-white/20 px-1 rounded">🚪</span>}
            </button>
          ))}
        </motion.div>
      )}

      {/* ── Door Camera Toggle ── */}
      {(cameras.length >= 1) && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
            isDoorCamera
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40'
              : 'border-dashed'
          }`}
          style={!isDoorCamera ? { borderColor: 'var(--border)' } : {}}>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
              {isAr ? '🚪 هل هذه الكاميرا موجهة للمدخل أو الباب؟' : '🚪 Is this camera facing the entrance / door?'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {isAr
                ? 'كاميرا الباب تعمل بـ 10 FPS بدلاً من 2 FPS لضمان عدم إغفال أي زبون يمر بسرعة'
                : 'Door cameras run at 10 FPS instead of 2 FPS to catch fast-moving visitors accurately'}
            </p>
          </div>
          <button
            onClick={() => setIsDoorCamera(v => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              isDoorCamera ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              isDoorCamera ? (isAr ? 'translate-x-1' : 'translate-x-6') : (isAr ? 'translate-x-6' : 'translate-x-1')
            }`} />
          </button>
          {isDoorCamera && (
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex-shrink-0">
              10 FPS
            </span>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Canvas + tools ───────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">
          {/* Tool bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4 shadow-card"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={drawingMode === 'work_area' ? 'primary' : 'outline'}
                onClick={() => drawingMode === 'work_area' ? cancelDrawing() : startDrawing('work_area')}
              >
                <Armchair className="w-4 h-4" />
                {isAr ? 'منطقة العمل' : 'Work Zone'}
              </Button>
              <Button
                size="sm"
                variant={drawingMode === 'waiting_area' ? 'primary' : 'outline'}
                onClick={() => drawingMode === 'waiting_area' ? cancelDrawing() : startDrawing('waiting_area')}
              >
                <Sofa className="w-4 h-4" />
                {isAr ? 'منطقة الانتظار' : 'Waiting Zone'}
              </Button>
              <Button
                size="sm"
                variant={drawingMode === 'door_line' ? 'primary' : 'outline'}
                onClick={() => drawingMode === 'door_line' ? cancelDrawing() : startDrawing('door_line')}
              >
                <DoorOpen className="w-4 h-4" />
                {isAr ? 'خط الباب' : 'Door Line'}
              </Button>

              <div className="flex-1" />

              {drawingMode && currentPoints.length >= 3 && drawingMode !== 'door_line' && (
                <Button size="sm" variant="primary" onClick={finishPolygon}>
                  <CheckCircle className="w-4 h-4" />
                  {isAr ? 'إنهاء' : 'Finish'}
                </Button>
              )}

              {drawingMode && (
                <Button size="sm" variant="ghost" onClick={cancelDrawing}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={resetAll}>
                <RotateCcw className="w-4 h-4" />
                {isAr ? 'إعادة تعيين' : 'Reset'}
              </Button>
            </div>

            {/* Drawing mode indicator */}
            <AnimatePresence>
              {drawingMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mt-3 flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg-subtle)', color: 'var(--text-base)' }}
                >
                  <MousePointerClick className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>{getModeLabel()}</span>
                  {currentPoints.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-bold"
                    >
                      {currentPoints.length} {isAr ? 'نقطة' : 'pts'}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Canvas */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            ref={containerRef}
            className="rounded-2xl overflow-hidden shadow-card relative"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
          >
            {snapshotLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/30 rounded-2xl">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              className={`w-full ${drawingMode ? 'cursor-crosshair' : 'cursor-default'}`}
              style={{ display: 'block' }}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDblClick}
              onTouchStart={handleTouchStart}
            />
          </motion.div>

          {/* Save bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="flex items-center gap-3 flex-wrap"
          >
            <Button variant="primary" loading={saving} onClick={handleSave} disabled={zones.length === 0 && !doorLine}>
              <Save className="w-4 h-4" />
              {isAr ? 'حفظ الإعدادات' : 'Save Configuration'}
            </Button>
            <Button variant="outline" onClick={fetchSnapshot} disabled={snapshotLoading}>
              <Camera className="w-4 h-4" />
              {isAr ? 'تحديث اللقطة' : 'Refresh Snapshot'}
            </Button>
          </motion.div>
        </div>

        {/* ── Right: Zone list + Instructions ────────────────────────────── */}
        <div className="space-y-4">
          {/* Zone list */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="rounded-2xl p-4 shadow-card"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text-base)' }}>
              <Layers className="w-5 h-5 text-brand-600" />
              {isAr ? 'المناطق المحددة' : 'Configured Zones'}
            </h2>

            {zones.length === 0 && !doorLine ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-faint)' }}>
                {isAr ? 'لم يتم رسم أي منطقة بعد' : 'No zones drawn yet'}
              </p>
            ) : (
              <div className="space-y-2">
                {zones.map(zone => (
                  <div
                    key={zone.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: zone.color }} />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>
                          {isAr ? zone.label_ar : zone.label_en}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {zone.polygon.length} {isAr ? 'نقطة' : 'points'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                        style={{ color: 'var(--text-faint)' }}
                        onClick={() => {
                          deleteZone(zone.name)
                          startDrawing(zone.name as DrawingMode)
                        }}
                        title={isAr ? 'إعادة رسم' : 'Redraw'}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                        style={{ color: 'var(--text-faint)' }}
                        onClick={() => deleteZone(zone.name)}
                        title={isAr ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}

                {doorLine && (
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: DOOR_LINE_COLOR }} />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>
                          {isAr ? 'خط الباب' : 'Door Line'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          2 {isAr ? 'نقطة' : 'points'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                        style={{ color: 'var(--text-faint)' }}
                        onClick={() => {
                          deleteDoorLine()
                          startDrawing('door_line')
                        }}
                        title={isAr ? 'إعادة رسم' : 'Redraw'}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                        style={{ color: 'var(--text-faint)' }}
                        onClick={() => deleteDoorLine()}
                        title={isAr ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status summary */}
            <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
              {(['work_area', 'waiting_area'] as const).map(name => {
                const exists = zones.some(z => z.name === name)
                const label = name === 'work_area'
                  ? (isAr ? 'منطقة العمل' : 'Work Zone')
                  : (isAr ? 'منطقة الانتظار' : 'Waiting Zone')
                return (
                  <div key={name} className="flex items-center gap-2 text-xs" style={{ color: exists ? '#22c55e' : 'var(--text-faint)' }}>
                    {exists ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {label}
                  </div>
                )
              })}
              <div className="flex items-center gap-2 text-xs" style={{ color: doorLine ? '#22c55e' : 'var(--text-faint)' }}>
                {doorLine ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {isAr ? 'خط الباب' : 'Door Line'}
              </div>
            </div>
          </motion.div>

          {/* Instructions panel */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="rounded-2xl p-4 shadow-card"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text-base)' }}>
              <Info className="w-5 h-5 text-brand-600" />
              {isAr ? 'التعليمات' : 'Instructions'}
            </h2>
            <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              <div className="flex gap-2">
                <div className="w-3 h-3 mt-1 rounded-full shrink-0" style={{ background: '#22c55e' }} />
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>
                    {isAr ? 'منطقة العمل' : 'Work Zone'}
                  </p>
                  <p>
                    {isAr
                      ? 'حدد المنطقة التي يتم فيها تقديم الخدمة (كراسي الحلاقة / منطقة العمل). يستخدمها النظام لحساب الوقت الفعلي للخدمة.'
                      : 'Mark the area where service is provided (barber chairs / work area). The system uses this to calculate actual service time.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-3 h-3 mt-1 rounded-full shrink-0" style={{ background: '#3b82f6' }} />
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>
                    {isAr ? 'منطقة الانتظار' : 'Waiting Zone'}
                  </p>
                  <p>
                    {isAr
                      ? 'حدد منطقة الجلوس / الانتظار. يتتبع النظام عدد المنتظرين ومتوسط وقت الانتظار.'
                      : 'Mark the seating / waiting area. The system tracks the number of people waiting and average wait time.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-3 h-3 mt-1 rounded-full shrink-0" style={{ background: '#ef4444' }} />
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>
                    {isAr ? 'خط الباب' : 'Door Line'}
                  </p>
                  <p>
                    {isAr
                      ? 'ارسم خطاً عند مدخل المتجر (نقطتان فقط). يستخدم لحساب عدد الداخلين والخارجين.'
                      : 'Draw a line at the store entrance (2 points only). Used to count entries and exits.'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl p-3 mt-2" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-soft)' }}>
                  {isAr ? 'نصائح:' : 'Tips:'}
                </p>
                <ul className="text-xs space-y-1 list-disc list-inside" style={{ color: 'var(--text-faint)' }}>
                  <li>{isAr ? 'انقر على اللوحة لإضافة نقاط' : 'Click on the canvas to add points'}</li>
                  <li>{isAr ? 'انقر مزدوج أو اضغط "إنهاء" لإغلاق المضلع' : 'Double-click or press "Finish" to close polygon'}</li>
                  <li>{isAr ? 'لخط الباب، انقر نقطتين فقط' : 'For door line, click exactly 2 points'}</li>
                  <li>{isAr ? 'يمكنك إعادة رسم أي منطقة في أي وقت' : 'You can redraw any zone anytime'}</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
