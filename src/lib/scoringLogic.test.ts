/**
 * Unit tests for the bingo scoring algorithm used in Leaderboard.tsx.
 * The pure computation is replicated here so it can be tested independently.
 */
import { describe, it, expect } from 'vitest'

// ─── Algorithm (mirrored from Leaderboard.tsx) ─────────────────

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]

type Cell = { content: string; target_user_id: string }

function computeBingos(
  gridCells: Cell[],
  validatedProposals: Map<string, string>
): { bingos: number; firstBingoAt: string | null } {
  let bingos = 0
  let firstBingoAt: string | null = null

  for (const line of LINES) {
    const times = line.map((i) => {
      const c = gridCells[i]
      return c ? validatedProposals.get(`${c.content}::${c.target_user_id}`) : undefined
    })
    if (times.some((t) => !t)) continue
    const lineTime = times.reduce((max, t) => (t! > max! ? t! : max!), times[0])!
    bingos += 1
    if (!firstBingoAt || lineTime < firstBingoAt) firstBingoAt = lineTime
  }

  return { bingos, firstBingoAt }
}

function makeGrid(overrides: Partial<Cell>[] = []): Cell[] {
  return Array.from({ length: 9 }, (_, i) => ({
    content: `cell-${i}`,
    target_user_id: `user-${i}`,
    ...overrides[i],
  }))
}

function makeValidated(cells: Cell[], indices: number[], timestamp = '2026-01-01T12:00:00Z'): Map<string, string> {
  const map = new Map<string, string>()
  for (const i of indices) {
    const c = cells[i]
    map.set(`${c.content}::${c.target_user_id}`, timestamp)
  }
  return map
}

// ─── Tests ────────────────────────────────────────────────────

describe('bingo detection — rows', () => {
  it('detects first row [0,1,2]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [0, 1, 2])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })

  it('detects second row [3,4,5]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [3, 4, 5])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })

  it('detects third row [6,7,8]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [6, 7, 8])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })
})

describe('bingo detection — columns', () => {
  it('detects first column [0,3,6]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [0, 3, 6])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })

  it('detects second column [1,4,7]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [1, 4, 7])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })

  it('detects third column [2,5,8]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [2, 5, 8])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })
})

describe('bingo detection — diagonals', () => {
  it('detects main diagonal [0,4,8]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [0, 4, 8])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })

  it('detects anti-diagonal [2,4,6]', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [2, 4, 6])
    expect(computeBingos(cells, validated).bingos).toBe(1)
  })
})

describe('bingo detection — edge cases', () => {
  it('returns 0 bingos when no cells are validated', () => {
    const cells = makeGrid()
    expect(computeBingos(cells, new Map()).bingos).toBe(0)
  })

  it('returns 0 bingos when only 2 cells in a line are validated', () => {
    const cells = makeGrid()
    const validated = makeValidated(cells, [0, 1]) // missing index 2
    expect(computeBingos(cells, validated).bingos).toBe(0)
  })

  it('counts multiple bingos when several lines are complete', () => {
    const cells = makeGrid()
    // Validate entire grid → all 8 lines complete
    const validated = makeValidated(cells, [0,1,2,3,4,5,6,7,8])
    expect(computeBingos(cells, validated).bingos).toBe(8)
  })

  it('records firstBingoAt as the line completion timestamp', () => {
    const cells = makeGrid()
    // Index 2 is validated last
    const validated = new Map([
      [`${cells[0].content}::${cells[0].target_user_id}`, '2026-01-01T10:00:00Z'],
      [`${cells[1].content}::${cells[1].target_user_id}`, '2026-01-01T11:00:00Z'],
      [`${cells[2].content}::${cells[2].target_user_id}`, '2026-01-01T12:00:00Z'],
    ])
    const { firstBingoAt } = computeBingos(cells, validated)
    // Line completes when last cell is validated
    expect(firstBingoAt).toBe('2026-01-01T12:00:00Z')
  })

  it('picks the earliest line time as firstBingoAt when multiple bingos', () => {
    const cells = makeGrid()
    // Row 0 completes at 11:00, row 1 completes at 10:00 → firstBingoAt = 10:00
    const validated = new Map([
      [`${cells[0].content}::${cells[0].target_user_id}`, '2026-01-01T11:00:00Z'],
      [`${cells[1].content}::${cells[1].target_user_id}`, '2026-01-01T11:00:00Z'],
      [`${cells[2].content}::${cells[2].target_user_id}`, '2026-01-01T11:00:00Z'],
      [`${cells[3].content}::${cells[3].target_user_id}`, '2026-01-01T10:00:00Z'],
      [`${cells[4].content}::${cells[4].target_user_id}`, '2026-01-01T10:00:00Z'],
      [`${cells[5].content}::${cells[5].target_user_id}`, '2026-01-01T10:00:00Z'],
    ])
    const { firstBingoAt } = computeBingos(cells, validated)
    expect(firstBingoAt).toBe('2026-01-01T10:00:00Z')
  })

  it('returns null firstBingoAt when no bingo', () => {
    const cells = makeGrid()
    expect(computeBingos(cells, new Map()).firstBingoAt).toBeNull()
  })
})
