import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { captureError } from '../lib/monitoring'

const HEARTBEAT_INTERVAL_MS = 30_000          // 30 seconds
const IDLE_THRESHOLD_MS     = 90_000          // no input for 90s ⇒ idle
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

/**
 * useAttendance — digital fingerprint for staff sessions.
 *
 * - On mount: calls the v1-attendance-checkin edge function so the server
 *   can stamp the real client IP onto today's staff_attendance row.
 * - Then sends a heartbeat every 30s via the attendance_heartbeat RPC.
 * - Tracks "active" vs "idle" by listening for user input — if the user
 *   has not interacted for IDLE_THRESHOLD_MS (90s), the next heartbeat sets is_active=false.
 * - The 30s interval uses a single setInterval and removes listeners on unmount (no leak).
 * - On tab hide / unload, fires a best-effort punch_out via sendBeacon.
 */
export function useAttendance(): void {
  const { user } = useAuth()
  const location = useLocation()
  const lastInputAt = useRef<number>(Date.now())
  const lastBeatAt = useRef<number>(Date.now())
  const checkedIn = useRef<boolean>(false)
  const pageRef = useRef<string>(location.pathname)

  // Update the in-memory "current page" whenever the route changes.
  useEffect(() => {
    pageRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!user) {
      checkedIn.current = false
      return
    }

    let cancelled = false
    const markInput = () => { lastInputAt.current = Date.now() }
    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, markInput, { passive: true })
    })

    async function getToken(): Promise<string> {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token ?? ''
    }

    async function checkIn() {
      if (checkedIn.current) return
      try {
        const token = await getToken()
        const apiUrl = import.meta.env.VITE_API_URL
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }
        // checkin captures real IP server-side
        await fetch(`${apiUrl}/v1/attendance-checkin`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ page: pageRef.current }),
        })
        // punch records/upserts today's attendance row
        await fetch(`${apiUrl}/v1/attendance-punch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ _page: pageRef.current, _ua: navigator.userAgent }),
        })
        if (!cancelled) checkedIn.current = true
      } catch (err) {
        captureError(err, { source: 'useAttendance.checkIn' })
      }
    }

    async function heartbeat() {
      const now = Date.now()
      const isActive = now - lastInputAt.current < IDLE_THRESHOLD_MS
      const delta = Math.round((now - lastBeatAt.current) / 1000)
      lastBeatAt.current = now
      try {
        const token = await getToken()
        await fetch(`${import.meta.env.VITE_API_URL}/v1/attendance-heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            _page: pageRef.current,
            _is_active: isActive,
            _delta_seconds: Math.min(delta, HEARTBEAT_INTERVAL_MS / 1000 + 60),
          }),
        })
      } catch (err) {
        captureError(err, { source: 'useAttendance.heartbeat' })
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        // Coming back from background — mark as input so first heartbeat counts as active
        lastInputAt.current = Date.now()
        // Eager heartbeat so admins see them online quickly
        heartbeat()
      }
    }

    function onUnload() {
      // Best-effort logout via keepalive fetch — survives page unload.
      try {
        const token = (supabase.auth as unknown as { currentSession?: { access_token: string } })
          .currentSession?.access_token
        if (!token) return
        fetch(`${import.meta.env.VITE_API_URL}/v1/attendance-punch-out`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: '{}',
        }).catch(() => {})
      } catch {
        // ignore — best effort
      }
    }

    // Initial check-in + first heartbeat
    checkIn().then(() => {
      if (!cancelled) heartbeat()
    })

    const interval = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onUnload)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onUnload)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markInput))
    }
  }, [user])
}
