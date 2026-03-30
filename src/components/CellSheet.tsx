import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'

type CellStatus = 'unchecked' | 'pending_confirmation' | 'pending_vote' | 'busted' | 'rejected'

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
  const session = getSession()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const isTarget    = session?.userId === cell.target_user_id
  const isSubmitter = session?.userId === cell.submission?.submitter_user_id
  const isPendingConfirmation = cell.status === 'pending_confirmation'

  async function handleConfirm() {
    setLoading(true)
    await supabase.from('cells').update({ status: 'pending_vote' }).eq('id', cell.id)
    setToast('Tu as confirmé ! Le groupe va maintenant voter.')
    setTimeout(() => onUpdated(), 1800)
  }

  async function handleDeny() {
    setLoading(true)
    await supabase.from('cells').update({ status: 'unchecked' }).eq('id', cell.id)
    if (cell.submission) {
      await supabase.from('submissions').delete().eq('id', cell.submission.id)
    }
    onUpdated()
  }

  const isBusted = cell.status === 'busted'

  // ─── Bannière d'état ───────────────────────────────────────
  const statusBanner =
    cell.status === 'pending_confirmation'
      ? { text: 'En attente de validation', bg: 'rgba(99,102,241,0.15)', color: '#818CF8', border: '#6366F1' }
    : cell.status === 'pending_vote'
      ? { text: 'Vote en cours', bg: 'rgba(80,120,0,0.15)', color: '#A0D000', border: '#4A6000' }
    : cell.status === 'rejected'
      ? { text: 'Rejeté', bg: 'rgba(120,120,170,0.1)', color: '#7878AA', border: '#3A3A5A' }
    : null

  // ─── Badge dans la ligne avatar ────────────────────────────
  const roleBadge =
    isPendingConfirmation && isTarget
      ? { text: 'On parle de toi !', bg: '#2D0F2A', border: '#FF5FCC', color: '#FF5FCC' }
    : isPendingConfirmation && isSubmitter
      ? { text: 'En attente de confirmation', bg: '#12122A', border: '#4338CA', color: '#A5B4FC' }
    : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={styles.backdrop}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...styles.sheet,
          ...(isBusted ? { background: '#1A0A14', borderTop: '1.5px solid #FF5FCC' } : {}),
        }}
      >
          <div style={styles.handle} />

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
            {cell.target?.avatar_url ? (
              <img src={cell.target.avatar_url} style={styles.avatar} alt="" />
            ) : (
              <div style={styles.avatarFallback}>
                {cell.target?.username[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <span style={styles.username}>{cell.target?.username ?? '—'}</span>
            {roleBadge && (
              <span style={{ ...styles.badge, background: roleBadge.bg, border: `1px solid ${roleBadge.border}`, color: roleBadge.color }}>
                {roleBadge.text}
              </span>
            )}
            {isBusted && (
              <span style={styles.badgeBusted}>Busted !</span>
            )}
            {cell.status === 'unchecked' && (
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
            {(cell.status === 'unchecked' || cell.status == null) && (
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
                <button onClick={handleDeny} disabled={loading} style={styles.denyBtn}>
                  Non c'est faux
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
        </motion.div>
      </motion.div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    background: '#1A1A2E',
    borderRadius: '20px 20px 0 0',
    padding: '0.75rem 1.5rem 2.5rem',
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
  },
  handle: {
    width: '32px',
    height: '3px',
    background: '#3A3A5A',
    borderRadius: '2px',
    margin: '0 auto 1.25rem',
  },
  toast: {
    background: '#22c55e',
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
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  avatarFallback: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--color-indigo)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  username: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    color: '#F0F0FF',
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
    background: '#0F0F1A',
    color: '#7878AA',
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
    color: '#F0F0FF',
    lineHeight: 1.5,
    margin: '0 0 1rem',
  },
  proofCard: {
    background: '#0F0F1A',
    border: '1px solid #3A3A5A',
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
    color: '#7878AA',
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
    background: '#4338CA',
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
    background: '#1A1A2E',
    color: '#7878AA',
    border: '1px solid #3A3A5A',
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
    color: '#7878AA',
    border: '1px solid #3A3A5A',
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
    color: '#7878AA',
    textAlign: 'center' as const,
    margin: '0.25rem 0',
    lineHeight: 1.5,
  },
}
