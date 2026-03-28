import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { saveSession } from '../lib/session'

export default function Onboarding() {
  const { invite_code } = useParams<{ invite_code: string }>()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invite_code || !username.trim()) return
    setLoading(true)
    setError(null)

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', invite_code.toUpperCase())
      .single()

    if (groupError || !group) {
      setError('Code d\'invitation invalide.')
      setLoading(false)
      return
    }

    const { data: authData, error: authError } = await supabase.auth.signInAnonymously()
    if (authError || !authData.user) {
      setError('Erreur d\'authentification : ' + (authError?.message ?? ''))
      setLoading(false)
      return
    }
    const userId = authData.user.id

    let avatarUrl: string | null = null
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }
    }

    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      group_id: group.id,
      username: username.trim(),
      avatar_url: avatarUrl,
    })

    if (insertError) {
      setError('Erreur lors de la création du profil : ' + insertError.message)
      setLoading(false)
      return
    }

    const refreshToken = authData.session?.refresh_token
    saveSession(userId, group.id, refreshToken ?? undefined)
    navigate('/game')
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <a href="/" style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </a>
        <h1 style={styles.title}>Rejoindre le groupe</h1>
      </header>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.avatarSection}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...styles.avatarCircle,
              backgroundImage: avatarPreview ? `url(${avatarPreview})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!avatarPreview && <span style={{ fontSize: '2rem' }}>📷</span>}
          </div>
          <span style={styles.avatarHint}>{avatarPreview ? 'Changer la photo' : 'Ajouter une photo'}</span>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
        </div>

        <label style={styles.label}>
          Ton pseudo
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            placeholder="ex: Nico_le_Roi"
            style={styles.input}
            autoFocus
          />
          <span style={styles.counter}>{username.length}/20</span>
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <button
          type="submit"
          disabled={loading || !username.trim()}
          style={{
            ...styles.submitBtn,
            ...(!username.trim() ? styles.submitBtnDisabled : {}),
          }}
        >
          {loading ? 'Chargement...' : 'Rejoindre le groupe 🎉'}
        </button>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem 1.25rem 2rem',
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '480px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2.5rem',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#1e1e1e',
    color: '#fff',
    flexShrink: 0,
    textDecoration: 'none',
  },
  title: {
    color: '#fff',
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.75rem',
    flex: 1,
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.625rem',
  },
  avatarCircle: {
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    background: '#2a2a2a',
    border: '2px dashed #444',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  avatarHint: {
    color: '#666',
    fontSize: '0.8rem',
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
    background: '#1e1e1e',
    border: '1px solid #333',
    borderRadius: '0.75rem',
    color: '#fff',
    fontSize: '1rem',
    padding: '0.75rem 1rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  counter: {
    color: '#555',
    fontSize: '0.75rem',
    alignSelf: 'flex-end',
  },
  submitBtn: {
    background: '#6c47ff',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 'auto',
  },
  submitBtnDisabled: {
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
