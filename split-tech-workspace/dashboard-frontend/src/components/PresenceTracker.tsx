import { useAttendance } from '../hooks/useAttendance'

/**
 * Mounts the attendance heartbeat for the current user. Renders nothing.
 * Place inside AdminLayout / DashboardLayout so it activates as soon as
 * an authenticated user is browsing the app.
 */
export default function PresenceTracker() {
  useAttendance()
  return null
}
