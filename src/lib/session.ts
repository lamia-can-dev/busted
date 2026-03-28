const KEYS = {
  userId: 'busted_user_id',
  groupId: 'busted_group_id',
} as const

export function saveSession(userId: string, groupId: string) {
  localStorage.setItem(KEYS.userId, userId)
  localStorage.setItem(KEYS.groupId, groupId)
}

export function getSession(): { userId: string; groupId: string } | null {
  const userId = localStorage.getItem(KEYS.userId)
  const groupId = localStorage.getItem(KEYS.groupId)
  if (!userId || !groupId) return null
  return { userId, groupId }
}

export function clearSession() {
  localStorage.removeItem(KEYS.userId)
  localStorage.removeItem(KEYS.groupId)
}
