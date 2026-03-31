import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useLiveRefresh } from '../hooks/useLiveRefresh'

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem('busted_seen_notif_ids')
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export default function NavBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const [unseenCount, setUnseenCount] = useState(0)

  const computeUnread = useCallback(async () => {
    if (!userId) return
    // Fetch cells targeting me that have pending submissions (vote_required)
    const { data: cells } = await supabase
      .from('cells')
      .select('id, status, submissions(id)')
      .eq('target_user_id', userId)

    const seenIds = readSeenIds()
    let count = 0
    for (const cell of cells ?? []) {
      const subs = (cell.submissions ?? []) as { id: string }[]
      for (const sub of subs) {
        const notifId = `vote_required_${sub.id}`
        if (!seenIds.has(notifId) && cell.status !== 'busted' && cell.status !== 'rejected') {
          count++
        }
      }
    }
    setUnseenCount(count)
    try { localStorage.setItem('busted_unread_count', String(count)) } catch {}
  }, [userId])

  // Compute on mount + when navigating
  useEffect(() => {
    computeUnread()
  }, [location.pathname, computeUnread])

  // Poll + visibility refetch for live badge updates
  useLiveRefresh(computeUnread)

  // Listen for same-tab localStorage writes (from Activity marking as read)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'busted_unread_count') setUnseenCount(parseInt(e.newValue ?? '0', 10))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const tabs = [
    { path: '/game', icon: GridIcon, label: 'Grille' },
    { path: '/activity', icon: BellIcon, label: 'Activité' },
    { path: '/proposals', icon: VoteIcon, label: 'Actions' },
    { path: '/leaderboard', icon: TrophyIcon, label: 'Classement' },
    { path: '/profile', icon: ProfileIcon, label: 'Profil' },
  ]

  return (
    <nav style={styles.nav}>
      {tabs.map(({ path, icon: Icon, label }) => {
        const active = location.pathname === path
        const showBadge = label === 'Activité' && unseenCount > 0

        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon active={active} />
              <AnimatePresence>
                {showBadge && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    style={styles.badge}
                  >
                    {unseenCount > 9 ? '9+' : unseenCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <span style={{
              ...styles.label,
              ...(active ? styles.labelActive : {}),
            }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--color-indigo-light)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--color-indigo-light)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function VoteIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--color-indigo-light)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--color-indigo-light)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--color-indigo-light)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'var(--color-surface)',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    padding: '0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom))',
    zIndex: 100,
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.5rem 0',
    borderRadius: '0.5rem',
    minHeight: '44px',
  },
  tabActive: {
    background: 'rgba(67,97,238,0.12)',
  },
  label: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  labelActive: {
    color: 'var(--color-indigo-light)',
    fontWeight: 700,
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-6px',
    background: 'var(--color-error)',
    color: 'var(--color-text-primary)',
    fontSize: '0.75rem',
    fontWeight: 700,
    borderRadius: '999px',
    minWidth: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    lineHeight: 1,
  },
}
