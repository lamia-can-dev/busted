import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Cell, Grid, User } from '../../supabase/types'
import ProposeCell from '../components/ProposeCell'
import CellSheet from '../components/CellSheet'
import ProofSheet from '../components/ProofSheet'
import Logo from '../components/Logo'
import { generateGridFromPool } from '../lib/generateGrid'
import { checkLines, checkColumns, checkDiagonals } from '../lib/bingoUtils'
import { normalizeStatus } from '../lib/cellStatus'
import { getUserColor } from '../lib/userColor'
import Tutorial from '../components/Tutorial'

// ─── Types ────────────────────────────────────────────────────

interface SubmissionData {
  id: string
  submitter_user_id: string
  proof_text: string | null
  proof_image_url: string | null
  created_at: string
}

interface GridWithCells extends Grid {
  cells: (Cell & {
    target: User | null
    submission: SubmissionData | null
  })[]
}

type SelectedCell = GridWithCells['cells'][number]

// ─── Config by grid size ───────────────────────────────────────

const CELL_CONFIG: Record<number, { fontSize: number }> = {
  3: { fontSize: 11 },
  4: { fontSize: 10 },
  5: { fontSize: 9 },
}

// ─── Main ─────────────────────────────────────────────────────

export default function Game() {
  const { userId, groupId } = useAuth()

  const [grid, setGrid] = useState<GridWithCells | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPropose, setShowPropose] = useState(false)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [showCellSheet, setShowCellSheet] = useState(false)
  const [showBingo, setShowBingo] = useState(false)

  const prevBingoCountRef = useRef(0)
  const isFirstLoadRef = useRef(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const [approvedCount, setApprovedCount] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showTutorial, setShowTutorial] = useState(() => {
    return !localStorage.getItem('busted_tutorial_done')
  })

  useEffect(() => {
    loadGrid()
    subscribeRealtime()
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  async function loadGrid() {
    setLoading(true)
    setError(null)

    const { data: grids, error: gridError } = await supabase
      .from('grids')
      .select('*')
      .eq('owner_user_id', userId!)
      .order('created_at', { ascending: false })
      .limit(1)

    if (gridError) { setError(gridError.message); setLoading(false); return }
    if (!grids || grids.length === 0) {
      const { count } = await supabase
        .from('proposals')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId!)
        .neq('target_user_id', userId!)
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
    const { data: users } = await supabase.from('users').select('*').in('id', targetIds)
    const userMap = new Map((users ?? []).map((u) => [u.id, u]))

    const cellIds = (cells ?? []).map((c) => c.id)
    const { data: submissions } = await supabase
      .from('submissions')
      .select('id, cell_id, submitter_user_id, proof_text, proof_image_url, created_at')
      .in('cell_id', cellIds)

    const submissionMap = new Map<string, SubmissionData>()
    for (const s of submissions ?? []) {
      if (!submissionMap.has(s.cell_id)) submissionMap.set(s.cell_id, s as SubmissionData)
    }

    // Filter out cells targeting the grid owner (shouldn't happen, but safety guard)
    const safeCells = (cells ?? []).filter((c) => c.target_user_id !== userId)

    const newCells = safeCells.map((c) => {
      const submission = submissionMap.get(c.id) ?? null
      const base = normalizeStatus(c.status)
      // If status is unchecked but a submission exists, show pending_confirmation
      const status: Cell['status'] =
        base === 'unchecked' && submission !== null ? 'pending_confirmation' : base
      return {
        ...c,
        status,
        target: userMap.get(c.target_user_id) ?? null,
        submission,
      }
    })

    const newGrid = { ...currentGrid, cells: newCells }
    const n = Math.round(Math.sqrt(newCells.length))
    const diags = checkDiagonals(newCells, n)
    const newBingoCount = checkLines(newCells, n).length + checkColumns(newCells, n).length + diags.filter(Boolean).length
    if (!isFirstLoadRef.current && newBingoCount > prevBingoCountRef.current) {
      setShowBingo(true)
      setTimeout(() => setShowBingo(false), 4000)
      // Multi-burst confetti from different angles
      const colors = ['#FF5FCC', '#6366F1', '#FACC15', '#22c55e', '#f97316']
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.3, y: 0.5 }, colors, angle: 60 })
      setTimeout(() => confetti({ particleCount: 80, spread: 70, origin: { x: 0.7, y: 0.5 }, colors, angle: 120 }), 250)
      setTimeout(() => confetti({ particleCount: 100, spread: 100, origin: { x: 0.5, y: 0.3 }, colors, startVelocity: 55 }), 500)
    }
    prevBingoCountRef.current = newBingoCount
    isFirstLoadRef.current = false

    setGrid(newGrid)
    setLoading(false)
  }

  function subscribeRealtime() {
    if (channelRef.current) return
    channelRef.current = supabase
      .channel('game-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, () => loadGrid())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cells' }, () => loadGrid())
      .subscribe()
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      await generateGridFromPool(userId!, groupId!)
      await loadGrid()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Erreur génération')
      setGenerating(false)
    }
  }

  async function loadInviteCode() {
    if (inviteCode) { setShowInvite(true); return }
    const { data } = await supabase
      .from('groups').select('invite_code').eq('id', groupId!).single()
    if (data) setInviteCode(data.invite_code)
    setShowInvite(true)
  }

  const n = grid ? Math.round(Math.sqrt(grid.cells.length)) : 3
  const cellCfg = CELL_CONFIG[n] ?? CELL_CONFIG[3]
  const completedLineCount = grid ? (() => {
    const diags = checkDiagonals(grid.cells, n)
    return checkLines(grid.cells, n).length + checkColumns(grid.cells, n).length + diags.filter(Boolean).length
  })() : 0

  const isColComplete = (c: number) => !!grid && checkColumns(grid.cells, n).includes(c)
  const isRowComplete = (r: number) => !!grid && checkLines(grid.cells, n).includes(r)
  const diagComplete = grid ? checkDiagonals(grid.cells, n) : [false, false]
  const isMainDiagComplete = diagComplete[0]
  const isAntiDiagComplete = diagComplete[1]

  const DOT = 12 // px — width of row/col indicator slot

  return (
    <div style={styles.page}>
      {/* Tutorial overlay */}
      <AnimatePresence>
        {showTutorial && (
          <Tutorial onComplete={() => setShowTutorial(false)} />
        )}
      </AnimatePresence>

      {/* BINGO overlay */}
      <AnimatePresence>
        {showBingo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={styles.bingoOverlay}
          >
            <div style={styles.bingoLetters}>
              {'BINGO !'.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 40, scale: 0.3, rotate: -15 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={{ delay: 0.15 + i * 0.08, type: 'spring', damping: 10, stiffness: 200 }}
                  style={ch === ' ' ? styles.bingoSpace : styles.bingoLetter}
                >
                  {ch}
                </motion.span>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
              style={styles.bingoSub}
            >
              Tu as complété une ligne !
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header style={styles.header}>
        <Logo variant="full" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
            <span style={{ color: approvedCount >= 9 ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
              {approvedCount}/9 paris approuvés
            </span>
          </div>
          {approvedCount >= 9 ? (
            <>
              <button onClick={handleGenerate} disabled={generating} style={styles.generateBtn}>
                {generating ? 'Génération...' : 'Générer ma grille →'}
              </button>
              {generateError && <p style={styles.error}>{generateError}</p>}
            </>
          ) : (
            <p style={styles.hint}>Propose des paris dans l'onglet Votes pour atteindre les 9 requis.</p>
          )}
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {grid && (
        <div style={styles.gridWrapper}>
          {/* ── Indicateurs de colonnes + diagonales ── */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', paddingLeft: DOT + 4 }}>
            {Array.from({ length: n }, (_, c) => (
              <div key={c} style={{ flex: 1, display: 'flex', justifyContent: 'center', position: 'relative' }}>
                {c === 0 && (
                  <motion.div
                    animate={{ background: isMainDiagComplete ? '#FF5FCC' : '#3A3A5A' }}
                    transition={{ duration: 0.4 }}
                    style={{ ...styles.dot, position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}
                    title="Diagonale ↘"
                  />
                )}
                <motion.div
                  animate={{ background: isColComplete(c) ? '#FF5FCC' : '#3A3A5A' }}
                  transition={{ duration: 0.4 }}
                  style={styles.dot}
                />
                {c === n - 1 && (
                  <motion.div
                    animate={{ background: isAntiDiagComplete ? '#FF5FCC' : '#3A3A5A' }}
                    transition={{ duration: 0.4 }}
                    style={{ ...styles.dot, position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
                    title="Diagonale ↙"
                  />
                )}
              </div>
            ))}
          </div>

          {/* ── Lignes de la grille ── */}
          {Array.from({ length: n }, (_, r) => (
            <div key={r} style={{ display: 'flex', gap: '4px', marginBottom: r < n - 1 ? '4px' : 0 }}>
              {/* Indicateur de ligne */}
              <div style={{ width: DOT, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div
                  animate={{ background: isRowComplete(r) ? '#FF5FCC' : '#3A3A5A' }}
                  transition={{ duration: 0.4 }}
                  style={styles.dot}
                />
              </div>

              {/* Cases de la ligne */}
              {Array.from({ length: n }, (_, c) => {
                const cell = grid.cells[r * n + c]
                return (
                  <CellCard
                    key={cell?.id ?? `${r}-${c}`}
                    cell={cell}
                    fontSize={cellCfg.fontSize}
                    onClick={() => { if (cell) { setSelectedCell(cell); setShowCellSheet(true) } }}
                  />
                )
              })}
            </div>
          ))}

          {/* ── BINGO pills ── */}
          <AnimatePresence>
            {completedLineCount > 0 && (
              <motion.div
                key="bingo-pills"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                style={styles.bingoPillRow}
              >
                {Array.from({ length: completedLineCount }, (_, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1, type: 'spring', damping: 12, stiffness: 200 }}
                    style={styles.bingoPill}
                  >
                    BINGO !
                  </motion.span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      )}

      <button onClick={() => setShowPropose(true)} style={styles.fab}>+</button>
      {showPropose && <ProposeCell onClose={() => setShowPropose(false)} />}
      <AnimatePresence>
        {showCellSheet && selectedCell && (
          <CellSheet
            key="cell-sheet"
            cell={selectedCell}
            onClose={() => { setShowCellSheet(false); setSelectedCell(null) }}
            onSubmitProof={() => setShowCellSheet(false)}
            onUpdated={() => { setShowCellSheet(false); setSelectedCell(null); loadGrid() }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!showCellSheet && selectedCell && (selectedCell.submission === null || selectedCell.status === 'rejected') && (
          <ProofSheet
            key="proof-sheet"
            cell={selectedCell}
            onClose={() => setSelectedCell(null)}
            onSubmitted={loadGrid}
          />
        )}
      </AnimatePresence>

      {/* ── Modal invitation ── */}
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
                  navigator.clipboard.writeText(inviteCode)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                style={styles.copyBtn}
              >
                {copied ? '✓ Code copié !' : 'Copier le code'}
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
  fontSize,
  onClick,
}: {
  cell: GridWithCells['cells'][number] | undefined
  fontSize: number
  onClick: () => void
}) {
  if (!cell) return <div style={{ flex: 1 }} />

  const { status } = cell

  const strip =
    status === 'busted'                ? { text: 'Busted !',                 bg: 'var(--color-rose)', color: '#fff' }
    : status === 'pending_confirmation'  ? { text: 'En attente de validation', bg: 'var(--color-indigo)', color: '#fff' }
    : status === 'rejected'              ? { text: 'Rejeté',                   bg: 'var(--color-border)', color: 'var(--color-text-secondary)' }
    : null

  // Raw hex values for Framer Motion animate (CSS variables aren't interpolatable)
  const borderColor =
    status === 'busted'                ? '#FF5FCC'
    : status === 'pending_confirmation'  ? '#818CF8'
    : status === 'rejected'              ? '#3A3A5A'
    : '#3A3A5A'

  const bgColor =
    status === 'busted'                ? 'rgba(255,95,204,0.08)'
    : status === 'pending_confirmation'  ? 'rgba(99,102,241,0.08)'
    : 'var(--color-surface)'

  return (
    <motion.button
      onClick={onClick}
      animate={{ borderColor }}
      transition={{ duration: 0.35 }}
      style={{ ...styles.cell, cursor: 'pointer', background: bgColor }}
    >
      {/* Ligne du haut : avatar + pseudo */}
      <div style={styles.cellTop}>
        {cell.target?.avatar_url ? (
          <img src={cell.target.avatar_url} style={styles.avatar} alt="" />
        ) : (
          <div style={{ ...styles.avatarFallback, background: cell.target ? getUserColor(cell.target.id) : 'var(--color-indigo)' }}>
            {cell.target?.username[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <span style={{ ...styles.targetName, fontSize }}>
          {cell.target?.username ?? '—'}
        </span>
      </div>

      {/* Texte du défi */}
      <p style={{ ...styles.cellContent, fontSize, WebkitLineClamp: strip ? 2 : 3 } as React.CSSProperties}>
        {cell.content}
      </p>

      {/* Bandelette d'état */}
      {strip && (
        <div style={{ ...styles.statusStrip, background: strip.bg, color: strip.color }}>
          {strip.text}
        </div>
      )}
    </motion.button>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

// ─── Styles ───────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: 'var(--color-bg)',
    padding: '1.5rem clamp(0.75rem, 3vw, 1.25rem) calc(5rem + env(safe-area-inset-bottom, 0px))',
  },
  bingoOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0.85) 70%)',
    zIndex: 300,
    pointerEvents: 'none',
  },
  bingoLetters: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.1em',
  },
  bingoLetter: {
    fontSize: 'clamp(3.5rem, 12vw, 5.5rem)',
    fontWeight: 900,
    fontFamily: 'var(--font-title)',
    color: '#FACC15',
    textShadow: '0 0 30px rgba(250,204,21,0.9), 0 0 60px rgba(255,95,204,0.4), 0 4px 12px rgba(0,0,0,0.5)',
    display: 'inline-block',
  },
  bingoSpace: {
    width: '0.3em',
  },
  bingoSub: {
    color: 'var(--color-text-primary)',
    fontSize: 'clamp(0.9rem, 3vw, 1.15rem)',
    marginTop: '0.75rem',
    fontFamily: 'var(--font-body)',
    opacity: 0.9,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    maxWidth: '520px',
    margin: '0 auto 1rem',
    flexWrap: 'wrap' as const,
  },
  weekLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: 'clamp(0.75rem, 2.5vw, 0.85rem)',
  },
  gridWrapper: {
    maxWidth: '520px',
    margin: '0 auto',
    width: '100%',
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
  },
  cell: {
    flex: 1,
    position: 'relative',
    border: '1px solid var(--color-border)',
    borderRadius: 'clamp(6px, 2vw, 10px)',
    padding: 'clamp(4px, 1.5vw, 7px) clamp(5px, 1.5vw, 8px) 20px',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    overflow: 'hidden',
    background: 'var(--color-surface)',
    minWidth: 0,
  },
  cellTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    overflow: 'hidden',
  },
  avatar: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  avatarFallback: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    background: 'var(--color-indigo)',
    color: '#fff',
    fontSize: '8px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  targetName: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cellContent: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.3,
    margin: 0,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  } as React.CSSProperties,
  statusStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8px',
    fontWeight: 700,
    fontFamily: 'var(--font-body)',
    letterSpacing: '0.04em',
    borderRadius: '0 0 9px 9px',
  },
  bingoPillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.875rem',
  },
  bingoPill: {
    background: 'rgba(255,95,204,0.15)',
    color: '#FF5FCC',
    border: '1px solid #FF5FCC',
    borderRadius: '999px',
    padding: '0.3rem 0.875rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    fontFamily: 'var(--font-body)',
    boxShadow: '0 0 8px rgba(255,95,204,0.3)',
  },
  emptyState: {
    textAlign: 'center',
    marginTop: '4rem',
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
  error: {
    color: 'var(--color-error)',
    textAlign: 'center',
    fontSize: '0.875rem',
  },
  fab: {
    position: 'fixed',
    bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
    right: 'clamp(0.75rem, 3vw, 1.25rem)',
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: 'var(--color-rose)',
    color: 'var(--color-text-primary)',
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
    border: '1px solid var(--color-border)',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
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
    background: 'var(--color-surface)',
    borderRadius: '1.5rem 1.5rem 0 0',
    padding: '1rem 1.5rem calc(2.5rem + env(safe-area-inset-bottom, 0px))',
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
  },
  handle: {
    width: '40px',
    height: '4px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    margin: '0 auto 1.25rem',
  },
  inviteTitle: {
    color: 'var(--color-text-primary)',
    fontSize: '1.2rem',
    fontWeight: 700,
    margin: '0 0 0.5rem',
  },
  inviteHint: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    margin: '0 0 1.25rem',
  },
  inviteCode: {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.75rem',
    padding: '1rem',
    textAlign: 'center',
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    letterSpacing: '0.2em',
    marginBottom: '1rem',
  },
  copyBtn: {
    background: 'var(--color-indigo)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  progressChip: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '999px',
    padding: '0.375rem 0.875rem',
    fontSize: '0.85rem',
    display: 'inline-block',
    marginBottom: '1rem',
  },
  generateBtn: {
    background: 'var(--color-indigo)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem 1.5rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
}
