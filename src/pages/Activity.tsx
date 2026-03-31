import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import Logo from '../components/Logo'

// ─── Types ────────────────────────────────────────────────────

interface TargetedSubmission {
  id: string
  submitter_user_id: string
  proof_image_url: string | null
  created_at: string
  submitter: { id: string; username: string } | null
}

interface TargetedCell {
  id: string
  content: string | null
  status: string | null
  submissions: TargetedSubmission[]
}

interface MySubmission {
  id: string
  proof_image_url: string | null
  created_at: string
  cell: {
    content: string
    target_user_id: string
    status?: string
    target: { id: string; username: string } | null
  } | null
  votes: { voter_user_id: string; is_valid: boolean; created_at: string }[]
}

interface ApprovedProposal {
  id: string
  content: string
  created_at: string
  target: { id: string; username: string } | null
}

type NotifType = 'vote_required' | 'busted' | 'proof_validated' | 'proof_rejected' | 'proof_pending' | 'challenge_approved'

interface AppNotification {
  id: string
  type: NotifType
  text: string
  cellContent?: string | null
  timestamp: string
  isRead: boolean
  proofImageUrl?: string | null
  cellId?: string | null
  submissionId?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

const TYPE_COLORS: Record<NotifType, string> = {
  vote_required: 'var(--color-indigo)',
  busted: 'var(--color-rose)',
  proof_validated: 'var(--color-success)',
  proof_rejected: 'var(--color-text-secondary)',
  proof_pending: 'var(--color-indigo)',
  challenge_approved: 'var(--color-indigo)',
}

const TYPE_ICONS: Record<NotifType, string> = {
  vote_required: '🗳️',
  busted: '🎯',
  proof_validated: '✓',
  proof_rejected: '✗',
  proof_pending: '⏳',
  challenge_approved: '✦',
}

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem('busted_seen_notif_ids')
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem('busted_seen_notif_ids', JSON.stringify([...ids]))
  } catch {}
}

// ─── Main component ───────────────────────────────────────────

