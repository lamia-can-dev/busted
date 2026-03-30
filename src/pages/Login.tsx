import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { hashPassword } from '../lib/hash'
import Logo from '../components/Logo'

type Mode = 'login' | 'signup'

export default function Login() {
  const navigate = useNavigate()
  const { userId, groupId, loginAs } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (userId) {
      const pendingInvite = sessionStorage.getItem('busted_pending_invite')
      if (pendingInvite) {
        sessionStorage.removeItem('busted_pending_invite')
        navigate(`/join/${pendingInvite}`)
      } else if (groupId) {
        navigate('/game')
      } else {
        navigate('/groups')
      }
    }
  }, [userId, groupId, navigate])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError(null)

    const hash = await hashPassword(password)
    const { data, error: dbError } = await supabase
      .from('accounts')
      .select('id, password_hash')
      .eq('username', username.trim())
      .maybeSingle()

    if (dbError || !data || data.password_hash !== hash) {
      setError('Identifiant ou mot de passe incorrect.')
    } else {
      localStorage.setItem('busted_username', username.trim())
      loginAs(data.id)
    }
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.')
      return
    }
    setLoading(true)
    setError(null)

    const hash = await hashPassword(password)
    const { data, error: dbError } = await supabase
      .from('accounts')
      .insert({ username: username.trim(), password_hash: hash })
      .select()
      .single()

    if (dbError) {
      console.error('Signup error:', dbError)
      if (dbError.code === '23505') {
        setError('Ce nom d\'utilisateur est déjà pris.')
      } else {
        setError(dbError.message)
      }
    } else {
      localStorage.setItem('busted_username', username.trim())
      loginAs(data.id)
    }
    setLoading(false)
  }

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <Logo variant="full" />

        {/* Toggle */}
        <div style={styles.toggle}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null) }}
            style={{ ...styles.toggleBtn, ...(mode === 'login' ? styles.toggleActive : {}) }}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null) }}
            style={{ ...styles.toggleBtn, ...(mode === 'signup' ? styles.toggleActive : {}) }}
          >
            Inscription
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>
              Nom d'utilisateur
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: Nico_le_Roi"
                maxLength={20}
                required
                style={styles.input}
                autoFocus
              />
            </label>
            <label style={styles.label}>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={styles.input}
              />
            </label>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} style={styles.form}>
            <label style={styles.label}>
              Nom d'utilisateur
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: Nico_le_Roi"
                maxLength={20}
                required
                style={styles.input}
                autoFocus
              />
            </label>
            <label style={styles.label}>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Confirmer le mot de passe
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={styles.input}
              />
            </label>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Inscription...' : "S'inscrire"}
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
  error: {
    color: 'var(--color-error)',
    fontSize: '0.875rem',
    margin: 0,
  },
}
