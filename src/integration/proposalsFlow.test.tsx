/**
 * Integration — Proposals voting flow
 *
 * Tests the complete Proposals page interaction without mocking child components.
 * Supabase is mocked at the network boundary.
 */
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
import Proposals from '../pages/Proposals'

const SESSION = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    group_id: 'group-1',
    proposer_user_id: 'user-2',
    target_user_id: 'user-3',
    content: 'Va faire 30 pompes chaque matin',
    vote_count: 1,
    is_approved: false,
    created_at: new Date().toISOString(),
    target: { id: 'user-3', username: 'Charlie', avatar_url: null },
    proposer: { id: 'user-2', username: 'Bob', avatar_url: null },
    ...overrides,
  }
}

function renderProposals() {
  return render(<MemoryRouter><Proposals /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockReturnValue(SESSION)
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as unknown as ReturnType<typeof supabase.channel>)
  vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ vote_count: 2, is_approved: false }], error: null } as never)
  localStorage.clear()
})

// ─── Initial load ─────────────────────────────────────────────

describe('Proposals — initial load', () => {
  it('renders proposal content and target username', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })
    renderProposals()
    await screen.findByText('Charlie')
    expect(screen.getByText(/Va faire 30 pompes chaque matin/)).toBeInTheDocument()
    expect(screen.getByText(/proposé par bob/i)).toBeInTheDocument()
  })

  it('shows vote count', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
    )
    renderProposals()
    await screen.findByText('1 / 1 votes')
  })

  it('shows empty state when no proposals', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    )
    renderProposals()
    await screen.findByText('Aucun pari pour l\'instant.')
  })

  it('shows approved badge when proposal is already approved', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal({ is_approved: true, vote_count: 3 })], error: null }) as ReturnType<typeof supabase.from>
    )
    renderProposals()
    // Switch to the Validées tab to see the approved proposal
    await screen.findByText('Validées')
    await userEvent.click(screen.getByText('Validées'))
    await screen.findByText('Validé ✓')
  })
})

// ─── Voting flow ──────────────────────────────────────────────

describe('Proposals — voting', () => {
  it('calls rpc increment_vote_count on vote', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('Voter')
    await userEvent.click(screen.getByText('Voter'))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('increment_vote_count', {
        proposal_id: 'prop-1',
      })
    })
  })

  it('optimistically increments vote count in UI after vote', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('1 / 1 votes')
    await userEvent.click(screen.getByText('Voter'))
    await screen.findByText('2 / 1 votes')
  })

  it('shows toast when proposal reaches threshold', async () => {
    const proposal = makeProposal({ vote_count: 2 }) // one more vote → approved
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [proposal], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('Voter')
    await userEvent.click(screen.getByText('Voter'))
    await screen.findByText(/est approuvé/i)
  })

  it('shows Déjà voté after voting', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('Voter')
    await userEvent.click(screen.getByText('Voter'))
    await screen.findByText('Déjà voté')
  })

  it('rolls back optimistic update on DB error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'DB error' } } as never)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('1 / 1 votes')
    await userEvent.click(screen.getByText('Voter'))
    // After error, vote count should roll back to 1
    await screen.findByText('1 / 1 votes')
  })
})

// ─── Own proposal ─────────────────────────────────────────────

describe('Proposals — own proposal', () => {
  it('shows Ma proposition badge and disabled button for own proposal', async () => {
    const ownProposal = makeProposal({ proposer_user_id: 'user-1' })
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [ownProposal], error: null }) as ReturnType<typeof supabase.from>
    )

    renderProposals()
    await screen.findByText('Ma proposition')
    // The disabled button shows "Ta proposition" text
    const btn = screen.getByText('Ta proposition')
    expect(btn).toBeDisabled()
  })
})
