import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { CellStatus } from '../lib/cellStatus'
import BottomSheet from './BottomSheet'
import Avatar from './Avatar'

interface CellSheetCell {
  id: string
  content: string | null
  target_user_id: string
  status: CellStatus
  target: { username: string; avatar_url?: string | null } | null
  submission: {
    id: string
    submitter_user_id: string
    proof_text: string | null
    proof_image_url: string | null
    created_at: string
  } | null
}

interface Props {
  cell: CellSheetCell
  onClose: () => void
  onSubmitProof: () => void
  onUpdated: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CellSheet({ cell, onClose, onSubmitProof, onUpdated }: Props) {
  const { userId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmingDeny, setConfirmingDeny] = useState(false)
  const submittingRef = useRef(false)

  // Status is already normalized by Game.tsx via normalizeStatus()
  const effectiveStatus = cell.status
  const isBusted = effectiveStatus === 'busted'

  const isTarget    = userId === cell.target_user_id
  const isSubmitter = userId === cell.submission?.submitter_user_id
  const isPendingConfirmation = effectiveStatus === 'pending_confirmation'

  async function handleConfirm() {
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    await supabase.from('cells').update({ status: 'busted' }).eq('id', cell.id)
    if (cell.submission) {
      await supabase.from('votes').insert({
        submission_id: cell.submission.id,
        voter_user_id: userId!,
        is_valid: true,
      })
    }
    setToast('Confirmé ! La case est validée 🎯')
    setTimeout(() => onUpdated(), 1800)
  }

  async function handleDeny() {
    if (!confirmingDeny) {
      setConfirmingDeny(true)
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    await supabase.from('cells').update({ status: 'rejected' }).eq('id', cell.id)
    if (cell.submission) {
      await supabase.from('votes').insert({
        submission_id: cell.submission.id,
        voter_user_id: userId!,
        is_valid: false,
      })
    }
    setToast('Preuve refusée.')
    setTimeout(() => onUpdated(), 1200)
  }

  // ─── Bannière d'état ───────────────────────────────────────
  const statusBanner =
    effectiveStatus === 'pending_confirmation'
      ? { text: 'En attente de validation', bg: 'rgba(99,102,241,0.15)', color: '#818CF8', border: '#6366F1' }
    : effectiveStatus === 'rejected'
      ? { text: 'Rejeté', bg: 'rgba(120,120,170,0.1)', color: 'var(--color-muted)', border: 'var(--color-border)' }
    : null

  // ─── Badge dans la ligne avatar ────────────────────────────
  const roleBadge =
    isPendingConfirmation && isTarget
      ? { text: 'On parle de toi !', bg: '#2D0F2A', border: '#FF5FCC', color: '#FF5FCC' }
    : isPendingConfirmation && isSubmitter
      ? { text: 'En attente de confirmation', bg: '#12122A', border: 'var(--color-indigo)', color: '#A5B4FC' }
    : null

  return (
      <BottomSheet
        onClose={onClose}
        background={isBusted ? '#1A0A14' : undefined}
        borderTop={isBusted ? '1.5px solid #FF5FCC' : undefined}
      >

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={styles.toast}
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bannière d'état */}
          {statusBanner && (
            <div style={{ ...styles.statusBanner, background: statusBanner.bg, color: statusBanner.color, border: `1px solid ${statusBanner.border}` }}>
              {statusBanner.text}
            </div>
          )}

          {/* Avatar + pseudo + badge */}
          <div style={styles.targetRow}>
            <Avatar
              src={cell.target?.avatar_url}
              name={cell.target?.username ?? '?'}
              userId={cell.target_user_id}
              size={40}
            />
            <span style={styles.username}>{cell.target?.username ?? '—'}</span>
            {roleBadge && (
              <span style={{ ...styles.badge, background: roleBadge.bg, border: `1px solid ${roleBadge.border}`, color: roleBadge.color }}>
                {roleBadge.text}
              </span>
            )}
            {isBusted && (
              <span style={styles.badgeBusted}>Busted !</span>
            )}
            {effectiveStatus === 'unchecked' && (
              <span style={styles.badgeNeutral}>Non cochée</span>
            )}
          </div>

          {/* Texte du défi */}
          <p style={styles.content}>{cell.content}</p>

          {/* Carte de preuve */}
          {cell.submission && (cell.submission.proof_text || cell.submission.proof_image_url) && (
            <div style={styles.proofCard}>
              <p style={styles.proofLabel}>
                {isBusted
                  ? `Preuve validée par le groupe · ${formatDate(cell.submission.created_at)}`
                  : 'Preuve soumise'}
              </p>
              {cell.submission.proof_text && (
                <p style={styles.proofText}>{cell.submission.proof_text}</p>
              )}
              {cell.submission.proof_image_url && (
                <img
                  src={cell.submission.proof_image_url}
                  style={isBusted ? styles.proofImageFull : styles.proofThumb}
                  alt="preuve"
                />
              )}
            </div>
          )}

          {/* Actions selon rôle */}
          <div style={styles.actions}>
            {/* ── Case vide : soumettre une preuve ── */}
            {(effectiveStatus === 'unchecked' || effectiveStatus === 'rejected' || effectiveStatus == null) && (
              <button onClick={onSubmitProof} style={styles.primaryBtn}>
                Soumettre une preuve
              </button>
            )}

            {/* ── pending_confirmation : cible ── */}
            {isPendingConfirmation && isTarget && (
              <>
                <button onClick={handleConfirm} disabled={loading} style={styles.confirmBtn}>
                  Oui c'est vrai 😅
                </button>
                <button onClick={handleDeny} disabled={loading} style={{
                  ...styles.denyBtn,
                  ...(confirmingDeny ? { borderColor: 'var(--color-error)', color: 'var(--color-error)' } : {}),
                }}>
                  {confirmingDeny ? 'Confirmer le refus ?' : "Non c'est faux"}
                </button>
              </>
            )}

            {/* ── pending_confirmation : soumetteur ── */}
            {isPendingConfirmation && isSubmitter && (
              <p style={styles.infoMsg}>
                On attend que <strong>{cell.target?.username ?? '…'}</strong> confirme que c'est bien arrivé.
              </p>
            )}

            {/* ── pending_confirmation : autre membre ── */}
            {isPendingConfirmation && !isTarget && !isSubmitter && (
              <p style={styles.infoMsg}>
                <strong>{cell.target?.username ?? '…'}</strong> doit d'abord confirmer.
              </p>
            )}

            <button onClick={onClose} style={styles.cancelBtn}>Fermer</button>
          </div>
      </BottomSheet>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    background: 'var(--color-success)',
    color: '#fff',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    borderRadius: '10px',
    padding: '0.625rem 1rem',
    textAlign: 'center' as const,
    marginBottom: '1rem',
  },
  statusBanner: {
    borderRadius: '10px',
    padding: '0.625rem 1rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    textAlign: 'center' as const,
    marginBottom: '1.25rem',
  },
  targetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    flexWrap: 'wrap' as const,
  },
  username: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    color: 'var(--color-text-primary)',
    flex: 1,
  },
  badge: {
    fontSize: '0.75rem',
    fontWeight: 700,
    fontFamily: 'var(--font-body)',
    borderRadius: '999px',
    padding: '0.25rem 0.625rem',
    flexShrink: 0,
  },
  badgeBusted: {
    background: '#FF5FCC',
    color: '#fff',
    fontSize: '0.8125rem',
    fontWeight: 900,
    fontFamily: 'var(--font-title)',
    borderRadius: '999px',
    padding: '0.25rem 0.75rem',
    flexShrink: 0,
    letterSpacing: '0.02em',
  },
  badgeNeutral: {
    background: 'var(--color-bg)',
    color: 'var(--color-muted)',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
    borderRadius: '999px',
    padding: '0.25rem 0.625rem',
    flexShrink: 0,
  },
  content: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    lineHeight: 1.5,
    margin: '0 0 1rem',
  },
  proofCard: {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  proofLabel: {
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '0.75rem',
    color: 'var(--color-muted)',
    margin: 0,
    letterSpacing: '0.02em',
  },
  proofThumb: {
    width: '60px',
    height: '60px',
    borderRadius: '8px',
    objectFit: 'cover',
    flexShrink: 0,
  },
  proofImageFull: {
    width: '100%',
    maxHeight: '120px',
    borderRadius: '8px',
    objectFit: 'cover',
  },
  proofText: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.8125rem',
    color: '#A0A0C0',
    lineHeight: 1.5,
    margin: 0,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  primaryBtn: {
    background: 'var(--color-indigo)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '13px',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  confirmBtn: {
    background: '#1A2800',
    color: '#A0D000',
    border: '1px solid #4A6000',
    borderRadius: '13px',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  denyBtn: {
    background: 'var(--color-surface)',
    color: 'var(--color-muted)',
    border: '1px solid var(--color-border)',
    borderRadius: '13px',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  cancelBtn: {
    background: 'transparent',
    color: 'var(--color-muted)',
    border: '1px solid var(--color-border)',
    borderRadius: '13px',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  infoMsg: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.875rem',
    color: 'var(--color-muted)',
    textAlign: 'center' as const,
    margin: '0.25rem 0',
    lineHeight: 1.5,
  },
}
