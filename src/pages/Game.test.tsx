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

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
}))

vi.mock('../lib/generateGrid', () => ({
  generateGridFromPool: vi.fn(),
}))

import { getSession } from '../lib/session'
import { generateGridFromPool } from '../lib/generateGrid'
import Game from './Game'

const mockSession = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

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
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as ReturnType<typeof supabase.channel>)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
})

// ─── No session ───────────────────────────────────────────────

describe('Game — no session', () => {
  it('returns null when no session', () => {
    vi.mocked(getSession).mockReturnValue(null)
    mockFromByTable()
    const { container } = render(<MemoryRouter><Game /></MemoryRouter>)
    expect(container.firstChild).toBeNull()
  })
})

// ─── No grid yet ──────────────────────────────────────────────

describe('Game — no grid', () => {
  beforeEach(() => vi.mocked(getSession).mockReturnValue(mockSession))

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
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 5 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText(/5\/9 paris approuvés/)
  })

  it('shows generate button when ≥9 proposals approved', async () => {
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 10 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByRole('button', { name: /générer ma grille/i })
  })

  it('does not show generate button when <9 proposals', async () => {
    mockFromByTable({ grids: { data: [], error: null }, proposals: { data: null, error: null, count: 4 } })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText(/4\/9 paris approuvés/)
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

// ─── Grid with cells ──────────────────────────────────────────

describe('Game — grid with cells', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReturnValue(mockSession)
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

  it('opens SubmitProof on unsubmitted cell click', async () => {
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('Pari 0')
    await userEvent.click(screen.getAllByText('Pari 0')[0])
    await screen.findByText(/soumettre la preuve/i)
  })

  it('does not open SubmitProof when cell already has a submission', async () => {
    const cellsWithSubmission = mockCells.map((c, i) =>
      i === 0 ? { ...c, content: 'Pari 0 done' } : c
    )
    const submissionsData = [{
      cell: { content: 'Pari 0 done', target_user_id: 'user-2' },
      votes: [{ voter_user_id: 'user-2', is_valid: true }],
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
    // SubmitProof should not open
    expect(screen.queryByText(/soumettre la preuve/i)).toBeNull()
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
    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('CODE42')
    )
    await screen.findByText('✓ Lien copié !')
  })
})

// ─── Bingo detection ──────────────────────────────────────────

describe('Game — bingo detection', () => {
  it('shows bingo badge when a row is fully validated', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
    }))
    const submissions = [0, 1, 2].map((i) => ({
      cell: { content: `pari-${i}`, target_user_id: 'user-2' },
      votes: [{ voter_user_id: 'user-2', is_valid: true }],
    }))
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: submissions, error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText(/1 bingo/)
  })

  it('shows ★ status on bingo cells', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
    }))
    const submissions = [0, 1, 2].map((i) => ({
      cell: { content: `pari-${i}`, target_user_id: 'user-2' },
      votes: [{ voter_user_id: 'user-2', is_valid: true }],
    }))
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: submissions, error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findAllByText('★')
  })

  it('shows ✓ on validated non-bingo cells', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
    }))
    // Only cell 0 is validated — not a full line
    const submissions = [{
      cell: { content: 'pari-0', target_user_id: 'user-2' },
      votes: [{ voter_user_id: 'user-2', is_valid: true }],
    }]
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: submissions, error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('✓')
  })

  it('shows ✗ on contested cells', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
    }))
    const submissions = [{
      cell: { content: 'pari-0', target_user_id: 'user-2' },
      votes: [{ voter_user_id: 'user-2', is_valid: false }],
    }]
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: submissions, error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('✗')
  })

  it('shows ⏳ on pending cells (submission with no target vote yet)', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = Array.from({ length: 9 }, (_, i) => ({
      id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
      content: `pari-${i}`, position: i, is_auto_generated: false,
      created_at: new Date().toISOString(),
    }))
    const submissions = [{
      cell: { content: 'pari-0', target_user_id: 'user-2' },
      votes: [], // no vote yet
    }]
    mockFromByTable({
      grids: { data: [mockGrid], error: null },
      cells: { data: cells, error: null },
      users: { data: mockUsers, error: null },
      submissions: { data: submissions, error: null },
    })
    render(<MemoryRouter><Game /></MemoryRouter>)
    await screen.findByText('⏳')
  })
})
