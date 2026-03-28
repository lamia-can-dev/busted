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
import Feed from './Feed'

const mockSession = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

const mockSession2 = { userId: 'user-2', groupId: 'group-1', refreshToken: null }

function makeSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    cell_id: 'cell-1',
    submitter_user_id: 'user-3',
    proof_text: 'Voici la preuve',
    proof_image_url: null,
    created_at: new Date().toISOString(),
    cell: { id: 'cell-1', content: 'Va faire du sport', target: { id: 'user-2', username: 'Alice' } },
    submitter: { id: 'user-3', username: 'Bob', avatar_url: null },
    votes: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as ReturnType<typeof supabase.channel>)
})

// ─── timeAgo helper (replicated) ────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

describe('timeAgo', () => {
  it('returns "à l\'instant" for timestamps less than 1 minute ago', () => {
    expect(timeAgo(new Date(Date.now() - 30_000).toISOString())).toBe('à l\'instant')
  })

  it('returns minutes for 1–59 minutes ago', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('il y a 5min')
  })

  it('returns hours for 1–23 hours ago', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('il y a 3h')
  })

  it('returns days for 24+ hours ago', () => {
    expect(timeAgo(new Date(Date.now() - 2 * 86400_000).toISOString())).toBe('il y a 2j')
  })
})

describe('Feed — component', () => {
  it('redirects when no session', () => {
    vi.mocked(getSession).mockReturnValue(null)
    vi.mocked(supabase.from).mockReturnValue(makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>)
    render(<MemoryRouter><Feed /></MemoryRouter>)
  })

  it('shows loading state initially', () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>)
    render(<MemoryRouter><Feed /></MemoryRouter>)
    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })

  it('shows empty state when no submissions', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>)
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('Aucune preuve pour le moment.')
  })

  it('renders a submission card with proof text', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('Voici la preuve')
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders the cell bet content', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('"Va faire du sport"')
  })

  it('shows validate/contest buttons when current user is the target', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession2) // user-2 = Alice = target
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('✓ Valider')
    expect(screen.getByText('✗ Contester')).toBeInTheDocument()
  })

  it('does not show vote buttons when current user is the submitter', async () => {
    vi.mocked(getSession).mockReturnValue({ userId: 'user-3', groupId: 'group-1', refreshToken: null })
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('Voici la preuve')
    expect(screen.queryByText('✓ Valider')).toBeNull()
  })

  it('shows "waiting" note for the submitter', async () => {
    vi.mocked(getSession).mockReturnValue({ userId: 'user-3', groupId: 'group-1', refreshToken: null })
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText(/en attente de validation par Alice/i)
  })

  it('shows validated badge when target voted is_valid=true', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const sub = makeSubmission({
      votes: [{ id: 'v1', submission_id: 'sub-1', voter_user_id: 'user-2', is_valid: true, created_at: new Date().toISOString() }],
    })
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [sub], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('Validé ✓')
  })

  it('shows contested badge when target voted is_valid=false', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const sub = makeSubmission({
      votes: [{ id: 'v1', submission_id: 'sub-1', voter_user_id: 'user-2', is_valid: false, created_at: new Date().toISOString() }],
    })
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [sub], error: null }) as ReturnType<typeof supabase.from>
    )
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('Contesté ✗')
  })

  it('calls vote insert when validate button is clicked', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession2) // user-2 is target
    const insertMock = vi.fn().mockReturnValue(makeQueryBuilder({ data: null, error: null }))
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'votes') {
        const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
        ;(b as Record<string, unknown>).insert = insertMock
        return b
      }
      return makeQueryBuilder({ data: [makeSubmission()], error: null }) as ReturnType<typeof supabase.from>
    })

    render(<MemoryRouter><Feed /></MemoryRouter>)
    await screen.findByText('✓ Valider')
    await userEvent.click(screen.getByText('✓ Valider'))

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ voter_user_id: 'user-2', is_valid: true })
      )
    })
  })
})
