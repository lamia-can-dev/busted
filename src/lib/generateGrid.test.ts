import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateGridFromPool } from './generateGrid'
import { supabase } from './supabase'
import { makeQueryBuilder } from '../test/supabaseMock'

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const mockFrom = vi.mocked(supabase.from)

function makeProposals(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `proposal-${i}`,
    group_id: 'group-1',
    target_user_id: `target-${i}`,
    content: `content-${i}`,
    is_approved: true,
    vote_count: 3,
    proposer_user_id: 'proposer-1',
    created_at: new Date().toISOString(),
  }))
}

const mockGrid = {
  id: 'grid-1',
  owner_user_id: 'user-1',
  group_id: 'group-1',
  week_start: '2026-03-24',
  is_revealed: false,
  created_at: new Date().toISOString(),
}

function makeCells(gridId: string) {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `cell-${i}`,
    grid_id: gridId,
    target_user_id: `target-${i}`,
    content: `content-${i}`,
    is_auto_generated: false,
    position: i,
    created_at: new Date().toISOString(),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateGridFromPool', () => {
  it('throws when fewer than 9 approved proposals are available', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: makeProposals(5), error: null }) as ReturnType<typeof supabase.from>)

    await expect(generateGridFromPool('user-1', 'group-1')).rejects.toThrow(
      'Pas assez de paris approuvés'
    )
  })

  it('throws when proposals query returns an error', async () => {
    mockFrom.mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: 'DB error' } }) as ReturnType<typeof supabase.from>
    )

    await expect(generateGridFromPool('user-1', 'group-1')).rejects.toThrow('Erreur lecture pool')
  })

  it('inserts exactly 9 cells with positions 0-8', async () => {
    const proposals = makeProposals(12)
    const cells = makeCells('grid-1')

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // proposals query
        return makeQueryBuilder({ data: proposals, error: null }) as ReturnType<typeof supabase.from>
      }
      if (callCount === 2) {
        // grid insert
        const b = makeQueryBuilder({ data: mockGrid, error: null }) as ReturnType<typeof supabase.from>
        return b
      }
      // cells insert
      return makeQueryBuilder({ data: cells, error: null }) as ReturnType<typeof supabase.from>
    })

    const result = await generateGridFromPool('user-1', 'group-1')
    expect(result.cells).toHaveLength(9)
    expect(result.grid.id).toBe('grid-1')
  })

  it('throws when grid insertion fails', async () => {
    const proposals = makeProposals(10)

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeQueryBuilder({ data: proposals, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: { message: 'insert failed' } }) as ReturnType<typeof supabase.from>
    })

    await expect(generateGridFromPool('user-1', 'group-1')).rejects.toThrow('Erreur création grille')
  })

  it('throws when cells insertion fails', async () => {
    const proposals = makeProposals(10)

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeQueryBuilder({ data: proposals, error: null }) as ReturnType<typeof supabase.from>
      if (callCount === 2) return makeQueryBuilder({ data: mockGrid, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: { message: 'cells failed' } }) as ReturnType<typeof supabase.from>
    })

    await expect(generateGridFromPool('user-1', 'group-1')).rejects.toThrow('Erreur insertion cases')
  })
})
