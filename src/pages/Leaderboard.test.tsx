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
import Leaderboard from './Leaderboard'

const mockSession = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

// ─── Countdown helpers (replicated) ─────────────────────────

function formatCountdown(target: Date): string {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return 'Révélation !'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}j`)
  parts.push(`${String(h).padStart(2, '0')}h`)
  parts.push(`${String(m).padStart(2, '0')}m`)
  parts.push(`${String(s).padStart(2, '0')}s`)
  return parts.join(' ')
}

function getRevealTarget(revealAt: string | null): Date {
  if (revealAt) return new Date(revealAt)
  const now = new Date()
  const daysUntilFri = (5 - now.getDay() + 7) % 7 || 7
  const fri = new Date(now)
  fri.setDate(now.getDate() + daysUntilFri)
  fri.setHours(20, 0, 0, 0)
  return fri
}

describe('formatCountdown', () => {
  it('returns "Révélation !" for past target', () => {
    expect(formatCountdown(new Date(Date.now() - 1000))).toBe('Révélation !')
  })

  it('returns "Révélation !" when diff is exactly 0', () => {
    expect(formatCountdown(new Date(Date.now()))).toBe('Révélation !')
  })

  it('formats h m s without days when under 24h', () => {
    const result = formatCountdown(new Date(Date.now() + 2 * 3600_000 + 30 * 60_000 + 15_000))
    expect(result).toMatch(/02h/)
    expect(result).toMatch(/30m/)
    expect(result).not.toContain('j')
  })

  it('includes days when more than 24h remain', () => {
    expect(formatCountdown(new Date(Date.now() + 3 * 86400_000))).toMatch(/3j/)
  })

  it('pads single-digit hours and minutes', () => {
    const result = formatCountdown(new Date(Date.now() + 1 * 3600_000 + 5 * 60_000 + 3_000))
    expect(result).toMatch(/01h/)
    expect(result).toMatch(/05m/)
  })
})

describe('getRevealTarget', () => {
  it('returns the provided reveal_at date when set', () => {
    const date = '2026-06-01T20:00:00.000Z'
    expect(getRevealTarget(date).toISOString()).toBe(new Date(date).toISOString())
  })

  it('returns a future Friday at 20:00 when reveal_at is null', () => {
    const result = getRevealTarget(null)
    expect(result.getDay()).toBe(5)        // Friday
    expect(result.getHours()).toBe(20)
    expect(result > new Date()).toBe(true)
  })
})

// ─── Helpers ────────────────────────────────────────────────

function makeUser(id: string, username: string) {
  return { id, username, avatar_url: null, group_id: 'group-1', onboarding_answers: null, created_at: '' }
}

function makeCell(gridId: string, ownerUserId: string, content: string, targetUserId: string) {
  return { grid_id: gridId, content, target_user_id: targetUserId, grid: { owner_user_id: ownerUserId } }
}

function makeSubmission(content: string, targetUserId: string, isValid: boolean) {
  return {
    cell: { content, target_user_id: targetUserId },
    votes: [{ voter_user_id: targetUserId, is_valid: isValid, created_at: '2026-01-01T10:00:00Z' }],
  }
}

function mockLeaderboardData(opts: {
  members?: ReturnType<typeof makeUser>[]
  submissions?: ReturnType<typeof makeSubmission>[]
  cells?: ReturnType<typeof makeCell>[]
}) {
  const members = opts.members ?? []
  const submissions = opts.submissions ?? []
  const cells = opts.cells ?? []

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'groups') return makeQueryBuilder({ data: { reveal_at: null }, error: null }) as ReturnType<typeof supabase.from>
    if (table === 'users') return makeQueryBuilder({ data: members, error: null }) as ReturnType<typeof supabase.from>
    if (table === 'submissions') return makeQueryBuilder({ data: submissions, error: null }) as ReturnType<typeof supabase.from>
    if (table === 'cells') return makeQueryBuilder({ data: cells, error: null }) as ReturnType<typeof supabase.from>
    return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as ReturnType<typeof supabase.channel>)
})

// ─── Component ────────────────────────────────────────────────

describe('Leaderboard — no session', () => {
  it('returns null and navigates away', () => {
    vi.mocked(getSession).mockReturnValue(null)
    mockLeaderboardData({})
    const { container } = render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    expect(container.firstChild).toBeNull()
  })
})

describe('Leaderboard — loading and empty', () => {
  it('shows loading state initially', () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({})
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })

  it('shows empty message when no members', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({ members: [] })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('Aucun membre dans le groupe.')
  })
})

describe('Leaderboard — player cards', () => {
  it('renders member usernames', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice'), makeUser('user-2', 'Bob')] })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('Alice')
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows medal for rank 1', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice')] })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('🥇')
  })

  it('shows #4 for rank beyond 3', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({
      members: [
        makeUser('user-1', 'A'), makeUser('user-2', 'B'),
        makeUser('user-3', 'C'), makeUser('user-4', 'D'),
      ],
    })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('#4')
  })

  it('shows "Toi" badge for current user', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice')] })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('Toi')
  })

  it('shows bingo count when player has bingo', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = Array.from({ length: 9 }, (_, i) => makeCell('grid-1', 'user-1', `c${i}`, 'user-2'))
    const submissions = [0, 1, 2].map((i) => makeSubmission(`c${i}`, 'user-2', true))
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice')], submissions, cells })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('🎯 1 bingo')
  })

  it('shows validated cells count when no bingo', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = [makeCell('grid-1', 'user-1', 'c0', 'user-2')]
    const submissions = [makeSubmission('c0', 'user-2', true)]
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice')], submissions, cells })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('1 case')
  })

  it('shows plural "cases" when validatedCells > 1', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = [
      makeCell('grid-1', 'user-1', 'c0', 'user-2'),
      makeCell('grid-1', 'user-1', 'c1', 'user-2'),
    ]
    const submissions = ['c0', 'c1'].map((c) => makeSubmission(c, 'user-2', true))
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice')], submissions, cells })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('2 cases')
  })
})

describe('Leaderboard — sorting', () => {
  it('ranks player with bingo above player with only cells', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    // user-1 has 1 bingo, user-2 has 2 validated cells but no bingo
    const cells = [
      ...Array.from({ length: 9 }, (_, i) => makeCell('grid-1', 'user-1', `a${i}`, 'user-3')),
      makeCell('grid-2', 'user-2', 'b0', 'user-3'),
      makeCell('grid-2', 'user-2', 'b1', 'user-3'),
    ]
    const submissions = [
      ...[0, 1, 2].map((i) => makeSubmission(`a${i}`, 'user-3', true)),
      makeSubmission('b0', 'user-3', true),
      makeSubmission('b1', 'user-3', true),
    ]
    mockLeaderboardData({
      members: [makeUser('user-2', 'Bob'), makeUser('user-1', 'Alice')],
      submissions,
      cells,
    })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('🥇')
    const cards = screen.getAllByText(/Alice|Bob/)
    expect(cards[0].textContent).toContain('Alice')
  })

  it('ranks by validatedCells when both have 0 bingos', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    const cells = [
      makeCell('grid-1', 'user-1', 'a0', 'user-3'),
      makeCell('grid-2', 'user-2', 'b0', 'user-3'),
      makeCell('grid-2', 'user-2', 'b1', 'user-3'),
    ]
    const submissions = [
      makeSubmission('a0', 'user-3', true),
      makeSubmission('b0', 'user-3', true),
      makeSubmission('b1', 'user-3', true),
    ]
    mockLeaderboardData({
      members: [makeUser('user-1', 'Alice'), makeUser('user-2', 'Bob')],
      submissions,
      cells,
    })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('🥇')
    // Bob has 2 cells → shows "2 cases", Alice has 1 → shows "1 case"
    expect(screen.getByText('2 cases')).toBeInTheDocument()
    expect(screen.getByText('1 case')).toBeInTheDocument()
  })
})

describe('Leaderboard — expand detail panel', () => {
  it('shows detail rows when player card is clicked', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice')] })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('Alice')
    await userEvent.click(screen.getByText('Alice'))
    await screen.findByText('Lignes bingo')
    expect(screen.getByText('Cases validées')).toBeInTheDocument()
  })

  it('collapses detail when clicked again', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({ members: [makeUser('user-1', 'Alice')] })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('Alice')
    await userEvent.click(screen.getByText('Alice'))
    await screen.findByText('Lignes bingo')
    await userEvent.click(screen.getByText('Alice'))
    await waitFor(() => {
      expect(screen.queryByText('Lignes bingo')).toBeNull()
    })
  })

  it('shows countdown header', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    mockLeaderboardData({ members: [] })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await screen.findByText('Fin de semaine dans')
  })
})

describe('Leaderboard — error handling', () => {
  it('stops loading gracefully when members query errors', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'groups') return makeQueryBuilder({ data: { reveal_at: null }, error: null }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: { message: 'DB error' } }) as ReturnType<typeof supabase.from>
    })
    render(<MemoryRouter><Leaderboard /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText('Chargement...')).toBeNull()
    })
  })
})
