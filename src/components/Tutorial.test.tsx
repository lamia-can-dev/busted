import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Tutorial from './Tutorial'

const TEST_USER_ID = 'test-user-123'

beforeEach(() => {
  localStorage.removeItem(`busted_tutorial_done_${TEST_USER_ID}`)
})

describe('Tutorial', () => {
  it('renders first step on mount', () => {
    render(<Tutorial userId={TEST_USER_ID} onComplete={vi.fn()} />)
    expect(screen.getByText('Bienvenue sur Busted !')).toBeInTheDocument()
    expect(screen.getByText('Suivant')).toBeInTheDocument()
    expect(screen.getByText('Passer')).toBeInTheDocument()
  })

  it('navigates forward on Suivant click', async () => {
    const user = userEvent.setup()
    render(<Tutorial userId={TEST_USER_ID} onComplete={vi.fn()} />)
    await user.click(screen.getByText('Suivant'))
    await screen.findByText('Ta grille de bingo')
  })

  it('navigates back on Retour click', async () => {
    const user = userEvent.setup()
    render(<Tutorial userId={TEST_USER_ID} onComplete={vi.fn()} />)
    await user.click(screen.getByText('Suivant'))
    await screen.findByText('Ta grille de bingo')
    await user.click(screen.getByText('Retour'))
    await screen.findByText('Bienvenue sur Busted !')
  })

  it('does not show Retour on first step', () => {
    render(<Tutorial userId={TEST_USER_ID} onComplete={vi.fn()} />)
    expect(screen.queryByText('Retour')).not.toBeInTheDocument()
  })

  it('skip button sets localStorage and calls onComplete', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Tutorial userId={TEST_USER_ID} onComplete={onComplete} />)
    await user.click(screen.getByText('Passer'))
    expect(localStorage.getItem(`busted_tutorial_done_${TEST_USER_ID}`)).toBe('true')
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('completes on last step', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Tutorial userId={TEST_USER_ID} onComplete={onComplete} />)
    // Navigate to last step (6 steps total, click Suivant 5 times)
    for (let i = 0; i < 5; i++) {
      await user.click(await screen.findByText('Suivant'))
    }
    await screen.findByText('Classement & bingo')
    await user.click(screen.getByText("C'est parti !"))
    expect(localStorage.getItem(`busted_tutorial_done_${TEST_USER_ID}`)).toBe('true')
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('renders dots for each step', () => {
    const { container } = render(<Tutorial userId={TEST_USER_ID} onComplete={vi.fn()} />)
    // 6 dots for 6 steps
    const dots = container.querySelectorAll('div[style*="border-radius: 50%"]')
    // Filter to just the small navigation dots (8px wide)
    const navDots = Array.from(dots).filter((d) => {
      const style = (d as HTMLElement).style
      return style.width === '8px'
    })
    expect(navDots).toHaveLength(6)
  })
})
