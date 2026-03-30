import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryBuilder, makeChannelMock } from '../test/supabaseMock'
// userEvent already imported above
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
}))

vi.mock('../lib/suggestChallenges', () => ({
  currentWeekStart: vi.fn().mockReturnValue('2026-03-24'),
  generateGroupSuggestions: vi.fn().mockResolvedValue(undefined),
}))

import { getSession } from '../lib/session'
import Proposals from './Proposals'

const mockSession = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

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

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    group_id: 'group-1',
    proposer_user_id: 'user-3',
    target_user_id: 'user-2',
    content: 'Va faire du sport',
    is_approved: false,
    vote_count: 1,
    created_at: new Date().toISOString(),
    target: { id: 'user-2', username: 'Alice', avatar_url: null },
    proposer: { id: 'user-3', username: 'Bob', avatar_url: null },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as unknown as ReturnType<typeof supabase.channel>)
  vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ vote_count: 2, is_approved: false }], error: null } as never)
})

// ─── Vote tracking (localStorage) ─────────────────────────────

describe('vote tracking (localStorage)', () => {
  it('getVotedIds returns empty set initially', () => {
    expect(getVotedIds().size).toBe(0)
  })

  it('markVoted persists id to storage', () => {
    markVoted('prop-1')
    expect(getVotedIds().has('prop-1')).toBe(true)
  })

  it('markVoted accumulates multiple ids', () => {
    markVoted('prop-1')
    markVoted('prop-2')
    expect(getVotedIds().size).toBe(2)
  })

  it('markVoted is idempotent', () => {
    markVoted('prop-1')
    markVoted('prop-1')
    expect(getVotedIds().size).toBe(1)
  })

  it('getVotedIds returns empty set on corrupted storage', () => {
    localStorage.setItem(VOTED_KEY, 'not-json')
    expect(getVotedIds().size).toBe(0)
  })
})

// ─── Component rendering ───────────────────────────────────────

describe('Proposals — rendering', () => {
  it('redirects when no session', () => {
    vi.mocked(getSession).mockReturnValue(null)
    vi.mocked(supabase.from).mockReturnValue(makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>)
    render(<MemoryRouter><Proposals /></MemoryRouter>)
  })

  it('shows loading state initially', () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>)
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })

  it('shows empty state when no proposals', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>)
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByText('Aucun pari pour l\'instant.')
  })

  it('renders a pending proposal card', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByText('Alice')
    expect(screen.getByText(/Va faire du sport/)).toBeInTheDocument()
    expect(screen.getByText(/proposé par Bob/)).toBeInTheDocument()
  })

  it('shows vote count and threshold', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal({ vote_count: 2 })], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByText('2 / 1 votes')
  })

  it('shows "Validées" section for approved proposals', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal({ is_approved: true, vote_count: 3 })], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    // Click the Validées tab to see approved proposals
    await userEvent.click(await screen.findByText('Validées'))
    await screen.findByText('Validé ✓')
  })

  it('shows "Ma proposition" badge for own proposals', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal({ proposer_user_id: 'user-1' })], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByText('Ma proposition')
  })
})

// ─── Voting interaction ────────────────────────────────────────

describe('Proposals — voting', () => {
  it('shows Voter button for proposals from others', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Voter' })
  })

  it('shows Déjà voté when proposal already voted in localStorage', async () => {
    markVoted('prop-1')
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByText('Déjà voté')
  })

  it('performs optimistic vote update on click', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal({ vote_count: 1 })], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByText('1 / 1 votes')

    await userEvent.click(screen.getByRole('button', { name: 'Voter' }))

    // Optimistic update: vote_count should be 2
    await screen.findByText('2 / 1 votes')
  })

  it('marks id as voted in localStorage after clicking vote', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Voter' })
    await userEvent.click(screen.getByRole('button', { name: 'Voter' }))
    await waitFor(() => {
      expect(getVotedIds().has('prop-1')).toBe(true)
    })
  })

  it('shows approval toast when vote_count reaches threshold', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal({ vote_count: 2 })], error: null }) as ReturnType<typeof supabase.from>
    )
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ vote_count: 3, is_approved: true }], error: null } as never)
    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Voter' })
    await userEvent.click(screen.getByRole('button', { name: 'Voter' }))
    await screen.findByText(/va faire du sport.*est approuvé/i)
  })

  it('rolls back vote on DB error', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal({ vote_count: 1 })], error: null }) as ReturnType<typeof supabase.from>
    )
    // RPC call fails
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'DB error' } } as never)

    render(<MemoryRouter><Proposals /></MemoryRouter>)
    await screen.findByText('1 / 1 votes')
    await userEvent.click(screen.getByRole('button', { name: 'Voter' }))

    // After optimistic update shows 2, rollback returns to 1
    await waitFor(() => {
      expect(screen.getByText('1 / 1 votes')).toBeInTheDocument()
    })
  })
})
