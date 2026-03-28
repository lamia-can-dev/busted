/**
 * Integration — Feed voting flow
 *
 * Tests the complete Feed + vote interaction without mocking child components.
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
import Feed from '../pages/Feed'

const SESSION = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

function makeSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    cell_id: 'cell-1',
    submitter_user_id: 'user-2',
    proof_text: 'Voici ma preuve',
    proof_image_url: null,
    created_at: new Date().toISOString(),
    cell: {
      id: 'cell-1',
      content: 'Va courir chaque jour',
      target: { id: 'user-1', username: 'Alice' },
    },
    submitter: { id: 'user-2', username: 'Bob', avatar_url: null },
    votes: [],
    ...overrides,
  }
}

function renderFeed() {
  return render(<MemoryRouter><Feed /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockReturnValue(SESSION)
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as ReturnType<typeof supabase.channel>)
})

// ─── Feed loading ──────────────────────────────────────────────

describe('Feed — initial load', () => {
  it('shows submission content when feed loads', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('"Va courir chaque jour"')
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText(/pari sur alice/i)).toBeInTheDocument()
  })

  it('shows empty state when no submissions', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    )

    renderFeed()
    await screen.findByText('Aucune preuve pour le moment.')
  })
})

// ─── Feed voting flow ─────────────────────────────────────────

describe('Feed — voting as the target user', () => {
  it('shows validate and contest buttons when current user is the target', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('✓ Valider')
    expect(screen.getByText('✗ Contester')).toBeInTheDocument()
  })

  it('clicking validate calls votes insert with is_valid=true', async () => {
    let insertPayload: unknown
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'votes') {
        const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
        const origInsert = (b as Record<string, unknown>).insert as (v: unknown) => unknown
        ;(b as Record<string, unknown>).insert = (v: unknown) => { insertPayload = v; return origInsert(v) }
        return b
      }
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('✓ Valider')
    await userEvent.click(screen.getByText('✓ Valider'))

    await waitFor(() => {
      expect(insertPayload).toMatchObject({
        submission_id: 'sub-1',
        voter_user_id: 'user-1',
        is_valid: true,
      })
    })
  })

  it('clicking contest calls votes insert with is_valid=false', async () => {
    let insertPayload: unknown
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
      if (table === 'votes') {
        const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
        const origInsert = (b as Record<string, unknown>).insert as (v: unknown) => unknown
        ;(b as Record<string, unknown>).insert = (v: unknown) => { insertPayload = v; return origInsert(v) }
        return b
      }
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('✗ Contester')
    await userEvent.click(screen.getByText('✗ Contester'))

    await waitFor(() => {
      expect(insertPayload).toMatchObject({
        submission_id: 'sub-1',
        voter_user_id: 'user-1',
        is_valid: false,
      })
    })
  })

  it('shows Validé ✓ badge after validate optimistic update', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('✓ Valider')
    await userEvent.click(screen.getByText('✓ Valider'))
    await screen.findByText('Validé ✓')
  })

  it('shows Contesté ✗ badge after contest optimistic update', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('✗ Contester')
    await userEvent.click(screen.getByText('✗ Contester'))
    await screen.findByText('Contesté ✗')
  })
})

// ─── Feed — as non-target user ────────────────────────────────

describe('Feed — as the submitter (not target)', () => {
  it('shows waiting message instead of vote buttons when current user is submitter', async () => {
    // user-1 is the submitter, target is user-2
    const submission = makeSubmission({
      submitter_user_id: 'user-1',
      cell: {
        id: 'cell-1',
        content: 'Va courir chaque jour',
        target: { id: 'user-2', username: 'Bob' },
      },
      submitter: { id: 'user-1', username: 'Alice', avatar_url: null },
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [submission], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('"Va courir chaque jour"')
    expect(screen.queryByText('✓ Valider')).toBeNull()
    expect(screen.getByText(/en attente de validation par bob/i)).toBeInTheDocument()
  })
})

// ─── Feed — submission already voted ──────────────────────────

describe('Feed — submission already voted', () => {
  it('does not show vote buttons when submission already has a target vote', async () => {
    const submission = makeSubmission({
      votes: [{ id: 'v-1', submission_id: 'sub-1', voter_user_id: 'user-1', is_valid: true, created_at: '' }],
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'submissions') return makeQueryBuilder({ data: [submission], error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    })

    renderFeed()
    await screen.findByText('Validé ✓')
    expect(screen.queryByText('✓ Valider')).toBeNull()
  })
})
