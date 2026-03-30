import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryBuilder, makeChannelMock } from '../test/supabaseMock'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/generateGrid', () => ({
  generateGridFromPool: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'
import { generateGridFromPool } from '../lib/generateGrid'
import Game from './Game'

const mockGrid = {
  id: 'grid-1',
  owner_user_id: 'user-1',
  group_id: 'group-1',
  week_start: '2026-03-24',
  is_revealed: false,
  created_at: '2026-03-24T00:00:00Z',
}

const mockCells = Array.from({ length: 9 }, (_, i) => ({
  id: `cell-${i}`,
  grid_id: 'grid-1',
  target_user_id: 'user-2',
  content: `Pari ${i}`,
  position: i,
  is_auto_generated: false,
  created_at: new Date().toISOString(),
}))

const mockUsers = [
  { id: 'user-2', username: 'Alice', avatar_url: null, group_id: 'group-1', onboarding_answers: null, created_at: '' },
]

function mockFromByTable(overrides: Record<string, { data: unknown; error: unknown; count?: number }> = {}) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table in overrides) return makeQueryBuilder(overrides[table]) as ReturnType<typeof supabase.from>
    return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ userId: 'user-1', groupId: 'group-1', loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs: vi.fn() })
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as unknown as ReturnType<typeof supabase.channel>)
  localStorage.setItem('busted_tutorial_done', 'true')
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
})

// --- No grid yet ---

describe('Game — no grid', () => {
  it('shows loading state initially', () => {
    mockFromByTable({ grids: { data: [], error: null } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    expect(screen.getByText('Chargement de ta grille...')).toBeInTheDocument()
  })

  it('shows empty state when no grid exists', async () => {
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 3 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Pas encore de grille pour cette semaine.')
  })

  it('shows approved proposal count', async () => {
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 10 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText(/10\/9 paris approuvés/)
  })

  it('shows generate button when ≥9 proposals approved', async () => {
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 10 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByRole('button', { name: /générer ma grille/i })
  })

  it('does not show generate button when <9 proposals', async () => {
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 5 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText(/5\/9 paris approuvés/)
    expect(screen.queryByRole('button', { name: /générer/i })).toBeNull()
  })

  it('shows hint to go vote when fewer than 9 proposals', async () => {
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 2 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText(/propose des paris dans l'onglet votes/i)
  })

  it('calls generateGridFromPool when generate is clicked', async () => {
    vi.mocked(generateGridFromPool).mockResolvedValue({ grid: mockGrid as never, cells: [] })
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') {
        callCount++
        return makeQueryBuilder({ data: callCount > 1 ? [mockGrid] : [], error: null }) as ReturnType<typeof supabase.from>
      }
      if (table === 'proposals') return makeQueryBuilder({ data: null, error: null, count: 10 }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /générer ma grille/i }))
    expect(generateGridFromPool).toHaveBeenCalledWith('user-1', 'group-1')
  })

  it('shows error when grid generation fails', async () => {
    vi.mocked(generateGridFromPool).mockRejectedValue(new Error('Pas assez de paris'))
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 10 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /générer ma grille/i }))
    await screen.findByText('Pas assez de paris')
  })

  it('shows grid load error when grids query fails', async () => {
    mockFromByTable({ grids: { data: null, error: { message: 'Accès refusé' } } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Accès refusé')
  })
})

// --- Grid with cells ---

describe('Game — grid with cells', () => {
  beforeEach(() => {
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: mockCells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: [], error: null },
    })
  })

  it('renders all 9 cell contents', async () => {
    render(<MemoryRouter><Game /></MemoryRouter>)
    for (let i = 0; i < 9; i++) await screen.findByText(`Pari ${i}`)
  })

  it('renders the Busted title', async () => {
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Busted')
  })

  it('renders FAB button', async () => {
    render(<MemoryRouter><Game /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('+')).toBeInTheDocument())
  })

  it('shows cell target username', async () => {
    render(<MemoryRouter><Game /></MemoryRouter>)
    const aliceItems = await screen.findAllByText('Alice')
    expect(aliceItems.length).toBeGreaterThan(0)
  })

  it('opens ProposeCell modal on FAB click', async () => {
    render(<MemoryRouter><Game /></MemoryRouter>)
    await waitFor(() => screen.getByText('+'))
    await userEvent.click(screen.getByText('+'))
    await screen.findByText('Proposer une case')
  })

  it('opens CellSheet on unsubmitted cell click', async () => {
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Pari 0')
    await userEvent.click(screen.getAllByText('Pari 0')[0])
    // CellSheet shows "Soumettre une preuve" button for unchecked cells
    await screen.findByText('Soumettre une preuve')
  })

  it('does not open SubmitProof when cell already has a submission', async () => {
    const cellsWithSubmission = mockCells.map((c, i) =>
      i === 0 ? { ...c, content: 'Pari 0 done', status: 'busted' } : c
    )
    const submissionsData = [{
      id: 'sub-0',
      cell_id: 'cell-0',
      submitter_user_id: 'user-1',
      proof_text: 'Done',
      proof_image_url: null,
      created_at: '2026-03-25T10:00:00Z',
    }]
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cellsWithSubmission, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: submissionsData, error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Pari 0 done')
    await userEvent.click(screen.getAllByText('Pari 0 done')[0])
    // CellSheet opens but does NOT show "Soumettre une preuve" for busted cells
    // It should show the proof card instead
    expect(screen.queryByText('Soumettre une preuve')).toBeNull()
  })

  it('shows invite sheet after clicking invite button', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [mockGrid], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: mockCells, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: mockUsers, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'groups') return makeQueryBuilder({ data: { invite_code: 'XYZ999' }, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Pari 0')
    await userEvent.click(document.querySelector('button[title="Inviter"]') as HTMLElement)
    await screen.findByText('XYZ999')
    expect(screen.getByText('Inviter des amis')).toBeInTheDocument()
  })

  it('shows copy button in invite sheet', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [mockGrid], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: mockCells, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: mockUsers, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'groups') return makeQueryBuilder({ data: { invite_code: 'CODE42' }, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Pari 0')
    await userEvent.click(document.querySelector('button[title="Inviter"]') as HTMLElement)
    await screen.findByText('CODE42')
    await userEvent.click(screen.getByRole('button', { name: /copier le code/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('CODE42')
    await screen.findByText('✓ Code copié !')
  })
})

// --- Bingo detection ---

describe('Game — bingo detection', () => {
  it('shows bingo badge when a row is fully validated', async () => {
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
      // First row (positions 0,1,2) are busted
      status: i < 3 ? 'busted' : 'unchecked',
    }))
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: [], error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText(/BINGO/)
  })

  it('shows Busted ! status on busted cells', async () => {
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
      status: i < 3 ? 'busted' : 'unchecked',
    }))
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: [], error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findAllByText('Busted !')
  })

  it('shows Busted ! on validated non-bingo cells', async () => {
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
      // Only cell 0 is busted — not a full line
      status: i === 0 ? 'busted' : 'unchecked',
    }))
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: [], error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Busted !')
  })

  it('shows Rejeté on rejected cells', async () => {
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
      status: i === 0 ? 'rejected' : 'unchecked',
    }))
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: [], error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Rejeté')
  })

  it('shows En attente de validation on pending cells', async () => {
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
      status: i === 0 ? 'pending_confirmation' : 'unchecked',
    }))
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: [], error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('En attente de validation')
  })
})