export default function Activity() {
  const { userId, groupId } = useAuth()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const [confirmingDenyId, setConfirmingDenyId] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    loadNotifications()

    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [])

  async function loadNotifications() {
    setLoading(true)
    setError(null)

    const [targetedRes, mySubmissionsRes, proposalsRes] = await Promise.all([
      // Cellules où JE suis la cible (RLS corrigée → requête directe)
      supabase
        .from('cells')
        .select(`
          id, content, status,
          submissions(
            id, submitter_user_id, proof_image_url, created_at,
            submitter:users!submitter_user_id(id, username)
          )
        `)
        .eq('target_user_id', userId!),
      // Mes soumissions (pour proof_validated / proof_rejected)
      supabase
        .from('submissions')
        .select(`
          id, proof_image_url, created_at,
          cell:cells(content, target_user_id, status, target:users!target_user_id(id, username)),
          votes(voter_user_id, is_valid, created_at)
        `)
        .eq('submitter_user_id', userId!),
      supabase
        .from('proposals')
        .select(`id, content, created_at, target:users!target_user_id(id, username)`)
        .eq('proposer_user_id', userId!)
        .eq('is_approved', true),
    ])

    if (targetedRes.error || mySubmissionsRes.error || proposalsRes.error) {
      setError('Erreur de chargement. Vérifie ta connexion.')
      setLoading(false)
      return
    }

    const notifs: AppNotification[] = []
    const seenIds = readSeenIds()

    // Notifications où je suis la cible
    const targetedCells = (targetedRes.data ?? []) as unknown as TargetedCell[]
    for (const cell of targetedCells) {
      const cellStatus = (cell.status ?? 'unchecked') as string
      const cellSubmissions = cell.submissions ?? []
      for (const s of cellSubmissions) {
        const submitter = s.submitter
        if (cellStatus === 'pending_confirmation') {
          const id = `vote_required_${s.id}`
          notifs.push({
            id,
            type: 'vote_required',
            text: `${submitter?.username ?? '?'} prétend t'avoir eu — à toi de valider`,
            cellContent: cell.content,
            timestamp: s.created_at,
            isRead: seenIds.has(id),
            proofImageUrl: s.proof_image_url,
            cellId: cell.id,
            submissionId: s.id,
          })
        } else if (cellStatus === 'busted') {
          const id = `busted_${s.id}`
          notifs.push({
            id,
            type: 'busted',
            text: `${submitter?.username ?? '?'} t'a eu ! 🎯`,
            cellContent: cell.content,
            timestamp: s.created_at,
            isRead: seenIds.has(id),
            proofImageUrl: s.proof_image_url,
          })
        } else if (cellStatus === 'rejected') {
          const id = `rejected_target_${s.id}`
          notifs.push({
            id,
            type: 'proof_rejected',
            text: `Tu as refusé la preuve de ${submitter?.username ?? '?'}`,
            cellContent: cell.content,
            timestamp: s.created_at,
            isRead: seenIds.has(id),
            proofImageUrl: s.proof_image_url,
          })
        }
      }
    }

    // Notifications où je suis le soumetteur
    const mySubmissions = (mySubmissionsRes.data ?? []) as unknown as MySubmission[]
    for (const s of mySubmissions) {
      const cell = s.cell
      const votes = s.votes ?? []
      const targetId = cell?.target_user_id ?? null
      const targetVote = votes.find((v) => v.voter_user_id === targetId)
      if (targetVote) {
        if (targetVote.is_valid) {
          const id = `proof_validated_${s.id}`
          notifs.push({
            id,
            type: 'proof_validated',
            text: `Ton pari sur ${cell?.target?.username ?? '?'} a été validé ✓`,
            cellContent: cell?.content,
            timestamp: targetVote.created_at,
            isRead: seenIds.has(id),
            proofImageUrl: s.proof_image_url,
          })
        } else {
          const id = `proof_rejected_${s.id}`
          notifs.push({
            id,
            type: 'proof_rejected',
            text: `Ton pari sur ${cell?.target?.username ?? '?'} a été rejeté`,
            cellContent: cell?.content,
            timestamp: targetVote.created_at,
            isRead: seenIds.has(id),
            proofImageUrl: s.proof_image_url,
          })
        }
      } else {
        // No vote yet — show "pending" notification for the submitter
        const id = `proof_pending_${s.id}`
        notifs.push({
          id,
          type: 'proof_pending',
          text: `Ta preuve pour ${cell?.target?.username ?? '?'} est en attente de validation`,
          cellContent: cell?.content,
          timestamp: s.created_at,
          isRead: seenIds.has(id),
          proofImageUrl: s.proof_image_url,
        })
      }
    }

    // Derive notifications from approved proposals (I wrote)
    const proposals = (proposalsRes.data ?? []) as unknown as ApprovedProposal[]
    for (const p of proposals) {
      const target = p.target
      const id = `challenge_approved_${p.id}`
      notifs.push({
        id,
        type: 'challenge_approved',
        text: `Ton défi sur ${target?.username ?? '?'} est dans les grilles !`,
        timestamp: p.created_at,
        isRead: seenIds.has(id),
      })
    }

    // Sort newest first
    notifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const unread = notifs.filter((n) => !n.isRead).length
    try { localStorage.setItem('busted_unread_count', String(unread)) } catch {}

    setNotifications(notifs)
    setLoading(false)

    // Mark all as read after 1.5s (debounced to avoid stale closures)
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current)
    markReadTimerRef.current = setTimeout(() => {
      const allIds = new Set([...readSeenIds(), ...notifs.map((n) => n.id)])
      saveSeenIds(allIds)
      try { localStorage.setItem('busted_unread_count', '0') } catch {}
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    }, 1500)

    subscribeRealtime()
  }

  async function handleConfirm(cellId: string, submissionId: string, notifId: string) {
    if (submittingRef.current) return
    submittingRef.current = true
    setActionLoading(notifId)
    await supabase.from('cells').update({ status: 'busted' }).eq('id', cellId)
    await supabase.from('votes').insert({
      submission_id: submissionId,
      voter_user_id: userId!,
      is_valid: true,
    })
    await loadNotifications()
    setActionLoading(null)
    submittingRef.current = false
    showToast('Confirmé ! La case est validée 🎯')
  }

  async function handleDeny(cellId: string, submissionId: string, notifId: string) {
    if (confirmingDenyId !== notifId) {
      setConfirmingDenyId(notifId)
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setActionLoading(notifId)
    await supabase.from('cells').update({ status: 'rejected' }).eq('id', cellId)
    await supabase.from('votes').insert({
      submission_id: submissionId,
      voter_user_id: userId!,
      is_valid: false,
    })
    await loadNotifications()
    setActionLoading(null)
    submittingRef.current = false
    setConfirmingDenyId(null)
    showToast('Preuve refusée.')
  }

  function subscribeRealtime() {
    if (channelRef.current) return
    channelRef.current = supabase
      .channel('activity-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, () => loadNotifications())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'submissions' }, () => loadNotifications())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, () => loadNotifications())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cells' }, () => loadNotifications())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proposals' }, () => loadNotifications())
      .subscribe()
  }

  return (
    <div style={styles.page}>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            style={styles.toast}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <header style={styles.header}>
        <Logo variant="full" />
      </header>

      {loading && <p style={styles.hint}>Chargement...</p>}

      {error && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={loadNotifications} style={styles.retryBtn}>Réessayer</button>
        </div>
      )}

      {!loading && !error && notifications.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Rien pour l'instant</p>
          <p style={styles.hint}>Reviens après la soirée 🎉</p>
        </div>
      )}

      <div style={styles.list}>
        <AnimatePresence initial={false}>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              style={styles.notifCard}
            >
              {/* Unread dot */}
              <div
                style={{
                  ...styles.unreadDot,
                  background: notif.isRead ? 'transparent' : 'var(--color-rose)',
                }}
              />

              {/* Icon circle */}
              <div
                style={{
                  ...styles.iconCircle,
                  background: TYPE_COLORS[notif.type] + '22',
                  color: TYPE_COLORS[notif.type],
                }}
              >
                {TYPE_ICONS[notif.type]}
              </div>

              {/* Body */}
              <div style={styles.notifBody}>
                <span style={styles.notifText}>{notif.text}</span>
                {notif.cellContent && (
                  <span style={styles.notifCell}>"{notif.cellContent}"</span>
                )}
                <span style={styles.notifTime}>{timeAgo(notif.timestamp)}</span>

                {notif.type === 'vote_required' && notif.cellId && notif.submissionId && (
                  <div style={styles.actionRow}>
                    <button
                      style={styles.confirmBtn}
                      disabled={actionLoading === notif.id}
                      onClick={() => handleConfirm(notif.cellId!, notif.submissionId!, notif.id)}
                    >
                      {actionLoading === notif.id ? '...' : 'Oui c\'est vrai 😅'}
                    </button>
                    <button
                      style={{
                        ...styles.denyBtn,
                        ...(confirmingDenyId === notif.id ? { borderColor: 'var(--color-error)', color: 'var(--color-error)' } : {}),
                      }}
                      disabled={actionLoading === notif.id}
                      onClick={() => handleDeny(notif.cellId!, notif.submissionId!, notif.id)}
                    >
                      {confirmingDenyId === notif.id ? 'Confirmer le refus ?' : "Non c'est faux"}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: 'var(--color-bg)',
    paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
  },
  header: {
    padding: '1.5rem 1.25rem 0.5rem',
    maxWidth: '560px',
    margin: '0 auto',
  },
  list: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  notifCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    background: 'var(--color-surface)',
    borderRadius: '12px',
    padding: '1.125rem 1rem',
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  iconCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.875rem',
    flexShrink: 0,
  },
  notifBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    flex: 1,
    minWidth: 0,
  },
  notifText: {
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    fontSize: '0.9375rem',
    color: 'var(--color-text-primary)',
    lineHeight: 1.4,
  },
  notifCell: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    fontStyle: 'italic',
    lineHeight: 1.3,
  },
  notifTime: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  emptyState: {
    textAlign: 'center',
    marginTop: '4rem',
  },
  emptyText: {
    color: 'var(--color-text-primary)',
    fontSize: '1rem',
    marginBottom: '0.5rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
  },
  hint: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '1rem',
  },
  actionRow: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.625rem',
  },
  confirmBtn: {
    flex: 1,
    background: '#1A2800',
    color: '#A0D000',
    border: '1px solid #4A6000',
    borderRadius: '10px',
    padding: '0.5rem 0.75rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.8125rem',
    cursor: 'pointer',
    minHeight: '36px',
  },
  denyBtn: {
    flex: 1,
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '0.5rem 0.75rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '0.8125rem',
    cursor: 'pointer',
    minHeight: '36px',
  },
  retryBtn: {
    background: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '0.5rem 1.25rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    marginTop: '0.75rem',
    minHeight: '36px',
  },
  toast: {
    position: 'fixed',
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#14532d',
    color: 'var(--color-success)',
    border: '1px solid var(--color-success)',
    borderRadius: '0.75rem',
    padding: '0.75rem 1.25rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    zIndex: 300,
    whiteSpace: 'nowrap',
    maxWidth: '90vw',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}
