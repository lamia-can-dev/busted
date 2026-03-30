// ─── Busted Design Tokens ─────────────────────────────────────
// Single source of truth for all design constants.
// Use CSS variables (var(--color-*)) in inline styles for live theming.
// Use these JS constants for logic, tests, or non-CSS contexts.

export const colors = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  border: '#2A2A4A',

  indigo: '#4361EE',
  indigoLight: '#A5B4FC',
  indigoGradientStart: '#A5B4FC',
  indigoGradientEnd: '#4361EE',

  rose: '#FF5FCC',
  roseDark: '#2D0F2A',

  textPrimary: '#F0F0FF',
  textSecondary: '#555577',

  // Semantic status (do not replace with variables)
  valid: '#22c55e',
  validBg: '#0d2018',
  validDark: '#14532d',
  invalid: '#ef4444',
  invalidBg: '#2a1010',
  invalidDark: '#3b0e0e',
  bingo: '#facc15',
  bingoBg: '#1f1a00',
  error: '#ff6b6b',
} as const

export const fonts = {
  title: "'Unbounded', sans-serif",
  body: "'Figtree', sans-serif",
} as const

export const radii = {
  card: '14px',
  button: '20px',
  sheet: '1.5rem',
  pill: '999px',
} as const

export const shadows = {
  logoIcon: '0 8px 24px rgba(67,56,202,0.45), inset 0 1px 0 rgba(255,255,255,0.4)',
  sheet: '0 -4px 40px rgba(0,0,0,0.4)',
} as const

// CSS variable references for use in inline styles
export const cv = {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  border: 'var(--color-border)',
  indigo: 'var(--color-indigo)',
  indigoLight: 'var(--color-indigo-light)',
  rose: 'var(--color-rose)',
  roseDark: 'var(--color-rose-dark)',
  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  fontTitle: 'var(--font-title)',
  fontBody: 'var(--font-body)',
} as const
