import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import Logo from '../components/Logo'

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

type Mode = 'create' | 'join'

const GRID_OPTIONS = [
  { value: 3, label: '3×3', sub: '9 cases' },
  { value: 4, label: '4×4', sub: '16 cases' },
  { value: 5, label: '5×5', sub: '25 cases' },
]

const DURATION_OPTIONS = [
  { value: 3, label: '3 jours' },
  { value: 7, label: '1 semaine' },
  { value: 14, label: '2 semaines' },
]

export default function CreateGroup() {
  const navigate = useNavigate()

  useEffect(() => {
    if (getSession()) navigate('/game')
  }, [])

  const [mode, setMode] = useState<Mode>('create')
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [gridSize, setGridSize] = useState(3)
  const [durationDays, setDurationDays] = useState(7)
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    const invite_code = generateInviteCode()

    const { error: authError } = await supabase.auth.signInAnonymously()
    if (authError) {
      setError("Erreur d'authentification : " + authError.message)
      setLoading(false)
      return
    }

    const { error: dbError } = await supabase
      .from('groups')
      .insert({ name: name.trim(), invite_code, grid_size: gridSize, duration_days: durationDays })

    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    navigate(`/join/${invite_code}`)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = inviteCode.trim().toUpperCase()
    if (!code) return
    setLoading(true)
    setError(null)

    const { data, error: dbError } = await supabase
      .from('groups')
      .select('invite_code')
      .eq('invite_code', code)
      .single()

    if (dbError || !data) {
      setError('Code invalide. Vérifie les 6 caractères et réessaie.')
      setLoading(false)
      return
    }

    navigate(`/join/${code}`)
  }

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <Logo variant="full" />

        {/* Toggle */}
        <div style={styles.toggle}>
          <button
            type="button"
            onClick={() => { setMode('create'); setError(null) }}
            style={{ ...styles.toggleBtn, ...(mode === 'create' ? styles.toggleActive : {}) }}
          >
            Créer un groupe
          </button>
          <button
            type="button"
            onClick={() => { setMode('join'); setError(null) }}
            style={{ ...styles.toggleBtn, ...(mode === 'join' ? styles.toggleActive : {}) }}
          >
            Rejoindre
          </button>
        </div>

        {mode === 'create' ? (
          createStep === 1 ? (
            <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) setCreateStep(2) }} style={styles.form}>
              <label style={styles.label}>
                Nom du groupe
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Les potes du jeudi"
                  maxLength={40}
                  required
                  style={styles.input}
                  autoFocus
                />
              </label>
              <button
                type="submit"
                disabled={!name.trim()}
                style={{ ...styles.button, ...(!name.trim() ? styles.buttonDisabled : {}) }}
              >
                Suivant →
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate} style={styles.form}>
              {/* Grid size */}
              <div style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Taille de la grille</span>
                <div style={styles.optionRow}>
                  {GRID_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGridSize(opt.value)}
                      style={{ ...styles.optionBtn, ...(gridSize === opt.value ? styles.optionBtnActive : {}) }}
                    >
                      <span style={styles.optionMain}>{opt.label}</span>
                      <span style={styles.optionSub}>{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Durée avant révélation</span>
                <div style={styles.optionRow}>
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDurationDays(opt.value)}
                      style={{ ...styles.optionBtn, ...(durationDays === opt.value ? styles.optionBtnActive : {}) }}
                    >
                      <span style={styles.optionMain}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p style={styles.error}>{error}</p>}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setCreateStep(1)}
                  style={styles.backBtn}
                >
                  ←
                </button>
                <button type="submit" disabled={loading} style={{ ...styles.button, flex: 1 }}>
                  {loading ? 'Création...' : 'Créer le groupe →'}
                </button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleJoin} style={styles.form}>
            <label style={styles.label}>
              Code d'invitation
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ex: A3K9PZ"
                maxLength={6}
                required
                style={{ ...styles.input, letterSpacing: '0.2em', textTransform: 'uppercase' }}
                autoFocus
              />
              {inviteCode.length > 0 && inviteCode.length < 6 && (
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                  {6 - inviteCode.length} caractère{6 - inviteCode.length > 1 ? 's' : ''} manquant{6 - inviteCode.length > 1 ? 's' : ''}
                </span>
              )}
            </label>
            {error && <p style={styles.error}>{error}</p>}
            <button
              type="submit"
              disabled={loading || inviteCode.trim().length !== 6}
              style={{
                ...styles.button,
                ...(inviteCode.trim().length !== 6 ? styles.buttonDisabled : {}),
              }}
            >
              {loading ? 'Recherche...' : 'Rejoindre →'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg)',
    padding: '1rem',
  },
  card: {
    background: 'var(--color-surface)',
    borderRadius: '1.5rem',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
  },
  title: {
    fontFamily: 'var(--font-title)',
    fontWeight: 900,
    fontSize: '1.375rem',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.5px',
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  toggle: {
    display: 'flex',
    background: 'var(--color-bg)',
    borderRadius: '0.75rem',
    padding: '0.25rem',
    marginBottom: '1.75rem',
    gap: '0.25rem',
  },
  toggleBtn: {
    flex: 1,
    padding: '0.6rem',
    border: 'none',
    borderRadius: '0.5rem',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  toggleActive: {
    background: 'var(--color-border)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    color: 'var(--color-text-primary)',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  input: {
    background: 'var(--color-border)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.75rem',
    color: 'var(--color-text-primary)',
    fontSize: '1rem',
    padding: '0.75rem 1rem',
    outline: 'none',
  },
  button: {
    background: 'var(--color-indigo)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
    minHeight: '44px',
  },
  buttonDisabled: {
    background: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  fieldLabel: {
    color: 'var(--color-text-primary)',
    fontSize: '0.875rem',
    fontWeight: 700,
    fontFamily: 'var(--font-body)',
  },
  optionRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  optionBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.2rem',
    padding: '0.75rem 0.5rem',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minHeight: '44px',
  },
  optionBtnActive: {
    background: 'var(--color-indigo)',
    borderColor: 'var(--color-indigo)',
  },
  optionMain: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  optionSub: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  backBtn: {
    background: 'var(--color-border)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0 1rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  error: {
    color: 'var(--color-error)',
    fontSize: '0.875rem',
    margin: 0,
  },
}
