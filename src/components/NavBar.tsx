import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'

const LAST_SEEN_KEY = 'busted_feed_seen'

export default function NavBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = getSession()
  const [unseenCount, setUnseenCount] = useState(0)

  useEffect(() => {
    if (!session) return
    countUnseen()
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname === '/feed') {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
      setUnseenCount(0)
    }
  }, [location.pathname])

  async function countUnseen() {
    if (!session || location.pathname === '/feed') return
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY)

    let query = supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })

    if (lastSeen) query = query.gt('created_at', lastSeen)

    const { count } = await query
    setUnseenCount(count ?? 0)
  }

  const tabs = [
    { path: '/game', icon: GridIcon, label: 'Grille' },
    { path: '/feed', icon: FeedIcon, label: 'Feed' },
  ]

  return (
    <nav style={styles.nav}>
      {tabs.map(({ path, icon: Icon, label }) => {
        const active = location.pathname === path
        const showBadge = label === 'Feed' && unseenCount > 0

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
            <span style={styles.label}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#6c47ff' : '#555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function FeedIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#6c47ff' : '#555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#111',
    borderTop: '1px solid #1e1e1e',
    display: 'flex',
    justifyContent: 'space-around',
    padding: '0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom))',
    zIndex: 100,
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.5rem 2rem',
    borderRadius: '0.5rem',
  },
  tabActive: {},
  label: {
    fontSize: '0.7rem',
    color: '#555',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-6px',
    background: '#ef4444',
    color: '#fff',
    fontSize: '0.6rem',
    fontWeight: 700,
    borderRadius: '999px',
    minWidth: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    lineHeight: 1,
  },
}
