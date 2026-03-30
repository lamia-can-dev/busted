/** @deprecated Use useAuth() from contexts/AuthContext instead. Kept for Onboarding fallback + existing tests. */

const KEYS = {
  userId: 'busted_user_id',
  groupId: 'busted_group_id',
  refreshToken: 'busted_refresh_token',
} as const

export function saveSession(userId: string, groupId: string, refreshToken?: string) {
  localStorage.setItem(KEYS.userId, userId)
  localStorage.setItem(KEYS.groupId, groupId)
  if (refreshToken) localStorage.setItem(KEYS.refreshToken, refreshToken)
}

export function getSession(): { userId: string; groupId: string; refreshToken: string | null } | null {
  const userId = localStorage.getItem(KEYS.userId)
  const groupId = localStorage.getItem(KEYS.groupId)
  if (!userId || !groupId) return null
  return { userId, groupId, refreshToken: localStorage.getItem(KEYS.refreshToken) }
}

export function clearSession() {
  localStorage.removeItem(KEYS.userId)
  localStorage.removeItem(KEYS.groupId)
  localStorage.removeItem(KEYS.refreshToken)
}
