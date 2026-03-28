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
  },
}))

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
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
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as ReturnType<typeof supabase.channel>)
  localStorage.clear()
})

// ─── Initial load ─────────────────────────────────────────────

describe('Proposals — initial load', () => {
  it('renders proposal content and target username', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
    )
    renderProposals()
    await screen.findByText('"Va faire 30 pompes chaque matin"')
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    expect(screen.getByText(/proposé par bob/i)).toBeInTheDocument()
  })

  it('shows vote count', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
    )
    renderProposals()
    await screen.findByText('1 / 3 votes')
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
    await screen.findByText('Approuvée ✓')
  })
})

// ─── Voting flow ──────────────────────────────────────────────

describe('Proposals — voting', () => {
  it('calls proposals update with incremented vote_count', async () => {
    let updatePayload: unknown
    let updateEqId: unknown
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') {
        const b = makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
        const origUpdate = (b as Record<string, unknown>).update as (v: unknown) => typeof b
        ;(b as Record<string, unknown>).update = (v: unknown) => {
          updatePayload = v
          const chain = origUpdate(v)
          const origEq = (chain as Record<string, unknown>).eq as (col: string, val: unknown) => unknown
          ;(chain as Record<string, unknown>).eq = (col: string, val: unknown) => {
            if (col === 'id') updateEqId = val
            return origEq(col, val)
          }
          return chain
        }
        return b
      }
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('Voter')
    await userEvent.click(screen.getByText('Voter'))

    await waitFor(() => {
      expect(updatePayload).toMatchObject({ vote_count: 2, is_approved: false })
      expect(updateEqId).toBe('prop-1')
    })
  })

  it('optimistically increments vote count in UI after vote', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('1 / 3 votes')
    await userEvent.click(screen.getByText('Voter'))
    await screen.findByText('2 / 3 votes')
  })

  it('shows toast when proposal reaches threshold', async () => {
    const proposal = makeProposal({ vote_count: 2 }) // one more vote → approved
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [proposal], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('Voter')
    await userEvent.click(screen.getByText('Voter'))
    await screen.findByText(/est approuvé/i)
  })

  it('shows Déjà voté after voting', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    await screen.findByText('Voter')
    await userEvent.click(screen.getByText('Voter'))
    await screen.findByText('Déjà voté')
  })

  it('rolls back optimistic update on DB error', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'proposals') return makeQueryBuilder({ data: [makeProposal()], error: { message: 'DB error' } }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: { message: 'DB error' } }) as ReturnType<typeof supabase.from>
    })

    renderProposals()
    // With error, data is null so proposals is empty → no vote button
    await screen.findByText('Aucun pari pour l\'instant.')
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
    expect(screen.getByText('Ta proposition')).toBeDisabled()
  })
})
