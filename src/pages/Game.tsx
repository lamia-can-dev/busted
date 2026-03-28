import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import type { Cell, Grid, User } from '../../supabase/types'

interface GridWithCells extends Grid {
  cells: (Cell & { target: User | null })[]
}

export default function Game() {
  const navigate = useNavigate()
  const session = getSession()

  const [grid, setGrid] = useState<GridWithCells | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) { navigate('/'); return }
    loadGrid()
  }, [])

  async function loadGrid() {
    if (!session) return
    setLoading(true)
    setError(null)

    // Récupérer la grille de l'utilisateur courant
    const { data: grids, error: gridError } = await supabase
      .from('grids')
      .select('*')
      .eq('owner_user_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (gridError) { setError(gridError.message); setLoading(false); return }
    if (!grids || grids.length === 0) { setLoading(false); return }

    const currentGrid = grids[0]

    // Récupérer les cases + les utilisateurs ciblés
    const { data: cells, error: cellsError } = await supabase
      .from('cells')
      .select('*')
      .eq('grid_id', currentGrid.id)

    if (cellsError) { setError(cellsError.message); setLoading(false); return }

    // Récupérer les profils des cibles
    const targetIds = [...new Set((cells ?? []).map((c) => c.target_user_id))]
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .in('id', targetIds)

    const userMap = new Map((users ?? []).map((u) => [u.id, u]))

    setGrid({
      ...currentGrid,
      cells: (cells ?? []).map((c) => ({
        ...c,
        target: userMap.get(c.target_user_id) ?? null,
      })),
    })
    setLoading(false)
  }

  if (!session) return null

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Busted</h1>
        {grid && (
          <span style={styles.weekLabel}>
            Semaine du {formatDate(grid.week_start)}
          </span>
        )}
      </header>

      {loading && <p style={styles.hint}>Chargement de ta grille...</p>}

      {!loading && !grid && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Pas encore de grille pour cette semaine.</p>
          <p style={styles.hint}>Assure-toi qu'il y a au moins 2 membres dans le groupe.</p>
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {grid && (
        <div style={styles.gridContainer}>
          {grid.cells.map((cell, i) => (
            <CellCard key={cell.id} cell={cell} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function CellCard({ cell, index }: { cell: GridWithCells['cells'][number]; index: number }) {
  const [checked, setChecked] = useState(false)

  return (
    <button
      onClick={() => setChecked((v) => !v)}
      style={{
        ...styles.cell,
        ...(checked ? styles.cellChecked : {}),
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
      {checked && <div style={styles.checkmark}>✓</div>}
    </button>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    padding: '1.5rem 1rem 3rem',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
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
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    maxWidth: '520px',
    margin: '0 auto',
  },
  cell: {
    position: 'relative',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '1rem',
    padding: '0.875rem',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    aspectRatio: '1',
    transition: 'all 0.15s',
    overflow: 'hidden',
  },
  cellChecked: {
    background: '#1a1f2e',
    borderColor: '#6c47ff',
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
  checkmark: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.6rem',
    color: '#6c47ff',
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
}
