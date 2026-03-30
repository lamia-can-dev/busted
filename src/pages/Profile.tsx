import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession, clearSession } from '../lib/session'
import Logo from '../components/Logo'

interface UserProfile {
  id: string
  username: string
  avatar_url: string | null
  group_id: string
}

interface GroupInfo {
  id: string
  name: string
  invite_code: string
}

export default function Profile() {
  const navigate = useNavigate()
  const session = getSession()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!session) { navigate('/'); return }
    loadProfile()
  }, [])

  async function loadProfile() {
    if (!session) return

    const [userRes, groupRes, membersRes] = await Promise.all([
      supabase.from('users').select('*').eq('id', session.userId).single(),
      supabase.from('groups').select('id, name, invite_code').eq('id', session.groupId).single(),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('group_id', session.groupId),
    ])

    if (userRes.data) setUser(userRes.data as UserProfile)
    if (groupRes.data) setGroup(groupRes.data as GroupInfo)
    setMemberCount(membersRes.count ?? 0)
    setLoading(false)
  }

  function handleCopyInvite() {
    if (!group) return
    navigator.clipboard.writeText(group.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleLogout() {
    clearSession()
    navigate('/')
  }

  if (!session) return null

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Logo variant="full" />
      </header>

      {loading && <p style={styles.hint}>Chargement...</p>}

      {!loading && user && (
        <div style={styles.content}>
          {/* Avatar + name */}
          <div style={styles.avatarSection}>
            {user.avatar_url ? (
              <img src={user.avatar_url} style={styles.avatar} alt="" />
            ) : (
              <div style={styles.avatarFallback}>
                {user.username[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <h2 style={styles.username}>{user.username}</h2>
          </div>

          {/* Group info */}
          {group && (
            <div style={styles.card}>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>Groupe</span>
                <span style={styles.cardValue}>{group.name}</span>
              </div>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>Membres</span>
                <span style={styles.cardValue}>{memberCount}</span>
              </div>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>Code d'invitation</span>
                <span style={styles.inviteCode}>{group.invite_code}</span>
              </div>
              <button onClick={handleCopyInvite} style={styles.copyBtn}>
                {copied ? '✓ Code copié !' : 'Copier le code d\'invitation'}
              </button>
            </div>
          )}

          {/* Logout */}
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg)',
    paddingBottom: '6rem',
  },
  header: {
    padding: '1.5rem 1.25rem 0.5rem',
    maxWidth: '560px',
    margin: '0 auto',
  },
  content: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '1.5rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid var(--color-indigo)',
  },
  avatarFallback: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'var(--color-indigo)',
    color: '#fff',
    fontSize: '2rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '3px solid var(--color-indigo)',
  },
  username: {
    fontFamily: 'var(--font-title)',
    fontWeight: 900,
    fontSize: '1.5rem',
    color: 'var(--color-text-primary)',
    margin: 0,
    textAlign: 'center',
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '14px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  cardValue: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  inviteCode: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '1rem',
    color: 'var(--color-indigo-light)',
    letterSpacing: '0.15em',
  },
  copyBtn: {
    background: 'var(--color-indigo)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  logoutBtn: {
    background: 'transparent',
    color: 'var(--color-rose)',
    border: '1px solid var(--color-rose)',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
    marginTop: '1rem',
  },
  hint: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '1rem',
  },
}
