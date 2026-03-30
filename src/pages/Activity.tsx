import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import Logo from '../components/Logo'

// ─── Types ────────────────────────────────────────────────────

type NotifType = 'vote_required' | 'busted' | 'proof_validated' | 'proof_rejected' | 'challenge_approved'

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
  proof_validated: '#22c55e',
  proof_rejected: 'var(--color-text-secondary)',
  challenge_approved: 'var(--color-indigo)',
}

const TYPE_ICONS: Record<NotifType, string> = {
  vote_required: '🗳️',
  busted: '🎯',
  proof_validated: '✓',
  proof_rejected: '✗',
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
  const navigate = useNavigate()
  const session = getSession()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!session) { navigate('/'); return }
    loadNotifications()

    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [])

  async function loadNotifications() {
    if (!session) return
    setLoading(true)

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
        .eq('target_user_id', session.userId),
      // Mes soumissions (pour proof_validated / proof_rejected)
      supabase
        .from('submissions')
        .select(`
          id, proof_image_url, created_at,
          cell:cells(content, target_user_id, target:users!target_user_id(id, username)),
          votes(voter_user_id, is_valid, created_at)
        `)
        .eq('submitter_user_id', session.userId),
      supabase
        .from('proposals')
        .select(`id, content, created_at, target:users!target_user_id(id, username)`)
        .eq('proposer_user_id', session.userId)
        .eq('is_approved', true),
    ])

    const notifs: AppNotification[] = []
    const seenIds = readSeenIds()

    // Notifications où je suis la cible
    const targetedCells = (targetedRes.data ?? []) as any[]
    for (const cell of targetedCells) {
      const cellStatus = (cell.status ?? 'unchecked') as string
      const cellSubmissions = (cell.submissions ?? []) as any[]
      for (const s of cellSubmissions) {
        const submitter = s.submitter as { id: string; username: string } | null
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
        }
      }
    }

    // Notifications où je suis le soumetteur
    const mySubmissions = (mySubmissionsRes.data ?? []) as any[]
    for (const s of mySubmissions) {
      const cell = s.cell as { content: string; target_user_id: string; target: { id: string; username: string } | null } | null
      const votes = (s.votes ?? []) as { voter_user_id: string; is_valid: boolean; created_at: string }[]
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
      }
    }

    // Derive notifications from approved proposals (I wrote)
    const proposals = (proposalsRes.data ?? []) as any[]
    for (const p of proposals) {
      const target = p.target as { id: string; username: string } | null
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

    // Mark all as read after 1.5s
    setTimeout(() => {
      const allIds = new Set([...seenIds, ...notifs.map((n) => n.id)])
      saveSeenIds(allIds)
      try { localStorage.setItem('busted_unread_count', '0') } catch {}
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    }, 1500)

    subscribeRealtime()
  }

  async function handleConfirm(cellId: string, notifId: string) {
    setActionLoading(notifId)
    await supabase.from('cells').update({ status: 'pending_vote' }).eq('id', cellId)
    await loadNotifications()
    setActionLoading(null)
  }

  async function handleDeny(cellId: string, submissionId: string, notifId: string) {
    setActionLoading(notifId)
    await supabase.from('cells').update({ status: 'unchecked' }).eq('id', cellId)
    await supabase.from('submissions').delete().eq('id', submissionId)
    await loadNotifications()
    setActionLoading(null)
  }

  function subscribeRealtime() {
    channelRef.current = supabase
      .channel('activity-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, () => loadNotifications())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'submissions' }, () => loadNotifications())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, () => loadNotifications())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cells' }, () => loadNotifications())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proposals' }, () => loadNotifications())
      .subscribe()
  }

  if (!session) return null

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Logo variant="full" />
      </header>

      {loading && <p style={styles.hint}>Chargement...</p>}

      {!loading && notifications.length === 0 && (
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
                      onClick={() => handleConfirm(notif.cellId!, notif.id)}
                    >
                      {actionLoading === notif.id ? '...' : 'Oui c\'est vrai 😅'}
                    </button>
                    <button
                      style={styles.denyBtn}
                      disabled={actionLoading === notif.id}
                      onClick={() => handleDeny(notif.cellId!, notif.submissionId!, notif.id)}
                    >
                      Non c'est faux
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
    minHeight: '100vh',
    background: 'var(--color-bg)',
    paddingBottom: '6rem',
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
}
