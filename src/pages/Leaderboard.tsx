import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import type { User } from '../../supabase/types'

// ─── Types ────────────────────────────────────────────────────

interface VoteRow {
  voter_user_id: string
  is_valid: boolean
  created_at: string
}

interface SubmissionRow {
  id: string
  submitter_user_id: string
  cell: { content: string | null; target_user_id: string } | null
  votes: VoteRow[]
}

interface CellRow {
  grid_id: string
  content: string | null
  target_user_id: string
  grid: { owner_user_id: string } | null
}

interface PlayerScore {
  user: User
  bingos: number
  validatedCells: number
  firstBingoAt: string | null
  rank: number
}

// ─── Countdown helpers ────────────────────────────────────────

function getRevealTarget(revealAt: string | null): Date {
  if (revealAt) return new Date(revealAt)
  const now = new Date()
  const daysUntilFri = (5 - now.getDay() + 7) % 7 || 7
  const fri = new Date(now)
  fri.setDate(now.getDate() + daysUntilFri)
  fri.setHours(20, 0, 0, 0)
  return fri
}

function formatCountdown(target: Date): string {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return 'Révélation !'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  const parts = []
  if (d > 0) parts.push(`${d}j`)
  parts.push(`${String(h).padStart(2, '0')}h`)
  parts.push(`${String(m).padStart(2, '0')}m`)
  parts.push(`${String(s).padStart(2, '0')}s`)
  return parts.join(' ')
}

const MEDALS = ['🥇', '🥈', '🥉']

// ─── Main ─────────────────────────────────────────────────────

