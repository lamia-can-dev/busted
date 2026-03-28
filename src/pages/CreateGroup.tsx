import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

type Mode = 'create' | 'join'

export default function CreateGroup() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('create')
  const [name, setName] = useState('')
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
      setError('Erreur d\'authentification : ' + authError.message)
      setLoading(false)
      return
    }

    const { error: dbError } = await supabase
      .from('groups')
      .insert({ name: name.trim(), invite_code })

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
        <h1 style={styles.title}>Busted</h1>

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
          <form onSubmit={handleCreate} style={styles.form}>
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
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading || !name.trim()} style={styles.button}>
              {loading ? 'Création...' : 'Créer le groupe →'}
            </button>
          </form>
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
                <span style={{ color: '#888', fontSize: '0.8rem' }}>
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
    background: '#0f0f0f',
    padding: '1rem',
  },
  card: {
    background: '#1a1a1a',
    borderRadius: '1.5rem',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
  },
  title: {
    color: '#fff',
    fontSize: '1.75rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  toggle: {
    display: 'flex',
    background: '#111',
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
    color: '#888',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  toggleActive: {
    background: '#2a2a2a',
    color: '#fff',
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
    color: '#ccc',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  input: {
    background: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: '0.75rem',
    color: '#fff',
    fontSize: '1rem',
    padding: '0.75rem 1rem',
    outline: 'none',
  },
  button: {
    background: '#6c47ff',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  buttonDisabled: {
    background: '#2a2a2a',
    color: '#555',
    cursor: 'not-allowed',
  },
  error: {
    color: '#ff6b6b',
    fontSize: '0.875rem',
    margin: 0,
  },
}
