import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface AuthState {
  userId: string | null
  groupId: string | null
  loading: boolean
  signOut: () => Promise<void>
  refreshGroupId: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id)
        fetchGroupId(session.user.id)
      } else {
        // Try restoring from localStorage refresh token
        const storedRefreshToken = localStorage.getItem('busted_refresh_token')
        if (storedRefreshToken) {
          supabase.auth.refreshSession({ refresh_token: storedRefreshToken }).then(({ data }) => {
            if (data.session?.user) {
              setUserId(data.session.user.id)
              fetchGroupId(data.session.user.id)
            } else {
              setLoading(false)
            }
          })
        } else {
          setLoading(false)
        }
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id)
        fetchGroupId(session.user.id)
      } else {
        setUserId(null)
        setGroupId(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchGroupId(uid: string) {
    const { data } = await supabase
      .from('users')
      .select('group_id')
      .eq('id', uid)
      .maybeSingle()

    if (data?.group_id) {
      setGroupId(data.group_id)
    }
    setLoading(false)
  }

  async function refreshGroupId() {
    if (!userId) return
    const { data } = await supabase
      .from('users')
      .select('group_id')
      .eq('id', userId)
      .maybeSingle()

    if (data?.group_id) {
      setGroupId(data.group_id)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('busted_user_id')
    localStorage.removeItem('busted_group_id')
    localStorage.removeItem('busted_refresh_token')
    setUserId(null)
    setGroupId(null)
  }

  return (
    <AuthContext.Provider value={{ userId, groupId, loading, signOut, refreshGroupId }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
