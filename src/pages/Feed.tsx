import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import type { Vote } from '../../supabase/types'

// ─── Types ────────────────────────────────────────────────────

interface Submitter {
  id: string
  username: string
  avatar_url: string | null
}

interface CellInfo {
  id: string
  content: string | null
  target: { id: string; username: string } | null
}

interface SubmissionWithDetails {
  id: string
  cell_id: string
  submitter_user_id: string
  proof_text: string | null
  proof_image_url: string | null
  created_at: string
  cell: CellInfo | null
  submitter: Submitter | null
  votes: Vote[]
}

// ─── Helpers ──────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

// ─── Main component ───────────────────────────────────────────

export default function Feed() {
  const navigate = useNavigate()
  const session = getSession()

  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!session) { navigate('/'); return }
    loadFeed()

    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [])

  async function loadFeed() {
    if (!session) return
    setLoading(true)

    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        cell:cells(id, content, target:users!target_user_id(id, username)),
        submitter:users!submitter_user_id(id, username, avatar_url),
        votes(*)
      `)
      .order('created_at', { ascending: false })

    console.log('[Feed] data:', JSON.stringify(data?.[0], null, 2), 'error:', error)
    if (!error && data) {
      setSubmissions(data as unknown as SubmissionWithDetails[])
    }

    setLoading(false)
    subscribeRealtime()
  }

  function subscribeRealtime() {
    channelRef.current = supabase
      .channel('feed-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'submissions' },
        async (payload) => {
          // Charger les détails complets de la nouvelle submission
          const { data } = await supabase
            .from('submissions')
            .select(`
              *,
              cell:cells(id, content, target:users!target_user_id(id, username)),
              submitter:users!submitter_user_id(id, username, avatar_url),
              votes(*)
            `)
            .eq('id', payload.new.id)
            .single()

          if (data) {
            setSubmissions((prev) => [data as unknown as SubmissionWithDetails, ...prev])
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes' },
        (payload) => {
          const newVote = payload.new as Vote
          if (newVote.voter_user_id === session?.userId) return
          setSubmissions((prev) =>
            prev.map((s) =>
              s.id === newVote.submission_id
                ? { ...s, votes: [...s.votes, newVote] }
                : s
            )
          )
        }
      )
      .subscribe()
  }

  async function castVote(submissionId: string, isValid: boolean) {
    if (!session) return

    // Optimistic update
    const tempVote: Vote = {
      id: crypto.randomUUID(),
      submission_id: submissionId,
      voter_user_id: session.userId,
      is_valid: isValid,
      created_at: new Date().toISOString(),
    }
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === submissionId ? { ...s, votes: [...s.votes, tempVote] } : s
      )
    )

    const { error } = await supabase.from('votes').insert({
      submission_id: submissionId,
      voter_user_id: session.userId,
      is_valid: isValid,
    })
    if (error) console.error('[Vote] insert error:', error)
  }

  if (!session) return null

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Feed</h1>
      </header>

      {loading && <p style={styles.hint}>Chargement...</p>}

      {!loading && submissions.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Aucune preuve pour le moment.</p>
          <p style={styles.hint}>Soumets une preuve depuis ta grille !</p>
        </div>
      )}

      <div style={styles.list}>
        <AnimatePresence initial={false}>
          {submissions.map((s) => (
            <motion.div
              key={s.id}
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            >
              <SubmissionCard
                submission={s}
                userId={session.userId}
                onVote={castVote}
                onImageClick={setLightboxUrl}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Lightbox photo */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxUrl(null)}
            style={styles.lightbox}
          >
            <img src={lightboxUrl} style={styles.lightboxImg} alt="preuve" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── SubmissionCard ───────────────────────────────────────────

function SubmissionCard({
  submission,
  userId,
  onVote,
  onImageClick,
}: {
  submission: SubmissionWithDetails
  userId: string
  onVote: (id: string, valid: boolean) => void
  onImageClick: (url: string) => void
}) {
  const targetUserId = submission.cell?.target?.id ?? null
  const targetVote = submission.votes.find((v) => v.voter_user_id === targetUserId)
  const isValidated = targetVote?.is_valid === true
  const isContested = targetVote?.is_valid === false
  const isTarget = userId === targetUserId
  const isOwn = submission.submitter_user_id === userId
  const hasVoted = !!targetVote

  return (
    <motion.div
      animate={{
        borderColor: isValidated ? '#22c55e' : isContested ? '#ef4444' : '#2a2a2a',
        backgroundColor: isValidated ? '#0d2018' : isContested ? '#2a1010' : '#1a1a1a',
      }}
      transition={{ duration: 0.5 }}
      style={styles.card}
    >
      {/* Header */}
      <div style={styles.cardHeader}>
        <div style={styles.submitterRow}>
          {submission.submitter?.avatar_url ? (
            <img src={submission.submitter.avatar_url} style={styles.avatar} alt="" />
          ) : (
            <div style={styles.avatarFallback}>
              {(submission.submitter?.username?.[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div>
            <span style={styles.username}>{submission.submitter?.username ?? '—'}</span>
            <span style={styles.timestamp}>{timeAgo(submission.created_at)}</span>
          </div>
        </div>
        {isValidated && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={styles.validatedBadge}>
            Validé ✓
          </motion.span>
        )}
        {isContested && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={styles.contestedBadge}>
            Contesté ✗
          </motion.span>
        )}
      </div>

      {/* Contenu de la case */}
      {submission.cell?.content && (
        <div style={styles.cellContent}>
          <span style={styles.cellLabel}>
            Pari sur {submission.cell.target?.username ?? '—'}
          </span>
          <p style={styles.cellText}>"{submission.cell.content}"</p>
        </div>
      )}

      {/* Preuve texte */}
      {submission.proof_text && (
        <p style={styles.proofText}>{submission.proof_text}</p>
      )}

      {/* Preuve photo */}
      {submission.proof_image_url && (
        <img
          src={submission.proof_image_url}
          style={styles.proofImage}
          onClick={() => onImageClick(submission.proof_image_url!)}
          alt="preuve"
        />
      )}

      {/* Actions / statut */}
      {isTarget && !hasVoted && (
        <div style={styles.voteButtons}>
          <VoteButton
            label="✓ Valider"
            active={false}
            disabled={false}
            variant="valid"
            onClick={() => onVote(submission.id, true)}
          />
          <VoteButton
            label="✗ Contester"
            active={false}
            disabled={false}
            variant="invalid"
            onClick={() => onVote(submission.id, false)}
          />
        </div>
      )}

      {!isValidated && !isContested && !isTarget && !isOwn && (
        <p style={styles.ownNote}>
          En attente de {submission.cell?.target?.username ?? 'la personne ciblée'}
        </p>
      )}

      {isOwn && !hasVoted && (
        <p style={styles.ownNote}>
          En attente de validation par {submission.cell?.target?.username ?? '—'}
        </p>
      )}
    </motion.div>
  )
}

function VoteButton({
  label,
  active,
  disabled,
  variant,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  variant: 'valid' | 'invalid'
  onClick: () => void
}) {
  const activeColor = variant === 'valid' ? '#22c55e' : '#ef4444'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.voteBtn,
        borderColor: active ? activeColor : '#333',
        color: active ? activeColor : disabled ? '#444' : '#888',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
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
    gap: '1rem',
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
  submitterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  avatarFallback: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#6c47ff',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  username: {
    display: 'block',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  timestamp: {
    display: 'block',
    color: '#555',
    fontSize: '0.75rem',
  },
  validatedBadge: {
    background: '#14532d',
    color: '#22c55e',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.25rem 0.625rem',
    borderRadius: '999px',
    border: '1px solid #22c55e',
  },
  contestedBadge: {
    background: '#3b0e0e',
    color: '#ef4444',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.25rem 0.625rem',
    borderRadius: '999px',
    border: '1px solid #ef4444',
  },
  cellContent: {
    background: '#111',
    borderRadius: '0.75rem',
    padding: '0.75rem 1rem',
  },
  cellLabel: {
    color: '#555',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    display: 'block',
    marginBottom: '0.25rem',
  },
  cellText: {
    color: '#ccc',
    fontSize: '0.9rem',
    fontStyle: 'italic',
    margin: 0,
    lineHeight: 1.4,
  },
  proofText: {
    color: '#e0e0e0',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    margin: 0,
  },
  proofImage: {
    width: '100%',
    borderRadius: '0.75rem',
    objectFit: 'cover',
    maxHeight: '280px',
    cursor: 'zoom-in',
  },
  voteButtons: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end',
  },
  voteBtn: {
    background: 'transparent',
    border: '1px solid',
    borderRadius: '0.5rem',
    padding: '0.4rem 0.75rem',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  ownNote: {
    color: '#444',
    fontSize: '0.75rem',
    margin: 0,
    textAlign: 'center',
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
  lightbox: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    cursor: 'zoom-out',
  },
  lightboxImg: {
    maxWidth: '95vw',
    maxHeight: '90vh',
    borderRadius: '0.75rem',
    objectFit: 'contain',
  },
}
