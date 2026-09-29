import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearUser, identifyUser } from '../lib/monitoring'
import type { UserRole, Profile } from '../types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  role: UserRole | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        fetchUserData(data.session.user.id, data.session.user.email ?? null)
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserData(session.user.id, session.user.email ?? null)
      } else {
        setRole(null)
        setProfile(null)
        setLoading(false)
        clearUser()
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchUserData(userId: string, email: string | null) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setLoading(false); return }

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/my-role`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const json = res.ok ? await res.json() : {}
      const resolvedRole = (json.role as UserRole) ?? 'merchant'
      const resolvedProfile = json.profile ?? null
      setRole(resolvedRole)
      setProfile(resolvedProfile)
      identifyUser({ id: userId, email, role: resolvedRole })
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    clearUser()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
