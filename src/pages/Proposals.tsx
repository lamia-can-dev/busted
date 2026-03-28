import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import type { Proposal } from '../../supabase/types'

// ─── Vote tracking (localStorage) ────────────────────────────

const VOTED_KEY = 'busted_voted_proposals'

function getVotedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) ?? '[]')) }
  catch { return new Set() }
}

function markVoted(id: string) {
  const ids = getVotedIds()
  ids.add(id)
  localStorage.setItem(VOTED_KEY, JSON.stringify([...ids]))
}

// ─── Types ────────────────────────────────────────────────────

interface UserInfo {
  id: string
  username: string
  avatar_url: string | null
}

interface ProposalWithUsers extends Proposal {
  target: UserInfo | null
  proposer: UserInfo | null
}

// ─── Helpers ──────────────────────────────────────────────────

function Avatar({ user }: { user: UserInfo | null }) {
  if (!user) return null
  return user.avatar_url ? (
    <img src={user.avatar_url} style={avatarStyle} alt="" />
  ) : (
    <div style={{ ...avatarStyle, ...avatarFallbackStyle }}>
      {user.username[0].toUpperCase()}
    </div>
  )
}

const avatarStyle: React.CSSProperties = {
  width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover',
}
const avatarFallbackStyle: React.CSSProperties = {
  background: '#6c47ff', color: '#fff', fontSize: '0.75rem', fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

// ─── Main ─────────────────────────────────────────────────────

const THRESHOLD = 3

export default function Proposals() {
  const navigate = useNavigate()
  const session = getSession()
  const [proposals, setProposals] = useState<ProposalWithUsers[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [votedIds, setVotedIds] = useState<Set<string>>(getVotedIds)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!session) { navigate('/'); return }
    loadProposals()
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  async function loadProposals() {
    if (!session) return
    setLoading(true)

    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        target:users!target_user_id(id, username, avatar_url),
        proposer:users!proposer_user_id(id, username, avatar_url)
      `)
      .eq('group_id', session.groupId)
      .neq('target_user_id', session.userId)
      .order('vote_count', { ascending: false })

    if (!error && data) setProposals(data as unknown as ProposalWithUsers[])
    setLoading(false)
    subscribeRealtime()
  }

  function subscribeRealtime() {
    channelRef.current = supabase
      .channel('proposals-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'proposals' },
        async (payload) => {
          if (!session) return
          // Ignorer les nouvelles propositions qui ciblent l'utilisateur courant
          if (payload.new.target_user_id === session.userId) return
          const { data } = await supabase
            .from('proposals')
            .select(`*, target:users!target_user_id(id, username, avatar_url), proposer:users!proposer_user_id(id, username, avatar_url)`)
            .eq('id', payload.new.id)
            .single()
          if (data) setProposals((prev) => [data as unknown as ProposalWithUsers, ...prev])
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'proposals' },
        (payload) => {
          if (!session) return
          if (payload.new.target_user_id === session.userId) return
          setProposals((prev) =>
            prev.map((p) => p.id === payload.new.id ? { ...p, ...payload.new } : p)
          )
        }
      )
      .subscribe()
  }

  async function vote(proposal: ProposalWithUsers) {
    if (!session) return

    // Marquer comme voté avant l'appel réseau
    markVoted(proposal.id)
    setVotedIds((prev) => new Set([...prev, proposal.id]))

    const newCount = proposal.vote_count + 1
    const isApproved = newCount >= THRESHOLD

    // Optimistic update
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposal.id ? { ...p, vote_count: newCount, is_approved: isApproved } : p
      )
    )

    if (isApproved) {
      showToast(`✓ "${proposal.content.slice(0, 40)}${proposal.content.length > 40 ? '…' : ''}" est approuvé !`)
    }

    const { error } = await supabase
      .from('proposals')
      .update({ vote_count: newCount, is_approved: isApproved })
      .eq('id', proposal.id)

    if (error) {
      console.error('[Proposals] vote update error:', error)
      // Rollback optimistic update
      setProposals((prev) =>
        prev.map((p) => p.id === proposal.id ? { ...p, vote_count: proposal.vote_count, is_approved: proposal.is_approved } : p)
      )
    }
  }

  if (!session) return null

  const pending = proposals.filter((p) => !p.is_approved)
  const approved = proposals.filter((p) => p.is_approved)

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
        <h1 style={styles.title}>Pool de paris</h1>
      </header>

      {loading && <p style={styles.hint}>Chargement...</p>}

      {!loading && proposals.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Aucun pari pour l'instant.</p>
          <p style={styles.hint}>Utilise le "+" sur la grille pour en créer un.</p>
        </div>
      )}

      <div style={styles.list}>
        {pending.length > 0 && (
          <Section title="En attente">
            <AnimatePresence>
              {pending.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <ProposalCard
                    proposal={p}
                    userId={session.userId}
                    votedIds={votedIds}
                    onVote={vote}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </Section>
        )}

        {approved.length > 0 && (
          <Section title={`Approuvées (${approved.length})`}>
            {approved.map((p) => (
              <ProposalCard key={p.id} proposal={p} userId={session.userId} votedIds={votedIds} onVote={vote} />
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  )
}

// ─── ProposalCard ─────────────────────────────────────────────

function ProposalCard({
  proposal,
  userId,
  votedIds,
  onVote,
}: {
  proposal: ProposalWithUsers
  userId: string
  votedIds: Set<string>
  onVote: (p: ProposalWithUsers) => void
}) {
  const isOwn = proposal.proposer_user_id === userId
  const alreadyVoted = votedIds.has(proposal.id)
  const canVote = !isOwn && !proposal.is_approved && !alreadyVoted
  const progress = Math.min((proposal.vote_count / THRESHOLD) * 100, 100)

  return (
    <motion.div
      animate={{
        borderColor: proposal.is_approved ? '#22c55e' : '#2a2a2a',
        backgroundColor: proposal.is_approved ? '#0d2018' : '#1a1a1a',
      }}
      style={styles.card}
    >
      <div style={styles.cardHeader}>
        <div style={styles.targetRow}>
          <Avatar user={proposal.target} />
          <span style={styles.targetName}>{proposal.target?.username ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isOwn && <span style={styles.ownBadge}>Ma proposition</span>}
          {proposal.is_approved && <span style={styles.approvedBadge}>Approuvée ✓</span>}
        </div>
      </div>

      <p style={styles.content}>"{proposal.content}"</p>

      <div style={styles.proposerRow}>
        <Avatar user={proposal.proposer} />
        <span style={styles.proposerName}>proposé par {proposal.proposer?.username ?? '—'}</span>
      </div>

      <div style={styles.progressTrack}>
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            ...styles.progressBar,
            background: proposal.is_approved ? '#22c55e' : '#6c47ff',
          }}
        />
      </div>

      <div style={styles.footer}>
        <span style={styles.voteCount}>
          {proposal.vote_count} / {THRESHOLD} votes
        </span>
        {!proposal.is_approved && (
          <button
            onClick={() => canVote && onVote(proposal)}
            disabled={!canVote}
            style={{
              ...styles.voteBtn,
              ...(canVote ? {} : styles.voteBtnDisabled),
            }}
          >
            {isOwn ? 'Ta proposition' : alreadyVoted ? 'Déjà voté' : 'Voter'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Styles ───────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    paddingBottom: '6rem',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    padding: '1.5rem 1rem 0.5rem',
    maxWidth: '560px',
    margin: '0 auto',
  },
  title: {
    color: '#fff',
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: 0,
  },
  list: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  sectionTitle: {
    color: '#555',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
  },
  card: {
    border: '1px solid #2a2a2a',
    borderRadius: '1.25rem',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  targetName: {
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  content: {
    color: '#ccc',
    fontSize: '0.95rem',
    fontStyle: 'italic',
    lineHeight: 1.5,
    margin: 0,
  },
  proposerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  proposerName: {
    color: '#555',
    fontSize: '0.8rem',
  },
  progressTrack: {
    height: '4px',
    background: '#2a2a2a',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: '2px',
    width: '0%',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voteCount: {
    color: '#555',
    fontSize: '0.8rem',
  },
  voteBtn: {
    background: '#6c47ff',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.4rem 0.875rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  voteBtnDisabled: {
    background: 'transparent',
    color: '#444',
    cursor: 'not-allowed',
  },
  ownBadge: {
    background: '#1e1e1e',
    color: '#666',
    fontSize: '0.7rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
    border: '1px solid #333',
  },
  approvedBadge: {
    background: '#14532d',
    color: '#22c55e',
    fontSize: '0.7rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
    border: '1px solid #22c55e',
  },
  toast: {
    position: 'fixed',
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#14532d',
    color: '#22c55e',
    border: '1px solid #22c55e',
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
  emptyState: {
    textAlign: 'center',
    marginTop: '4rem',
  },
  emptyText: {
    color: '#ccc',
    fontSize: '1rem',
    marginBottom: '0.5rem',
  },
  hint: {
    color: '#555',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '1rem',
  },
}
