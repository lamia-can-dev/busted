import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import type { Cell, Grid, User } from '../../supabase/types'
import ProposeCell from '../components/ProposeCell'
import SubmitProof from '../components/SubmitProof'
import { generateGridFromPool } from '../lib/generateGrid'

// ─── Bingo ────────────────────────────────────────────────────

const LINES_3x3 = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // lignes
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // colonnes
  [0, 4, 8], [2, 4, 6],             // diagonales
]

function getCompletedLines(cells: GridWithCells['cells']): number[][] {
  return LINES_3x3.filter((line) =>
    line.every((i) => cells[i]?.submission?.targetValidated === true)
  )
}

function getBingoIndices(cells: GridWithCells['cells']): Set<number> {
  const indices = new Set<number>()
  getCompletedLines(cells).forEach((line) => line.forEach((i) => indices.add(i)))
  return indices
}

// ─── Types ────────────────────────────────────────────────────

interface SubmissionStatus {
  targetValidated: boolean | null
}

interface GridWithCells extends Grid {
  cells: (Cell & {
    target: User | null
    submission: SubmissionStatus | null
  })[]
}

type SelectedCell = GridWithCells['cells'][number]

// ─── Main ─────────────────────────────────────────────────────

export default function Game() {
  const navigate = useNavigate()
  const session = getSession()

  const [grid, setGrid] = useState<GridWithCells | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPropose, setShowPropose] = useState(false)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [showBingo, setShowBingo] = useState(false)

  const prevBingoCountRef = useRef(0)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const [approvedCount, setApprovedCount] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!session) { navigate('/'); return }
    loadGrid()
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  async function loadGrid() {
    if (!session) return
    setLoading(true)
    setError(null)

    const { data: grids, error: gridError } = await supabase
      .from('grids')
      .select('*')
      .eq('owner_user_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (gridError) { setError(gridError.message); setLoading(false); return }
    if (!grids || grids.length === 0) {
      const { count } = await supabase
        .from('proposals')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', session.groupId)
        .neq('target_user_id', session.userId)
        .eq('is_approved', true)
      setApprovedCount(count ?? 0)
      setLoading(false)
      return
    }

    const currentGrid = grids[0]

    const { data: cells, error: cellsError } = await supabase
      .from('cells')
      .select('*')
      .eq('grid_id', currentGrid.id)
      .order('position', { ascending: true })

    if (cellsError) { setError(cellsError.message); setLoading(false); return }

    const targetIds = [...new Set((cells ?? []).map((c) => c.target_user_id))]
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .in('id', targetIds)
    if (usersError) console.error('[Game] users error:', usersError)
    const userMap = new Map((users ?? []).map((u) => [u.id, u]))

    // Validation au niveau du pari (content + target_user_id)
    const { data: groupSubmissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('cell:cells(content, target_user_id), votes(voter_user_id, is_valid)')
    if (submissionsError) console.error('[Game] submissions error:', submissionsError)

    const proposalMap = new Map<string, SubmissionStatus>()
    for (const sub of groupSubmissions ?? []) {
      const cellData = sub.cell as { content: string | null; target_user_id: string } | null
      if (!cellData) continue
      const key = `${cellData.content}::${cellData.target_user_id}`
      if (proposalMap.get(key)?.targetValidated === true) continue
      const targetVote = (sub.votes as { voter_user_id: string; is_valid: boolean }[])
        .find((v) => v.voter_user_id === cellData.target_user_id)
      if (targetVote) {
        proposalMap.set(key, { targetValidated: targetVote.is_valid })
      } else if (!proposalMap.has(key)) {
        proposalMap.set(key, { targetValidated: null })
      }
    }

    const newCells = (cells ?? []).map((c) => {
      const key = `${c.content}::${c.target_user_id}`
      return {
        ...c,
        target: userMap.get(c.target_user_id) ?? null,
        submission: proposalMap.get(key) ?? null,
      }
    })

    const newGrid = { ...currentGrid, cells: newCells }

    // Détecter nouveau bingo
    const newBingoCount = getCompletedLines(newCells).length
    if (newBingoCount > prevBingoCountRef.current) {
      setShowBingo(true)
      setTimeout(() => setShowBingo(false), 3000)
    }
    prevBingoCountRef.current = newBingoCount

    setGrid(newGrid)
    setLoading(false)
    subscribeRealtime()
  }

  function subscribeRealtime() {
    channelRef.current?.unsubscribe()
    channelRef.current = supabase
      .channel('game-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes' },
        () => loadGrid()
      )
      .subscribe()
  }

  async function generateGrid() {
    if (!session) return
    setGenerating(true)
    setGenerateError(null)
    try {
      await generateGridFromPool(session.userId, session.groupId)
      await loadGrid()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Erreur génération')
      setGenerating(false)
    }
  }

  async function loadInviteCode() {
    if (!session) return
    if (inviteCode) { setShowInvite(true); return }
    const { data } = await supabase
      .from('groups')
      .select('invite_code')
      .eq('id', session.groupId)
      .single()
    if (data) setInviteCode(data.invite_code)
    setShowInvite(true)
  }

  if (!session) return null

  const bingoIndices = grid ? getBingoIndices(grid.cells) : new Set<number>()
  const bingoCount = grid ? getCompletedLines(grid.cells).length : 0

  return (
    <div style={styles.page}>
      {/* Animation BINGO */}
      <AnimatePresence>
        {showBingo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
            style={styles.bingoOverlay}
          >
            <div style={styles.bingoText}>BINGO !</div>
            <div style={styles.bingoSub}>Tu as complété une ligne 🎉</div>
          </motion.div>
        )}
      </AnimatePresence>

      <header style={styles.header}>
        <h1 style={styles.title}>Busted</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {bingoCount > 0 && (
            <span style={styles.bingoBadge}>🎯 {bingoCount} bingo{bingoCount > 1 ? 's' : ''}</span>
          )}
          {grid && (
            <span style={styles.weekLabel}>Semaine du {formatDate(grid.week_start)}</span>
          )}
          <button onClick={loadInviteCode} style={styles.inviteBtn} title="Inviter">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        </div>
      </header>

      {loading && <p style={styles.hint}>Chargement de ta grille...</p>}

      {!loading && !grid && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Pas encore de grille pour cette semaine.</p>
          <div style={styles.progressChip}>
            <span style={{ color: approvedCount >= 9 ? '#22c55e' : '#888' }}>
              {approvedCount}/9 paris approuvés
            </span>
          </div>
          {approvedCount >= 9 ? (
            <>
              <button onClick={generateGrid} disabled={generating} style={styles.generateBtn}>
                {generating ? 'Génération...' : 'Générer ma grille →'}
              </button>
              {generateError && <p style={styles.error}>{generateError}</p>}
            </>
          ) : (
            <p style={styles.hint}>
              Propose des paris dans l'onglet Votes pour atteindre les 9 requis.
            </p>
          )}
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {grid && (
        <div style={styles.gridContainer}>
          {grid.cells.map((cell, i) => (
            <CellCard
              key={cell.id}
              cell={cell}
              isBingo={bingoIndices.has(i)}
              onClick={() => {
                if (!cell.submission) setSelectedCell(cell)
              }}
            />
          ))}
        </div>
      )}

      <button onClick={() => setShowPropose(true)} style={styles.fab}>+</button>

      {showPropose && <ProposeCell onClose={() => setShowPropose(false)} />}

      {selectedCell && (
        <SubmitProof
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
          onSubmitted={loadGrid}
        />
      )}

      {/* Invite modal */}
      <AnimatePresence>
        {showInvite && inviteCode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowInvite(false); setCopied(false) }}
            style={styles.inviteBackdrop}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              style={styles.inviteSheet}
            >
              <div style={styles.handle} />
              <h2 style={styles.inviteTitle}>Inviter des amis</h2>
              <p style={styles.inviteHint}>Partage ce code pour rejoindre le groupe</p>
              <div style={styles.inviteCode}>{inviteCode}</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                style={styles.copyBtn}
              >
                {copied ? '✓ Lien copié !' : 'Copier le lien'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── CellCard ─────────────────────────────────────────────────

function CellCard({
  cell,
  isBingo,
  onClick,
}: {
  cell: GridWithCells['cells'][number]
  isBingo: boolean
  onClick: () => void
}) {
  const { submission } = cell
  const isValidated = submission?.targetValidated === true
  const isContested = submission?.targetValidated === false
  const isPending = submission !== null && submission.targetValidated === null

  return (
    <motion.button
      onClick={onClick}
      animate={{
        borderColor: isBingo ? '#facc15' : isValidated ? '#22c55e' : isContested ? '#ef4444' : '#2a2a2a',
        backgroundColor: isBingo ? '#1f1a00' : isValidated ? '#0d2018' : isContested ? '#2a1010' : '#1a1a1a',
        boxShadow: isBingo ? '0 0 12px rgba(250,204,21,0.35)' : 'none',
      }}
      transition={{ duration: 0.4 }}
      style={{
        ...styles.cell,
        cursor: submission ? 'default' : 'pointer',
      }}
    >
      {cell.target && (
        <div style={styles.targetBadge}>
          {cell.target.avatar_url ? (
            <img src={cell.target.avatar_url} style={styles.avatar} alt="" />
          ) : (
            <div style={styles.avatarFallback}>
              {cell.target.username[0].toUpperCase()}
            </div>
          )}
          <span style={styles.targetName}>{cell.target.username}</span>
        </div>
      )}
      <p style={styles.cellContent}>{cell.content}</p>
      {isBingo && <div style={{ ...styles.statusIcon, color: '#facc15' }}>★</div>}
      {!isBingo && isValidated && <div style={styles.statusIcon}>✓</div>}
      {!isBingo && isContested && <div style={{ ...styles.statusIcon, color: '#ef4444' }}>✗</div>}
      {isPending && !isBingo && <div style={{ ...styles.statusIcon, color: '#888', fontSize: '0.65rem' }}>⏳</div>}
    </motion.button>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

// ─── Styles ───────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    padding: '1.5rem 1rem 6rem',
    fontFamily: 'system-ui, sans-serif',
  },
  bingoOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.75)',
    zIndex: 300,
    pointerEvents: 'none',
  },
  bingoText: {
    fontSize: '5rem',
    fontWeight: 900,
    color: '#facc15',
    letterSpacing: '0.05em',
    textShadow: '0 0 40px rgba(250,204,21,0.8)',
  },
  bingoSub: {
    color: '#fff',
    fontSize: '1.1rem',
    marginTop: '0.5rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '520px',
    margin: '0 auto 1.5rem',
  },
  title: {
    color: '#fff',
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: 0,
  },
  weekLabel: {
    color: '#666',
    fontSize: '0.85rem',
  },
  bingoBadge: {
    background: '#1f1a00',
    color: '#facc15',
    border: '1px solid #facc15',
    borderRadius: '999px',
    padding: '0.2rem 0.6rem',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    maxWidth: '520px',
    margin: '0 auto',
  },
  cell: {
    position: 'relative',
    border: '1px solid #2a2a2a',
    borderRadius: '1rem',
    padding: '0.875rem',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    aspectRatio: '1',
    overflow: 'hidden',
  },
  targetBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  avatar: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  avatarFallback: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#6c47ff',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetName: {
    color: '#888',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  cellContent: {
    color: '#e0e0e0',
    fontSize: '0.8rem',
    lineHeight: 1.4,
    margin: 0,
    flex: 1,
  },
  statusIcon: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.6rem',
    color: '#22c55e',
    fontSize: '0.85rem',
    fontWeight: 700,
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
  error: {
    color: '#ff6b6b',
    textAlign: 'center',
    fontSize: '0.875rem',
  },
  fab: {
    position: 'fixed',
    bottom: '5rem',
    right: '1.25rem',
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: '#6c47ff',
    color: '#fff',
    fontSize: '1.75rem',
    fontWeight: 300,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(108, 71, 255, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    lineHeight: 1,
  },
  inviteBtn: {
    background: 'transparent',
    border: '1px solid #2a2a2a',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#888',
    padding: 0,
    flexShrink: 0,
  },
  inviteBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
  },
  inviteSheet: {
    background: '#1a1a1a',
    borderRadius: '1.5rem 1.5rem 0 0',
    padding: '1rem 1.5rem 2.5rem',
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
  },
  handle: {
    width: '40px',
    height: '4px',
    background: '#333',
    borderRadius: '2px',
    margin: '0 auto 1.25rem',
  },
  inviteTitle: {
    color: '#fff',
    fontSize: '1.2rem',
    fontWeight: 700,
    margin: '0 0 0.5rem',
  },
  inviteHint: {
    color: '#666',
    fontSize: '0.85rem',
    margin: '0 0 1.25rem',
  },
  inviteCode: {
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '0.75rem',
    padding: '1rem',
    textAlign: 'center',
    fontSize: '2rem',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.2em',
    marginBottom: '1rem',
  },
  copyBtn: {
    background: '#6c47ff',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  progressChip: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '999px',
    padding: '0.375rem 0.875rem',
    fontSize: '0.85rem',
    display: 'inline-block',
    marginBottom: '1rem',
  },
  generateBtn: {
    background: '#6c47ff',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#ff6b6b',
    textAlign: 'center',
    fontSize: '0.875rem',
  },
}
