import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import { currentWeekStart, generateGroupSuggestions } from '../lib/suggestChallenges'
import type { Proposal, Suggestion } from '../../supabase/types'
import Logo from '../components/Logo'
import ProposeCell from '../components/ProposeCell'

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

interface SuggestionWithTarget extends Suggestion {
  target: UserInfo | null
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
  background: 'var(--color-indigo)', color: 'var(--color-text-primary)', fontSize: '0.75rem', fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

// ─── Main ─────────────────────────────────────────────────────

const THRESHOLD = 1

export default function Proposals() {
  const navigate = useNavigate()
  const session = getSession()
  const [proposals, setProposals] = useState<ProposalWithUsers[]>([])
  const [suggestions, setSuggestions] = useState<SuggestionWithTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending')
  const [showProposeCell, setShowProposeCell] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [votedIds, setVotedIds] = useState<Set<string>>(getVotedIds)
  const [suggestionIdx, setSuggestionIdx] = useState(0)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const suggestionsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!session) { navigate('/'); return }
    loadProposals()
    loadSuggestions()
    return () => {
      channelRef.current?.unsubscribe()
      suggestionsChannelRef.current?.unsubscribe()
    }
  }, [])

  async function loadSuggestions() {
    if (!session) return
    const weekStart = currentWeekStart()

    // Additive: generates only for members without suggestions this week
    await generateGroupSuggestions(session.groupId, weekStart)

    const { data } = await supabase
      .from('suggestions')
      .select('*, target:users!target_user_id(id, username, avatar_url)')
      .eq('group_id', session.groupId)
      .neq('target_user_id', session.userId)
      .eq('is_available', true)
      .order('target_user_id')

    const all = (data ?? []) as unknown as SuggestionWithTarget[]
    // Shuffle so the user sees different suggestions each time
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]]
    }
    setSuggestions(all)
    subscribeSuggestionsRealtime()
  }

  function subscribeSuggestionsRealtime() {
    suggestionsChannelRef.current = supabase
      .channel('suggestions-realtime')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'suggestions' },
        (payload) => {
          if (payload.new.is_available === false) {
            setSuggestions((prev) => prev.filter((s) => s.id !== payload.new.id))
          }
        }
      )
      .subscribe()
  }

  async function chooseSuggestion(suggestion: SuggestionWithTarget) {
    if (!session) return

    const { error } = await supabase.from('proposals').insert({
      group_id: session.groupId,
      proposer_user_id: session.userId,
      target_user_id: suggestion.target_user_id,
      content: suggestion.content,
    })

    if (error) { showToast('Erreur : ' + error.message); return }

    await supabase
      .from('suggestions')
      .update({ is_available: false })
      .eq('id', suggestion.id)

    // Retrait optimiste (le realtime confirme pour les autres)
    setSuggestions((prev) => {
      const next = prev.filter((s) => s.id !== suggestion.id)
      // Keep index in bounds
      if (suggestionIdx >= next.length && next.length > 0) setSuggestionIdx(next.length - 1)
      return next
    })
    showToast('Défi ajouté au vote !')
  }

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

    const optimisticCount = proposal.vote_count + 1
    const optimisticApproved = optimisticCount >= THRESHOLD

    // Optimistic update
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposal.id ? { ...p, vote_count: optimisticCount, is_approved: optimisticApproved } : p
      )
    )

    if (optimisticApproved) {
      showToast(`✓ "${proposal.content.slice(0, 40)}${proposal.content.length > 40 ? '…' : ''}" est approuvé !`)
    }

    // Use server-side atomic increment to prevent race conditions
    const { data, error } = await supabase.rpc('increment_vote_count', {
      proposal_id: proposal.id,
    })

    if (error) {
      console.error('[Proposals] vote update error:', error)
      // Rollback optimistic update
      setProposals((prev) =>
        prev.map((p) => p.id === proposal.id ? { ...p, vote_count: proposal.vote_count, is_approved: proposal.is_approved } : p)
      )
    } else if (data && Array.isArray(data) && data.length > 0) {
      // Reconcile with actual server values
      const serverResult = data[0] as { vote_count: number; is_approved: boolean }
      setProposals((prev) =>
        prev.map((p) => p.id === proposal.id ? { ...p, vote_count: serverResult.vote_count, is_approved: serverResult.is_approved } : p)
      )
      if (serverResult.is_approved && !optimisticApproved) {
        showToast(`✓ "${proposal.content.slice(0, 40)}${proposal.content.length > 40 ? '…' : ''}" est approuvé !`)
      }
    }
  }

  if (!session) return null

  const pending = proposals.filter((p) => !p.is_approved)
  const approved = proposals
    .filter((p) => p.is_approved)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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

      {/* ── Onglets ── */}
      <div style={styles.tabRow}>
        {(['pending', 'approved'] as const).map((tab) => {
          const active = activeTab === tab
          const label = tab === 'pending' ? 'En attente' : 'Validées'
          const count = tab === 'pending' ? pending.length : approved.length
          const showBadge = tab === 'pending' && count > 0
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tabPill,
                ...(active ? styles.tabPillActive : {}),
              }}
            >
              {label}
              <AnimatePresence>
                {showBadge && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    style={styles.tabBadge}
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>

      {loading && <p style={styles.hint}>Chargement...</p>}

      <AnimatePresence mode="wait">
        {activeTab === 'pending' ? (
          <motion.div
            key="pending"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
            style={styles.list}
          >
            {/* ── Suggestions (one at a time, scrollable) ── */}
            {suggestions.length > 0 && (() => {
              const s = suggestions[suggestionIdx]
              return (
                <Section title="✦ Suggestions pour toi">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ duration: 0.2 }}
                      style={styles.suggestionCard}
                    >
                      <div style={styles.targetRow}>
                        <Avatar user={s.target} />
                        <span style={styles.targetName}>{s.target?.username ?? '—'}</span>
                      </div>
                      <p style={styles.content}>"{s.content}"</p>
                      <button onClick={() => chooseSuggestion(s)} style={styles.chooseBtn}>
                        Choisir ce défi →
                      </button>
                    </motion.div>
                  </AnimatePresence>

                  {/* Navigation + reload */}
                  <div style={styles.suggestionNav}>
                    <button
                      onClick={() => setSuggestionIdx((i) => Math.max(0, i - 1))}
                      disabled={suggestionIdx === 0}
                      style={{ ...styles.navBtn, ...(suggestionIdx === 0 ? styles.navBtnDisabled : {}) }}
                    >
                      ←
                    </button>
                    <span style={styles.suggestionCounter}>
                      {suggestionIdx + 1} / {suggestions.length}
                    </span>
                    <button
                      onClick={() => setSuggestionIdx((i) => Math.min(suggestions.length - 1, i + 1))}
                      disabled={suggestionIdx >= suggestions.length - 1}
                      style={{ ...styles.navBtn, ...(suggestionIdx >= suggestions.length - 1 ? styles.navBtnDisabled : {}) }}
                    >
                      →
                    </button>
                    <button
                      onClick={() => {
                        // Reshuffle suggestions
                        setSuggestions((prev) => {
                          const copy = [...prev]
                          for (let i = copy.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [copy[i], copy[j]] = [copy[j], copy[i]]
                          }
                          return copy
                        })
                        setSuggestionIdx(0)
                      }}
                      style={styles.reloadBtn}
                      title="Mélanger"
                    >
                      ↻
                    </button>
                  </div>
                </Section>
              )
            })()}

            {/* ── Bouton proposition manuelle ── */}
            <button onClick={() => setShowProposeCell(true)} style={styles.manualBtn}>
              + Proposer manuellement
            </button>

            {!loading && pending.length === 0 && suggestions.length === 0 && (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>Aucun pari pour l'instant.</p>
              </div>
            )}

            {pending.length > 0 && (
              <Section title="À voter">
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
                        approvedView={false}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </Section>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="approved"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2 }}
            style={styles.list}
          >
            {!loading && approved.length === 0 && (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>Aucun défi validé pour l'instant.</p>
              </div>
            )}
            {approved.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                userId={session.userId}
                votedIds={votedIds}
                onVote={vote}
                approvedView={true}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {showProposeCell && (
        <ProposeCell
          onClose={() => setShowProposeCell(false)}
        />
      )}
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
  approvedView,
}: {
  proposal: ProposalWithUsers
  userId: string
  votedIds: Set<string>
  onVote: (p: ProposalWithUsers) => void
  approvedView: boolean
}) {
  const isOwn = proposal.proposer_user_id === userId
  const isTarget = proposal.target_user_id === userId
  const alreadyVoted = votedIds.has(proposal.id)
  const canVote = !isOwn && !isTarget && !proposal.is_approved && !alreadyVoted
  const progress = Math.min((proposal.vote_count / THRESHOLD) * 100, 100)

  return (
    <motion.div
      animate={{
        borderColor: approvedView ? 'var(--color-indigo)' : 'var(--color-border)',
        backgroundColor: approvedView ? 'rgba(99,102,241,0.06)' : 'var(--color-surface)',
      }}
      style={styles.card}
    >
      <div style={styles.cardHeader}>
        <div style={styles.targetRow}>
          <Avatar user={proposal.target} />
          <span style={styles.targetName}>{proposal.target?.username ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isOwn && !approvedView && <span style={styles.ownBadge}>Ma proposition</span>}
          {approvedView && <span style={styles.validatedBadge}>Validé ✓</span>}
        </div>
      </div>

      <p style={styles.content}>"{proposal.content}"</p>

      <div style={styles.proposerRow}>
        <Avatar user={proposal.proposer} />
        <span style={styles.proposerName}>proposé par {proposal.proposer?.username ?? '—'}</span>
      </div>

      {!approvedView && (
        <>
          <div style={styles.progressTrack}>
            <motion.div
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{ ...styles.progressBar, background: 'var(--color-indigo)' }}
            />
          </div>

          <div style={styles.footer}>
            <span style={styles.voteCount}>
              {proposal.vote_count} / {THRESHOLD} votes
            </span>
            <button
              onClick={() => canVote && onVote(proposal)}
              disabled={!canVote}
              style={{
                ...styles.voteBtn,
                ...(canVote ? {} : styles.voteBtnDisabled),
              }}
            >
              {isOwn ? 'Ta proposition' : isTarget ? 'Te concerne' : alreadyVoted ? 'Déjà voté' : 'Voter'}
            </button>
          </div>
        </>
      )}
    </motion.div>
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
  tabRow: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
    padding: '0.75rem 1rem 0',
    maxWidth: '560px',
    margin: '0 auto',
  },
  tabPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    background: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    border: 'none',
    borderRadius: '999px',
    padding: '0.625rem 1.25rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    minHeight: '44px',
  },
  tabPillActive: {
    background: 'var(--color-indigo)',
    color: '#ffffff',
    fontWeight: 700,
  },
  tabBadge: {
    background: 'var(--color-rose)',
    color: '#ffffff',
    fontSize: '0.75rem',
    fontWeight: 700,
    borderRadius: '999px',
    minWidth: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    lineHeight: 1,
  },
  validatedBadge: {
    background: 'rgba(99,102,241,0.15)',
    color: 'var(--color-indigo-light)',
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
    border: '1px solid var(--color-indigo)',
  },
  title: {
    fontFamily: 'var(--font-title)',
    fontWeight: 900,
    fontSize: '1.375rem',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  list: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  sectionTitle: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
  },
  card: {
    border: '1px solid var(--color-border)',
    borderRadius: '14px',
    padding: '18px',
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
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    color: 'var(--color-text-primary)',
  },
  content: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
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
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  progressTrack: {
    height: '4px',
    background: 'var(--color-border)',
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
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
  },
  voteBtn: {
    background: 'var(--color-indigo)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.625rem 0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  voteBtnDisabled: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  ownBadge: {
    background: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
    border: '1px solid var(--color-border)',
  },
  approvedBadge: {
    background: '#14532d',
    color: '#22c55e',
    fontSize: '0.75rem',
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
  suggestionCard: {
    border: '1px solid var(--color-border)',
    borderRadius: '14px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    background: 'var(--color-surface)',
  },
  chooseBtn: {
    alignSelf: 'flex-start',
    background: 'var(--color-indigo)',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    padding: '0.625rem 1rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  suggestionNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  navBtn: {
    background: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    fontSize: '1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
  },
  navBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  suggestionCounter: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  reloadBtn: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    fontSize: '1.125rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    marginLeft: '0.25rem',
  },
  manualBtn: {
    background: 'transparent',
    border: '1px dashed var(--color-border)',
    borderRadius: '14px',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    padding: '0.875rem',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center' as const,
    minHeight: '44px',
  },
  emptyState: {
    textAlign: 'center',
    marginTop: '2rem',
  },
  emptyText: {
    color: 'var(--color-text-primary)',
    fontSize: '1rem',
    marginBottom: '0.5rem',
  },
  hint: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '1rem',
  },
}
