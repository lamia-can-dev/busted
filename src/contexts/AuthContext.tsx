import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface AuthState {
  userId: string | null
  groupId: string | null
  loading: boolean
  signOut: () => Promise<void>
  refreshGroupId: () => Promise<void>
  loginAs: (userId: string) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedUserId = localStorage.getItem('busted_user_id')
    if (storedUserId) {
      setUserId(storedUserId)
      fetchGroupId(storedUserId)
    } else {
      setLoading(false)
    }
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

  function loginAs(newUserId: string) {
    localStorage.setItem('busted_user_id', newUserId)
    setUserId(newUserId)
    fetchGroupId(newUserId)
  }

  async function signOut() {
    localStorage.removeItem('busted_user_id')
    localStorage.removeItem('busted_group_id')
    setUserId(null)
    setGroupId(null)
  }

  return (
    <AuthContext.Provider value={{ userId, groupId, loading, signOut, refreshGroupId, loginAs }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
