const PALETTE = ['#4361EE', '#22c55e', '#f97316', '#FF5FCC', '#facc15', '#06b6d4', '#8b5cf6', '#ef4444']

export function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