export default function Leaderboard() {
  const navigate = useNavigate()
  const session = getSession()
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState('')
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const prevRanksRef = useRef<Map<string, number>>(new Map())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const revealTargetRef = useRef<Date | null>(null)

  useEffect(() => {
    if (!session) { navigate('/'); return }
    init()
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  // Countdown tick
  useEffect(() => {
    const interval = setInterval(() => {
      if (revealTargetRef.current) {
        setCountdown(formatCountdown(revealTargetRef.current))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  async function init() {
    if (!session) return
    // Fetch group for reveal_at
    const { data: group } = await supabase
      .from('groups')
      .select('reveal_at')
      .eq('id', session.groupId)
      .single()

    revealTargetRef.current = getRevealTarget(group?.reveal_at ?? null)
    setCountdown(formatCountdown(revealTargetRef.current))

    await loadScores()
    subscribeRealtime()
  }

  async function loadScores() {
    if (!session) return
    setLoading(true)

    const [membersRes, submissionsRes, cellsRes] = await Promise.all([
      supabase.from('users').select('*').eq('group_id', session.groupId),
      supabase.from('submissions').select('cell:cells(content, target_user_id), votes(voter_user_id, is_valid, created_at)'),
      supabase.from('cells').select('grid_id, content, target_user_id, grid:grids(owner_user_id)').order('position', { ascending: true }),
    ])

    if (membersRes.error || submissionsRes.error || cellsRes.error || !membersRes.data) {
      setLoading(false)
      return
    }
    const members = membersRes.data
    const submissions = submissionsRes.data
    const allCells = cellsRes.data

    // Init score map
    const scoreMap = new Map<string, PlayerScore>()
    for (const user of members as User[]) {
      scoreMap.set(user.id, { user, bingos: 0, validatedCells: 0, firstBingoAt: null, rank: 0 })
    }

    // Paris validés avec leur timestamp de validation
    const validatedProposals = new Map<string, string>() // key → created_at du vote cible
    for (const sub of (submissions ?? []) as SubmissionRow[]) {
      const cellData = sub.cell
      if (!cellData) continue
      const targetVote = (sub.votes ?? []).find((v) => v.voter_user_id === cellData.target_user_id)
      if (targetVote?.is_valid === true) {
        const key = `${cellData.content}::${cellData.target_user_id}`
        // Garder le plus récent si doublon
        if (!validatedProposals.has(key)) {
          validatedProposals.set(key, targetVote.created_at)
        }
      }
    }

    // Pour chaque membre, compter les cases validées et les lignes bingo
    // Group by (ownerUserId, gridId) so each grid is checked independently
    const cellsByGrid = new Map<string, { ownerUserId: string; cells: { content: string | null; target_user_id: string }[] }>()
    for (const cell of (allCells ?? []) as CellRow[]) {
      const ownerUserId = cell.grid?.owner_user_id
      if (!ownerUserId) continue
      const owner = scoreMap.get(ownerUserId)
      if (!owner) continue
      const key = `${cell.content}::${cell.target_user_id}`
      if (validatedProposals.has(key)) owner.validatedCells += 1
      if (!cellsByGrid.has(cell.grid_id)) cellsByGrid.set(cell.grid_id, { ownerUserId, cells: [] })
      cellsByGrid.get(cell.grid_id)!.cells.push({ content: cell.content, target_user_id: cell.target_user_id })
    }

    // Compter les lignes bingo + timestamp du premier bingo
    const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    for (const { ownerUserId, cells: gridCells } of cellsByGrid.values()) {
      const owner = scoreMap.get(ownerUserId)
      if (!owner) continue

      for (const line of LINES) {
        const times = line.map((i) => {
          const c = gridCells[i]
          return c ? validatedProposals.get(`${c.content}::${c.target_user_id}`) : undefined
        })
        if (times.some((t) => !t)) continue // ligne incomplète
        // Timestamp de complétion = dernier vote qui a complété la ligne
        const lineTime = times.reduce((max, t) => (t! > max! ? t! : max!), times[0])!
        owner.bingos += 1
        if (!owner.firstBingoAt || lineTime < owner.firstBingoAt) owner.firstBingoAt = lineTime
      }
    }

    // Sort and assign ranks
    const sorted = [...scoreMap.values()].sort((a, b) => {
      if (b.bingos !== a.bingos) return b.bingos - a.bingos
      // Même nombre de bingos : qui a eu son premier bingo en premier ?
      if (a.firstBingoAt && b.firstBingoAt) return a.firstBingoAt < b.firstBingoAt ? -1 : 1
      if (a.firstBingoAt) return -1
      if (b.firstBingoAt) return 1
      return b.validatedCells - a.validatedCells
    })
    sorted.forEach((p, i) => { p.rank = i + 1 })

    // Detect rank improvements for flash
    const newRanks = new Map(sorted.map((p) => [p.user.id, p.rank]))
    const flashing = new Set<string>()
    for (const [id, newRank] of newRanks) {
      const prev = prevRanksRef.current.get(id)
      if (prev !== undefined && newRank < prev) flashing.add(id)
    }
    prevRanksRef.current = newRanks

    if (flashing.size > 0) {
      setFlashIds(flashing)
      setTimeout(() => setFlashIds(new Set()), 1200)
    }

    setScores(sorted)
    setLoading(false)
  }

  function subscribeRealtime() {
    channelRef.current = supabase
      .channel('leaderboard-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes' },
        () => loadScores()
      )
      .subscribe()
  }

  if (!session) return null

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Classement</h1>
        <div style={styles.countdown}>
          <span style={styles.countdownLabel}>Fin de semaine dans</span>
          <span style={styles.countdownValue}>{countdown}</span>
        </div>
      </header>

      {loading && <p style={styles.hint}>Chargement...</p>}

      {!loading && scores.length === 0 && (
        <p style={styles.hint}>Aucun membre dans le groupe.</p>
      )}

      <motion.div layout style={styles.list}>
        <AnimatePresence>
          {scores.map((player) => (
            <motion.div
              key={player.user.id}
              layoutId={player.user.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: 1,
                y: 0,
                backgroundColor: flashIds.has(player.user.id) ? '#1a2e1a' : 'transparent',
              }}
              transition={{ duration: 0.35, layout: { duration: 0.5, type: 'spring', bounce: 0.2 } }}
              onClick={() => setExpandedId(expandedId === player.user.id ? null : player.user.id)}
              style={{
                ...styles.card,
                ...(player.user.id === session.userId ? styles.cardSelf : {}),
              }}
            >
              <div style={styles.cardMain}>
                {/* Rank */}
                <span style={styles.rank}>
                  {player.rank <= 3 ? MEDALS[player.rank - 1] : `#${player.rank}`}
                </span>

                {/* Avatar */}
                {player.user.avatar_url ? (
                  <img src={player.user.avatar_url} style={styles.avatar} alt="" />
                ) : (
                  <div style={styles.avatarFallback}>
                    {player.user.username[0].toUpperCase()}
                  </div>
                )}

                {/* Name + score */}
                <div style={styles.nameBlock}>
                  <span style={styles.username}>
                    {player.user.username}
                    {player.user.id === session.userId && (
                      <span style={styles.youBadge}>Toi</span>
                    )}
                  </span>
                </div>

                <span style={styles.score}>
                  {player.bingos > 0
                    ? `🎯 ${player.bingos} bingo${player.bingos > 1 ? 's' : ''}`
                    : `${player.validatedCells} case${player.validatedCells > 1 ? 's' : ''}`}
                </span>
              </div>

              {/* Detail (expanded) */}
              <AnimatePresence>
                {expandedId === player.user.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={styles.detail}>
                      <DetailRow
                        label="Lignes bingo"
                        value={player.bingos}
                        color="#22c55e"
                      />
                      <DetailRow
                        label="Cases validées"
                        value={player.validatedCells}
                        color="#888"
                      />
                      {player.firstBingoAt && (
                        <div style={styles.detailRow}>
                          <span style={styles.detailLabel}>Premier bingo</span>
                          <span style={{ ...styles.detailCount, color: '#22c55e' }}>
                            {new Date(player.firstBingoAt).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ─── DetailRow ────────────────────────────────────────────────

function DetailRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={{ ...styles.detailCount, color, fontWeight: 700 }}>{value}</span>
    </div>
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
    padding: '1.5rem 1rem 1.25rem',
    maxWidth: '560px',
    margin: '0 auto',
  },
  title: {
    color: '#fff',
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: '0 0 1rem',
  },
  countdown: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '1rem',
    padding: '0.875rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  countdownLabel: {
    color: '#555',
    fontSize: '0.75rem',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  countdownValue: {
    color: '#fff',
    fontSize: '1.5rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  },
  list: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '0 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  card: {
    border: '1px solid #2a2a2a',
    borderRadius: '1.25rem',
    padding: '1rem 1.25rem',
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardSelf: {
    borderColor: '#6c47ff',
  },
  cardMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
  },
  rank: {
    fontSize: '1.25rem',
    minWidth: '2rem',
    textAlign: 'center',
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
    background: '#6c47ff',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nameBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  username: {
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  youBadge: {
    background: '#1a1430',
    color: '#6c47ff',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '0.1rem 0.4rem',
    borderRadius: '999px',
    border: '1px solid #6c47ff',
  },
  score: {
    color: '#fff',
    fontSize: '1.1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  detail: {
    marginTop: '0.875rem',
    paddingTop: '0.875rem',
    borderTop: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  detailLabel: {
    color: '#666',
    fontSize: '0.85rem',
    flex: 1,
  },
  detailCount: {
    color: '#555',
    fontSize: '0.85rem',
    minWidth: '2rem',
    textAlign: 'right',
  },
  hint: {
    color: '#555',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '2rem',
  },
}
