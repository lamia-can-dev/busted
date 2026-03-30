/** Canonical cell statuses used throughout the app */
export type CellStatus = 'unchecked' | 'pending_confirmation' | 'busted' | 'rejected'

/**
 * Normalize a raw cell status from the database.
 * Maps legacy values (pending_vote) to their canonical equivalents.
 */
export function normalizeStatus(raw: string | null | undefined): CellStatus {
  if (raw === 'busted' || raw === 'pending_vote') return 'busted'
  if (raw === 'pending_confirmation') return 'pending_confirmation'
  if (raw === 'rejected') return 'rejected'
  return 'unchecked'
}

/** Returns true if the cell counts as validated for scoring */
export function isValidated(status: string | null | undefined): boolean {
  return status === 'busted' || status === 'pending_vote'
}
