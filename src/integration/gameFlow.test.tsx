/**
 * Integration — Game page flows
 *
 * Tests complete user interactions across Game + its child modals
 * (ProposeCell, CellSheet, ProofSheet) without mocking those components.
 * Only Supabase is mocked at the network boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryBuilder, makeChannelMock, makeStorageMock } from '../test/supabaseMock'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    storage: { from: vi.fn() },
  },
}))

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
}))

vi.mock('../lib/generateGrid', () => ({
  generateGridFromPool: vi.fn(),
}))

vi.mock('../lib/compressImage', () => ({
  compressImage: vi.fn().mockResolvedValue(new Blob(['compressed'], { type: 'image/jpeg' })),
}))

import { getSession } from '../lib/session'
import Game from '../pages/Game'

const SESSION = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

const GRID = {
  id: 'grid-1', owner_user_id: 'user-1', group_id: 'group-1',
  week_start: '2026-03-24', is_revealed: false, created_at: '2026-03-24T00:00:00Z',
}

const CELLS = Array.from({ length: 9 }, (_, i) => ({
  id: `cell-${i}`, grid_id: 'grid-1', target_user_id: 'user-2',
  content: `Pari ${i}`, position: i, is_auto_generated: false,
  created_at: new Date().toISOString(),
}))

const USERS = [{ id: 'user-2', username: 'Alice', avatar_url: null, group_id: 'group-1', onboarding_answers: null, created_at: '' }]
const MEMBERS = [
  ...USERS,
  { id: 'user-3', username: 'Bob', avatar_url: null, group_id: 'group-1', onboarding_answers: null, created_at: '' },
]

function mockFromByTable(overrides: Record<string, { data: unknown; error: unknown; count?: number }>) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table in overrides) return makeQueryBuilder(overrides[table]) as ReturnType<typeof supabase.from>
    return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
  })
}

function renderGame() {
  return render(<MemoryRouter><Game /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockReturnValue(SESSION)
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as unknown as ReturnType<typeof supabase.channel>)
  vi.mocked(supabase.storage.from).mockReturnValue(makeStorageMock() as unknown as ReturnType<typeof supabase.storage.from>)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
})

// ─── Game → ProposeCell integration ───────────────────────────

describe('Game + ProposeCell', () => {
  beforeEach(() => {
    mockFromByTable({
      grids: { data: [GRID], error: null },
      cells: { data: CELLS, error: null },
      users: { data: USERS, error: null },
      submissions: { data: [], error: null },
    })
    // ProposeCell fetches group members (excluding self)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [GRID], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: CELLS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: MEMBERS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'submissions') return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'proposals') return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })
  })

  it('opens ProposeCell modal from Game FAB and renders member list', async () => {
    renderGame()
    await waitFor(() => screen.getByText('+'))
    await userEvent.click(screen.getByText('+'))
    // ProposeCell renders and loads members from the same Supabase mock
    await screen.findByText('Proposer une case')
    // Alice appears in both grid cells and member list — use findAllByText
    await screen.findAllByText('Alice')
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('ProposeCell submit calls proposals insert with correct payload', async () => {
    let insertPayload: unknown
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [GRID], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: CELLS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: MEMBERS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'submissions') return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'proposals') {
        const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
        const origInsert = (b as Record<string, unknown>).insert as (v: unknown) => unknown
        ;(b as Record<string, unknown>).insert = (v: unknown) => { insertPayload = v; return origInsert(v) }
        return b
      }
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderGame()
    await waitFor(() => screen.getByText('+'))
    await userEvent.click(screen.getByText('+'))
    await screen.findByText('Proposer une case')
    await screen.findAllByText('Alice')

    await userEvent.type(
      screen.getByPlaceholderText(/thomas va parler/i),
      'Va faire du sport pendant 30 jours'
    )
    await userEvent.click(screen.getByRole('button', { name: /proposer →/i }))

    await screen.findByText('✓ Proposition envoyée !')
    expect(insertPayload).toMatchObject({
      group_id: 'group-1',
      proposer_user_id: 'user-1',
      content: 'Va faire du sport pendant 30 jours',
    })
  })

  it('shows error in ProposeCell when proposal already exists', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [GRID], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: CELLS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: MEMBERS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'submissions') return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
      // proposals: maybeSingle returns existing proposal
      if (table === 'proposals') return makeQueryBuilder({ data: { id: 'existing' }, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderGame()
    await waitFor(() => screen.getByText('+'))
    await userEvent.click(screen.getByText('+'))
    await screen.findAllByText('Alice')

    await userEvent.type(screen.getByPlaceholderText(/thomas va parler/i), 'Un pari doublon')
    await userEvent.click(screen.getByRole('button', { name: /proposer →/i }))
    await screen.findByText('Cette case a déjà été proposée.')
  })
})

// ─── Game → CellSheet → ProofSheet integration ──────────────

describe('Game + CellSheet + ProofSheet', () => {
  beforeEach(() => {
    mockFromByTable({
      grids: { data: [GRID], error: null },
      cells: { data: CELLS, error: null },
      users: { data: USERS, error: null },
      submissions: { data: [], error: null },
    })
  })

  it('opens CellSheet with correct cell content when cell is clicked', async () => {
    renderGame()
    await screen.findByText('Pari 3')
    await userEvent.click(screen.getAllByText('Pari 3')[0])
    // CellSheet renders cell content as plain text (no quotes)
    // and shows the target username
    await screen.findByText('Soumettre une preuve')
    // The username appears in the sheet
    const aliceElements = screen.getAllByText('Alice')
    expect(aliceElements.length).toBeGreaterThan(0)
  })

  it('full submit proof flow: CellSheet → ProofSheet → type text → submit → success', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [GRID], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: CELLS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: USERS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'submissions') return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderGame()
    await screen.findByText('Pari 0')
    await userEvent.click(screen.getAllByText('Pari 0')[0])
    // CellSheet opens with "Soumettre une preuve" button
    await screen.findByText('Soumettre une preuve')
    await userEvent.click(screen.getByText('Soumettre une preuve'))

    // ProofSheet opens with its own UI
    await screen.findByPlaceholderText(/décris ce qui/i)
    await userEvent.type(screen.getByPlaceholderText(/décris ce qui/i), 'Voici la preuve complète')
    await userEvent.click(screen.getByRole('button', { name: /envoyer au groupe/i }))
    await screen.findByText(/preuve envoyée/i)
  })

  it('ProofSheet insert payload contains correct cell_id and submitter', async () => {
    let insertPayload: unknown
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [GRID], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: CELLS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: USERS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'submissions') {
        const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
        const origInsert = (b as Record<string, unknown>).insert as (v: unknown) => unknown
        ;(b as Record<string, unknown>).insert = (v: unknown) => { insertPayload = v; return origInsert(v) }
        return b
      }
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderGame()
    await screen.findByText('Pari 1')
    await userEvent.click(screen.getAllByText('Pari 1')[0])
    // CellSheet opens
    await screen.findByText('Soumettre une preuve')
    await userEvent.click(screen.getByText('Soumettre une preuve'))

    // ProofSheet opens
    await screen.findByPlaceholderText(/décris ce qui/i)
    await userEvent.type(screen.getByPlaceholderText(/décris ce qui/i), 'Proof text here')
    await userEvent.click(screen.getByRole('button', { name: /envoyer au groupe/i }))
    await screen.findByText(/preuve envoyée/i)

    expect(insertPayload).toMatchObject({
      cell_id: 'cell-1',
      submitter_user_id: 'user-1',
      proof_text: 'Proof text here',
    })
  })

  it('submit button stays disabled with no text and no image', async () => {
    renderGame()
    await screen.findByText('Pari 0')
    await userEvent.click(screen.getAllByText('Pari 0')[0])
    // CellSheet opens
    await screen.findByText('Soumettre une preuve')
    await userEvent.click(screen.getByText('Soumettre une preuve'))

    // ProofSheet opens - submit button should be disabled
    await screen.findByPlaceholderText(/décris ce qui/i)
    expect(screen.getByRole('button', { name: /envoyer au groupe/i })).toBeDisabled()
  })

  it('ProofSheet shows already-submitted error within Game flow', async () => {
    // Game loadGrid needs submissions as an empty array so cells render with submission=null
    // ProofSheet's duplicate check (maybeSingle) needs to return an existing submission
    let submissionsCallCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'grids') return makeQueryBuilder({ data: [GRID], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'cells') return makeQueryBuilder({ data: CELLS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: USERS, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'submissions') {
        submissionsCallCount++
        // First call: Game's loadGrid — return empty array so cells have no submission
        // Second call: ProofSheet's duplicate check — return existing submission
        if (submissionsCallCount === 1) {
          return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
        }
        return makeQueryBuilder({ data: { id: 'existing-sub' }, error: null }) as ReturnType<typeof supabase.from>
      }
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderGame()
    await screen.findByText('Pari 2')
    await userEvent.click(screen.getAllByText('Pari 2')[0])
    // CellSheet opens
    await screen.findByText('Soumettre une preuve')
    await userEvent.click(screen.getByText('Soumettre une preuve'))

    // ProofSheet opens
    await screen.findByPlaceholderText(/décris ce qui/i)
    await userEvent.type(screen.getByPlaceholderText(/décris ce qui/i), 'Proof')
    await userEvent.click(screen.getByRole('button', { name: /envoyer au groupe/i }))
    await screen.findByText('Tu as déjà soumis une preuve pour cette case.')
  })
})
